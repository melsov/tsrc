import { Texture, ParticleSystem, Scene, Vector3, TransformNode, Nullable } from "babylonjs";
import { MParticleType } from "../manager/MParticleType";
import { Dictionary, PriorityQueue } from "typescript-collections";


function CreateDefaultGunParticles(scene : Scene) : ParticleSystem 
{
    let tex = new Texture("./dist/images/puff.png", scene);
    let ps = new ParticleSystem('default-weapon-ps', 200, scene);
    ps.particleTexture = tex;
    return ps;
}

class QueueablePS
{
    constructor(
        public readonly particleType : MParticleType,
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

    private static CreateParticlesForType(particleType : MParticleType, scene : Scene) : ParticleSystem
    {
        switch(particleType) {
            case MParticleType.ShotgunImpact:
            default:
                return CreateDefaultGunParticles(scene);
        }
    }

    private book = new Dictionary<MParticleType, ParticleSystem[]>();
    private queue = new PriorityQueue<QueueablePS>((a : QueueablePS, b: QueueablePS) => {
        return a.distSquared() < b.distSquared() ? 1 : -1;
    });


    private setupBook() : void
    {
        for(let i=0; i<MParticleType.NumParticleTypes; ++i)
        {
            let insts = new Array<ParticleSystem>();
            for(let j=0; j<MAX_SIMULTANEOUS_PARTICLE_SYSTEMS; ++j)
            {
                insts.push(MParticleManager.CreateParticlesForType(i, this.scene));
            }
            this.book.setValue(i, insts);
        }
    }

    constructor(
        private readonly scene : Scene,
        public readonly viewer : TransformNode
    )
    {
        this.setupBook();
    }

    enqueue(type : MParticleType, position : Vector3) : void
    {
        this.queue.enqueue(new QueueablePS(type, this.viewer.position, position));
    }

    playAny() : void
    {
        let i = 0; let j = 0;
        while(!this.queue.isEmpty() && i++ < MAX_SIMULTANEOUS_PARTICLE_SYSTEMS)
        {
            let _type = this.queue.dequeue();
            if(_type === undefined) { break; }
            let pss = this.book.getValue(_type.particleType);
            if(pss === undefined) { continue; }

            let allWerePlaying = true;
            for(j = 0; j < pss.length; ++j)
            {
                if(!pss[j].isAlive) {
                    pss[j].emitter = _type.position;
                    this.Start(pss[j]);
                    allWerePlaying = false;
                    break;
                }
            }

            if(allWerePlaying) {
                pss[0].stop();
                this.Start(pss[0]);
            }
        }
    }

    private Start(ps : ParticleSystem) : void 
    {
        if(this.enableParticles) ps.start();
    }

}