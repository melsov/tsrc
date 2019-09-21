import { MServer, ServerSimulateTickMillis } from "../../../MServer";
import { Mesh } from "babylonjs/Meshes/mesh";
import { TransformNode, Node, Scene, SceneLoader, AbstractMesh, IParticleSystem, Skeleton, Animation, AnimationGroup, Nullable, MeshBuilder, Vector3, AbstractAssetTask, MeshAssetTask, AnimationRange, TargetedAnimation, EventState } from "babylonjs";
import { MUtils } from "../../../Util/MUtils";
import { KeyMoves } from "../../MPlayerInput";
import { MAudio } from "../../../manager/MAudioManager";
import { MLoader } from "../../MAssetBook";
import { MAnimator } from "../../../loading/MAnimator";



export namespace WeaponMeshImport
{


    export function FindMeshSet(meshes : AbstractMesh[], rootNodeName : string, scene : Scene) : WeaponMeshSet
    {
        let root = MUtils.RootifiedClone(rootNodeName, meshes, scene);
        let children = MUtils.GetAllChildren(root);
        let muzzle : Nullable<TransformNode> = null;

        for(let i=0; i<children.length; ++i)
        {
            let m = children[i];
            if(m.name.toLowerCase() === 'muzzle') {
                muzzle = new TransformNode(m.name, scene);
                muzzle.position = (<TransformNode>m).position;
                muzzle.parent = m.parent;
                m.dispose();
            }
        }

        if(!muzzle) throw new Error(`didn't find a muzzle. There must be a mesh named 'mUzZLE' (case insensitive) in the mesh list. (Will turn into a transform node during import)`);

        return new WeaponMeshSet(root, muzzle);

    }

    

    
}


export type MWAnimType=MAnimator.MSkeletonAnimator;

export class GunAnimator
{
    constructor(
        public skelAnimator : MWAnimType
    ){}
}

export class GunEffects
{
    constructor(
        public fireSoundType : MAudio.SoundType,
        public animations : GunAnimator
        // TODO: Loadable particles <--actually specify-able particles blender exporter doesn't export particles
    ) 
    {}
}

class WeaponMeshSet 
{
    constructor(
        public main : TransformNode,
        public muzzle : TransformNode) {}

    // static MakePlaceholder(scene : Scene) : WeaponMeshSet
    // {
    //     let main = MeshBuilder.CreateBox(`ph-wms-${MUtils.RandomString(12)}`, {
    //         size : .5
    //     }, scene);
    //     let muzzle = MeshBuilder.CreateSphere(`muzz-${main.name}`, {
    //         diameter : .2  
    //     }, scene);

    //     muzzle.parent = main;
    //     muzzle.setPositionWithLocalVector(Vector3.Forward().scale(.8));
    //     return new WeaponMeshSet(main, muzzle);
    // }

    // get Meshes() : Mesh[] { return [ this.main ]; }

    dispose() {
        throw new Error('not implemented');
        if(this.main)
            this.main.dispose();
        if(this.muzzle)
            this.muzzle.dispose();
    }
}

export abstract class MAbstractWeapon
{

    constructor(
        public meshSet : WeaponMeshSet,
        public effects : GunEffects
    ){

        effects.animations.skelAnimator.addEndActionCallback("Reload", (ag : AnimationGroup, eventState : EventState) => {
            console.log(`end group observable: ${ag.name}`);
            this.handleReloadFinished();
        });
        
    }

    // we think fireRate needs to be a multiple of the simulate tick rate
    protected fireRateM : number = ServerSimulateTickMillis * 10;
    protected abstract get isAutomatic() : boolean;

    protected _totalAmmo : number = this.MaxAmmo(); 
    public MaxAmmo() : number { return 10; }
    public get totalAmmo() : number { return this._totalAmmo; }

    public PerPickupAmmoIncrease() : number { return 4; }
    public addAmmo() { this._totalAmmo = Math.min(this.PerPickupAmmoIncrease() + this._totalAmmo, this.MaxAmmo()); }

    protected hasAnotherClip() : boolean { return this.totalAmmo > this.PerClipAmmo(); }
    protected decrementAmmoFillClip() : void 
    {
        let refill = Math.min(this.PerClipAmmo(), this._totalAmmo);
        this._totalAmmo -= refill;
        // odd case where they are pretty low but have some ammo in the clip too (let's not worry too much)
        this._clipAmmo = Math.min(this._clipAmmo + refill, this.PerClipAmmo()); 
    }

    public PerClipAmmo() : number { return 3; }
    protected _clipAmmo : number = this.PerClipAmmo();
    public get clipAmmo() : number { return this._clipAmmo; }
    protected decrementClipAmmo() : void { this._clipAmmo = Math.max(0, this._clipAmmo - 1);}

    public abstract shouldFire(duh : KeyMoves.DownUpHold) : boolean;

    protected handleReloadFinished() : void 
    {
        this.decrementAmmoFillClip();
        console.log(`got reload finished clip: ${this.clipAmmo}, total: ${this.totalAmmo}`);
    }

    public playReload() 
    {
        if(this.totalAmmo > 0) 
        {
            // TODO: play reload using the skel animator (gun animator)
            // if(!this.effects.animations.skelAnimator.isPlaying)
            //     this.effects.animations.skelAnimator.play(false);
        }
        else 
        {
            // TODO: play an out of ammo sound perhaps a soft 'tink'
        }
    }


    // protected playEffects : () => void = () => {};
    // enableClientSideEffects() : void {
    //     this.playEffects = this.playClientSideEffects;
    // }

    // Please don't call this from sub classes. thank you
    public abstract playClientSideEffects() : void;
    
    public fire(duh : KeyMoves.DownUpHold) : boolean 
    {
        // if(!this.shouldFire(duh)) { return false; } // assume we already 'should fire' called externally
        if(this._clipAmmo <= 0) { 
            this.playReload();
            return false; 
        }

        if(this._fire()) {
            this.decrementClipAmmo();
            return true;
        }
        return false;
    }

    protected abstract _fire() : boolean;

    
    
    // TODO: reload animation


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

    static CreateHandGun(mapPackage : MLoader.MapPackage) : MHandGun
    {
        let loadedMeshData = mapPackage.assetBook.getMeshTask(MLoader.MeshFiles.Instance.shotgun.getKey());
        if(loadedMeshData === undefined) throw new Error(`couldn't find handgun asset`);
        let meshSet = WeaponMeshImport.FindMeshSet(loadedMeshData.task.loadedMeshes, "shotgun-root", mapPackage.scene);

        let gunSkel = loadedMeshData.task.loadedSkeletons[0];
        let skelAnimator = new MAnimator.MSkeletonAnimator(mapPackage.scene, gunSkel);
        if(loadedMeshData.animationBook)
            skelAnimator.addActionsFromBook(loadedMeshData.animationBook);
        else 
            throw new Error(`need an animation book`);
        
        // let anims = WeaponMeshImport.FindGunAnimations(meshSet, mapPackage.scene); // WeaponMeshImport.FindAnimations(t.loadedAnimationGroups);
        let anims = new GunAnimator(skelAnimator);
        let effects = new GunEffects(
            MAudio.SoundType.HandGunFire,
            anims);
        return new MHandGun(meshSet, effects);
    }

    // public effects : GunEffects = new GunEffects(
    //     MAudio.SoundType.HandGunFire
    //     );
        
    

    public playClientSideEffects() : void 
    {
        MAudio.MAudioManager.Instance.enqueue(this.effects.fireSoundType, this.meshSet.muzzle.position);

        // TODO: play particles
    }
 
    protected doFire(): void // need a way to only create fire effects client side
    {
        
    }
    
}