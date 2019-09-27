import { Texture, ParticleSystem, Scene, Vector3, TransformNode, Nullable, Mesh, MeshBuilder } from "babylonjs";
import { MParticleType } from "../manager/MParticleType";
import { Dictionary, PriorityQueue } from "typescript-collections";
import { MLoader } from "../bab/MAssetBook";
import { MUtils } from "../Util/MUtils";

class EmitterBall
{
    constructor(
        public particles : ParticleSystem,
        public readonly emitter : Mesh
    ) 
    {
        particles.emitter = emitter;
    }

    moveTo(p : Vector3) : void 
    {
        if(this.particles.emitter instanceof Mesh) {
            // we can't move our reference to the emitter
            this.particles.emitter.position.copyFrom(p); 
        } 
    }
}


class QueueablePS
{
    constructor(
        public readonly particleType : string, // MParticleType,
        public readonly position : Vector3,
        public readonly referencePosition : Vector3
    )
    {}

    distSquared() : number { return this.position.subtract(this.referencePosition).lengthSquared(); }
}

const MAX_SIMULTANEOUS_PARTICLE_SYSTEMS = 3;

export class MParticleManager
{

    // region singleton
    private static _instance : Nullable<MParticleManager> = null;
    static get Instance() : MParticleManager { return <MParticleManager> this._instance; }
    static SetSingleton(pm : MParticleManager) : void 
    {
        if(this._instance !== null) { console.warn('setting particle manager twice?'); return; }
        this._instance = pm;
    }

    public enableParticles : boolean = true;

    // private book = new Dictionary<MParticleType, EmitterBall[]>();
    private book = new Dictionary<string, EmitterBall[]>();
    private queue = new PriorityQueue<QueueablePS>((a : QueueablePS, b: QueueablePS) => {
        return a.distSquared() < b.distSquared() ? 1 : -1;
    });

    private CreateEmitterBallRay(ps : ParticleSystem) : EmitterBall[]
    {
        let insts = new Array<EmitterBall>();
        for(let j=0; j<MAX_SIMULTANEOUS_PARTICLE_SYSTEMS; ++j)
        {
            insts.push(new EmitterBall(
                ps,
                MeshBuilder.CreatePlane(`ps-box-${j}`, { size: .01}, this.mapPackage.scene)));
        }
        return insts;
    }

    private FromJSON(jPS : any) : ParticleSystem
    {
        let ps = new ParticleSystem(jPS.name, jPS.capacity ? jPS.capacity : 200, this.mapPackage.scene);
        if(jPS.particleTexture) {
            let tex = new Texture(jPS.particleTexture, this.mapPackage.scene);
            ps.particleTexture = tex;
        }
        ps.minSize = jPS.minSize;
        ps.maxSize = jPS.maxSize;
        ps.minLifeTime = jPS.minLifeTime;
        ps.maxLifeTime = jPS.maxLifeTime;
        ps.preventAutoStart = true;
        ps.disposeOnStop = false;
        return ps;
    }

    private setupBookFromConfig() : void
    {
        let pTask = this.mapPackage.assetBook.getConfigTask(MLoader.ConfigFiles.Instance.particleSystemsConfig.getKey());
        if(!pTask) { console.warn(`didn't get a particle system config`); return; }

        let jConfig = JSON.parse(pTask.text);
        for(let i=0;i<jConfig.length; ++i) 
        {
            let ps = this.FromJSON(jConfig[i]); 
            let insts = this.CreateEmitterBallRay(ps);
            this.book.setValue(ps.name, insts);
        }
    }

    constructor(
        private readonly mapPackage : MLoader.MapPackage,
        public readonly viewer : TransformNode
    )
    {
        // DEBUG write default particle system as JSON
       
        // this.setupBook();
        this.setupBookFromConfig();

    }

    enqueue(type : string, position : Vector3) : void
    {
        this.queue.enqueue(new QueueablePS(type, position, this.viewer.position));
    }

    playAny() : void
    {
        let i = 0; let j = 0;
        while(!this.queue.isEmpty() && i++ < MAX_SIMULTANEOUS_PARTICLE_SYSTEMS)
        {
            let _type = this.queue.dequeue();
            if(_type === undefined) { break; }

            console.log(`ps to position: ${_type.position}`);
            let pss = this.book.getValue(_type.particleType);
            if(pss === undefined) { console.log(`pss undef for ${_type.particleType}`); continue; }

            for(j = 0; j < pss.length; ++j)
            {
                if(!pss[j].particles.isAlive) {
                    pss[j].moveTo(_type.position); // emitter.position.copyFrom(_type.position);
                    this.Start(pss[j].particles);
                    break;
                }

                if(j=== pss.length - 1) {
                    console.log("just play the first one");
                    pss[0].moveTo(_type.position); //.emitter.position.copyFrom(_type.position);
                    pss[0].particles.stop();
                    this.Start(pss[0].particles);
                }
            }
        }
    }

    private Start(ps : ParticleSystem) : void 
    {
        console.log(`play some particles?`);
        if(this.enableParticles) ps.start();
    }

}