import { MServer, ServerSimulateTickMillis } from "../../../MServer";
import { Mesh } from "babylonjs/Meshes/mesh";
import { TransformNode, Node, Scene, SceneLoader, AbstractMesh, IParticleSystem, Skeleton, Animation, AnimationGroup, Nullable, MeshBuilder, Vector3, AbstractAssetTask, MeshAssetTask, AnimationRange, TargetedAnimation, EventState } from "babylonjs";
import { MUtils } from "../../../Util/MUtils";
import { KeyMoves } from "../../MPlayerInput";
import { MAudio } from "../../../manager/MAudioManager";
import { MLoader } from "../../MAssetBook";



export namespace WeaponMeshImport
{
    // const folder : string = "weapons";
    // export class files {
    //     static readonly handgun : string = "handgun.babylon"

    // }

    export function FindMeshSet(meshes : AbstractMesh[]) : WeaponMeshSet
    {
        let main : Nullable<Mesh> = null; let muzzle : Nullable<TransformNode> = null;

        for(let i=0; i<meshes.length; ++i) {
            let m = meshes[i];
            if(m.name == 'muzzle') {
                muzzle = (<Mesh> m).clone(); // muzzle not parented to main. makes importing slightly more straightfoward possibly.
            } else {
                main = (<Mesh> m).clone();
            }
        }
        if(!main || !muzzle) throw new Error(`weapon mesh import failed. main mesh: ${main !== null}. muzzle: ${muzzle !== null} `);

        return new WeaponMeshSet(main, muzzle);
    }

    

    export function FindGunAnimations(wms : WeaponMeshSet, scene : Scene) : GunAnimations
    {
        let reloadAG = MakeAnimationGroup(<AnimationRange>wms.main.getAnimationRange("Reload"), wms.Meshes, scene);
        return new GunAnimations(reloadAG);
    }


    //
    // Hands should be loaded within the same blender file as each gun
    // So create anim group maker that can include multiple meshes
    export function MakeAnimationGroup(rng : AnimationRange, meshes : Mesh[], scene : Scene) : AnimationGroup
    {
        let ag = new AnimationGroup(`${rng.name}`, scene);

        meshes.forEach((mesh) => {
            MUtils.Assert(mesh.animations.length > 0, "no animations associated with this mesh");
            
            mesh.animations.forEach((anim) => {
                let keys = anim.getKeys();
                let start = keys[0]; let end = keys[keys.length - 1];

                if(start.frame >= rng.from || end.frame <= rng.to) // inclusive condition. don't require both to be in range
                {
                    ag.addTargetedAnimation(anim, mesh);
                }
            });
        });

        return ag;
    }

    
}

// DEEP THOUGHTS: reload animations involve hands and hands hold guns in different ways per gun
// So, seems like the gun needs a way to specify what the hands should do

export type MWAnimType=AnimationGroup;

//
// encapsulate the data we need to animate
export class MBabAnimationSet
{
    constructor(
        public group : AnimationGroup,
        public animations : Animation[]
    ) {}

    play(scene : Scene) : void 
    {
        // this.animations.forEach((anim) => {
        //     scene.beginDirectAnimation(anim)
        // })
    }

}

export class GunAnimations
{
    constructor(
        public reload : MWAnimType
    ){}
}

export class GunEffects
{
    constructor(
        public fireSoundType : MAudio.SoundType,
        public animations : GunAnimations
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

    get Meshes() : Mesh[] { return [ this.main ]; }

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
        public meshSet : WeaponMeshSet,
        public effects : GunEffects
    ){

        effects.animations.reload.onAnimationGroupEndObservable.add((ag : AnimationGroup, eventState : EventState) => {
            console.log(`end group observable: ${ag.name}`);
            this.handleReloadFinished();
        });
        // effects.animations.reload.onAnimationEndObservable.add((targetedAnim : TargetedAnimation, eventState : EventState) => {
        //     console.log(`end observable: ev state: ${eventState.mask}.`);
        //     this.handleReloadFinished();
        // });
        
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
        this._clipAmmo = Math.min(this._clipAmmo + refill, this.PerClipAmmo()); // odd case where they are pretty low but have some ammo in the clip too (let's not worry too much)
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
            if(!this.effects.animations.reload.isPlaying)
                this.effects.animations.reload.play(false);
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
        let book = mapPackage.assetBook;
        let loadedMeshData = book.getMeshTask(MLoader.MeshFiles.Instance.handgun.getKey());
        if(loadedMeshData === undefined) throw new Error(`couldn't find handgun asset`);
        let meshSet = WeaponMeshImport.FindMeshSet(loadedMeshData.task.loadedMeshes);
        
        let anims = WeaponMeshImport.FindGunAnimations(meshSet, mapPackage.scene); // WeaponMeshImport.FindAnimations(t.loadedAnimationGroups);
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