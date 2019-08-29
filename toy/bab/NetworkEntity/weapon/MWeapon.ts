import { MServer, ServerSimulateTickMillis } from "../../../MServer";
import { Mesh } from "babylonjs/Meshes/mesh";
import { TransformNode, Node, Scene, SceneLoader, AbstractMesh, IParticleSystem, Skeleton, AnimationGroup, Nullable, MeshBuilder, Vector3 } from "babylonjs";
import { MUtils } from "../../../Util/MUtils";
import { KeyMoves } from "../../MPlayerInput";
import { MAudio } from "../../../manager/MAudioManager";
import { MLoader } from "../../MAssetBook";



export namespace WeaponMeshImport
{
    const folder : string = "weapons";
    export class files {
        static readonly handgun : string = "handgun.babylon"

    }
    

    function FullURL(fileName : string) : string { return `./models/${folder}/${fileName}`; }

    /*
    export function CreateWeapon<T extends MAbstractWeapon>(fileName : string, scene : Scene, c : new(mset : WeaponMeshSet) => T, onSuccess : (weapon : T) => void) : void 
    {
        SceneLoader.ImportMesh(null, `./models/${folder}`, fileName, scene, (meshes : AbstractMesh[], particleSystems : IParticleSystem[], skels : Skeleton[], animGroups : AnimationGroup[]) => {
            let main : Nullable<Mesh> = null; let muzzle : Nullable<TransformNode> = null;
            for(let i=0; i<meshes.length; ++i) {
                let m = meshes[i];
                if(m.name == 'muzzle') {
                    muzzle = m;
                } else {
                    main = <Mesh>m;
                }
            }
            if(!main || !muzzle) throw new Error(`weapon mesh import failed. main mesh: ${main !== null}. muzzle: ${muzzle !== null} `);

            let meshSet = new WeaponMeshSet(main, muzzle);
            onSuccess(new c(meshSet));
        });
    }
    */

    export function FindMeshSet(meshes : AbstractMesh[]) : WeaponMeshSet
    {
        let main : Nullable<Mesh> = null; let muzzle : Nullable<TransformNode> = null;
        for(let i=0; i<meshes.length; ++i) {
            let m = meshes[i];
            if(m.name == 'muzzle') {
                muzzle = m;
            } else {
                main = <Mesh>m;
            }
        }
        if(!main || !muzzle) throw new Error(`weapon mesh import failed. main mesh: ${main !== null}. muzzle: ${muzzle !== null} `);

        return new WeaponMeshSet(main, muzzle);
    }

    export function CreateWeaponMeshSet(fileName : string, scene : Scene, onSuccess : (weapMeshSet : WeaponMeshSet) => void) : void 
    {
        SceneLoader.ImportMesh(null, `./models/${folder}/`, fileName, scene, 
            (meshes : AbstractMesh[], particleSystems : IParticleSystem[], skels : Skeleton[], animGroups : AnimationGroup[]) => {
                // let main : Nullable<Mesh> = null; let muzzle : Nullable<TransformNode> = null;
                // for(let i=0; i<meshes.length; ++i) {
                //     let m = meshes[i];
                //     if(m.name == 'muzzle') {
                //         muzzle = m;
                //     } else {
                //         main = <Mesh>m;
                //     }
                // }
                // if(!main || !muzzle) throw new Error(`weapon mesh import failed. main mesh: ${main !== null}. muzzle: ${muzzle !== null} `);
    
                let meshSet = FindMeshSet(meshes); // new WeaponMeshSet(main, muzzle);
            onSuccess(meshSet);
        });
    }

    // this is why we need to pre-load assets
    export function CreateWeaponLazyLoadMeshSet<T extends MAbstractWeapon>(
        meshSetFileName : string, 
        scene : Scene, 
        c : new(mset : WeaponMeshSet) => T,
        onLoaded : (weap : T) => void) : T 
    {
        let weap = new c(WeaponMeshSet.MakePlaceholder(scene));
        CreateWeaponMeshSet(meshSetFileName, scene, (weapMeshSet) => {
            weap.meshSet.dispose();
            weap.meshSet = weapMeshSet;
            onLoaded(weap);
        });

        return weap;
    }
    
}


export class GunEffects
{
    constructor(
        public fireSoundType : MAudio.SoundType
        // TODO: Loadable particles
    ) 
    {}
}

class WeaponMeshSet 
{
    constructor(
        public main : Mesh,
        public muzzle : TransformNode) {}

    static MakePlaceholder(scene : Scene) : WeaponMeshSet
    {
        let main = MeshBuilder.CreateBox(`ph-wms-${MUtils.RandomString(12)}`, {
            size : .5
        }, scene);
        let muzzle = MeshBuilder.CreateSphere(`muzz-${main.name}`, {
            diameter : .2  
        }, scene);

        muzzle.parent = main;
        muzzle.setPositionWithLocalVector(Vector3.Forward().scale(.8));
        return new WeaponMeshSet(main, muzzle);
    }

    dispose() {
        if(this.main)
            this.main.dispose();
        if(this.muzzle)
            this.muzzle.dispose();
    }
}

export abstract class MAbstractWeapon
{

    constructor(
        public meshSet : WeaponMeshSet
    ){}

    public abstract effects : GunEffects;
    // we think fireRate needs to be a multiple of the simulate tick rate
    protected fireRateM : number = ServerSimulateTickMillis * 10;
    protected abstract get isAutomatic() : boolean;

    protected _ammo : number = this.MaxAmmo(); 
    public MaxAmmo() : number { return 10; }
    public get ammo() : number { return this._ammo; }
    public addAmmo(amt : number) { this._ammo = Math.min(amt + this._ammo, this.MaxAmmo()); }
    protected decrementAmmo() : void { this._ammo = Math.max(0, this.ammo - 1); }
    
    public abstract shouldFire(duh : KeyMoves.DownUpHold) : boolean;

    // protected playEffects : () => void = () => {};
    // enableClientSideEffects() : void {
    //     this.playEffects = this.playClientSideEffects;
    // }

    // Please don't call this from sub classes. thank you
    public abstract playClientSideEffects() : void;
    
    public fire(duh : KeyMoves.DownUpHold) : boolean 
    {
        // if(!this.shouldFire(duh)) { return false; } // assume we already 'should fire' called externally
        if(this._ammo <= 0) { 
            return false; 
        }

        if(this._fire()) {
            this.decrementAmmo();
            return true;
        }
        return false;
    }

    protected abstract _fire() : boolean;

    
    
    // TODO: reload animation

    static FindMuzzleChild(gunMesh : Mesh) : TransformNode
    {
        gunMesh.getChildren().forEach((node : Node, idx : number, array : Node[]) => {
            if(node.name === "muzzle") { return node; }
        });

        throw new Error(`couldn't find muzzle child in ${gunMesh.name}`);
    }

}

export abstract class MVoluntaryWeapon extends MAbstractWeapon
{
    private isTimeoutFinished : boolean = true;
    protected get isAutomatic() : boolean { return false; }

    public shouldFire(duh : KeyMoves.DownUpHold) : boolean { return this.isTimeoutFinished && duh === KeyMoves.DownUpHold.Down; }

    protected _fire() : boolean 
    {
        if(this.isTimeoutFinished) 
        {
            this.isTimeoutFinished = false;
            window.setTimeout(() => {
                this.isTimeoutFinished = true;
            }, this.fireRateM);

            this.doFire();
            // this.playEffects();
            return true;
        }
        return false;
    }

    protected abstract doFire() : void;
}


//TODO: simply test out importing
export class MHandGun extends MVoluntaryWeapon
{

    static CreateHandGun(book : MLoader.AssetBook) : MHandGun
    {
        let t = book.getMeshTask(MLoader.MeshFiles.Instance.handgun.getKey());
        if(t === undefined) throw new Error(`couldn't find handgun asset`);
        let meshSet = WeaponMeshImport.FindMeshSet(t.loadedMeshes);
        return new MHandGun(meshSet);
    }

    public effects : GunEffects = new GunEffects(
        MAudio.SoundType.HandGunFire
        );
        
    

    public playClientSideEffects() : void 
    {
        MAudio.MAudioManager.Instance.enqueue(this.effects.fireSoundType, this.meshSet.muzzle.position);

        // TODO: play particles
    }
 
    protected doFire(): void // need a way to only create fire effects client side
    {
        
    }
    
}