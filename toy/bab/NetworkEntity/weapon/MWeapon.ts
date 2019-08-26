import { MServer, ServerSimulateTickMillis } from "../../../MServer";
import { Mesh } from "babylonjs/Meshes/mesh";
import { TransformNode, Node, Scene, SceneLoader, AbstractMesh, IParticleSystem, Skeleton, AnimationGroup, Nullable, MeshBuilder, Vector3 } from "babylonjs";
import { MUtils } from "../../../Util/MUtils";



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

    export function CreateWeaponMeshSet(fileName : string, scene : Scene, onSuccess : (weapMeshSet : WeaponMeshSet) => void) : void 
    {
        SceneLoader.ImportMesh(null, `./models/${folder}/`, fileName, scene, (meshes : AbstractMesh[], particleSystems : IParticleSystem[], skels : Skeleton[], animGroups : AnimationGroup[]) => {
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
    // we think fireRate needs to be a multiple of the simulate tick rate
    protected fireRateM : number = ServerSimulateTickMillis * 10;
    protected abstract get isAutomatic() : boolean;
    
    
    protected abstract _fire() : void;

    
    
    // TODO: reload animation

    static FindMuzzleChild(gunMesh : Mesh) : TransformNode
    {
        gunMesh.getChildren().forEach((node : Node, idx : number, array : Node[]) => {
            if(node.name === "muzzle") { return node; }
        });

        throw new Error(`couldn't find muzzle child in ${gunMesh.name}`);
    }

    constructor(
        public meshSet : WeaponMeshSet
    ){
    }

}

export abstract class MVoluntaryWeapon extends MAbstractWeapon
{
    private isFireAvailable : boolean = true;
    protected get isAutomatic() : boolean { return false; }

    protected _fire() : void 
    {
        if(this.isFireAvailable) {
            this.isFireAvailable = false;
            window.setTimeout(() => {
                this.isFireAvailable = true;
            }, this.fireRateM);

            this.doFire();
        }
    }

    protected abstract doFire() : void;
}


//TODO: simply test out importing
export class MHandGun extends MVoluntaryWeapon
{
    protected doFire(): void 
    {
        throw new Error("Method not implemented.");
    }
    
}