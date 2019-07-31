import { TransformNode, Scene, Engine, Mesh, Color3, Vector3, Ray, RayHelper, MeshBuilder, PickingInfo, Nullable, Tags, AbstractMesh, Camera, Vector4 } from "babylonjs";
import { GridMaterial } from "babylonjs-materials";
import { MNetworkPlayerEntity, MNetworkEntity } from "./NetworkEntity/MNetworkEntity";
import { Puppet, MSkin as MPuppetSkin } from "./MPuppetMaster";
import { MUtils } from "../Util/MUtils";
import { GameEntityTags, g_main_camera_name } from "../GameMain";
import { ProjectileType, MProjectileHitInfo } from "../MProjectileHitInfo";

const physicsNudgeDist : number = .01;
const collisionBlockMargin : number = .2; // large for debug

export const DEBUG_SPHERE_DIAMETER : number = 2;

export class MPlayerAvatar implements Puppet
{
    
    mesh : Mesh;
    debugRayHelper : RayHelper;
    fireRayHelper : RayHelper;
    private fireIndicatorMesh : Mesh;

    constructor
    (
        _scene : Scene,
        _startPos : Vector3,
        _name : string
    )
    {
        this.mesh = MeshBuilder.CreateSphere(`${_name}`, {diameter : DEBUG_SPHERE_DIAMETER}, _scene);
        let mat = new GridMaterial(`mat-${_name}`, _scene);
        this.mesh.material = mat;
        this.mesh.position.copyFromFloats(_startPos.x, _startPos.y, _startPos.z);

        Tags.AddTagsTo(this.mesh, GameEntityTags.PlayerObject);
        // this.mesh.checkCollisions = true;
        // this.mesh.isPickable = false;

        this.mesh.ellipsoid = new Vector3(1,1,1);

        this.debugRayHelper = new RayHelper(new Ray(new Vector3(), Vector3.Forward(), 0));
        this.fireRayHelper = new RayHelper(new Ray(new Vector3(), Vector3.Forward(), 0));

        this.fireIndicatorMesh = this.setupFireIndicatorMesh();
        this.toggleFireIndicator(false);
    }

    public destroy() : void 
    {
        this.mesh.dispose();
        this.fireRayHelper.dispose();
        this.debugRayHelper.dispose();
    }

    private setupFireIndicatorMesh() : Mesh
    {
        let fim = MeshBuilder.CreateSphere(`fim-${this.mesh.name}`, {
            diameter : .8
        }, this.mesh.getScene());

        fim.setParent(this.mesh);
        fim.setPositionWithLocalVector(Vector3.One());

        fim.material = new GridMaterial(`fim-mat-${this.mesh.name}`, this.mesh.getScene());
        return fim;
    }

    private toggleFireIndicator(isHit : boolean) : void
    {
        let fimMat = <GridMaterial> this.fireIndicatorMesh.material;
        fimMat.mainColor = isHit ? Color3.Red() : Color3.Blue();
    }

    public showGettingHit(prjInfo: MProjectileHitInfo) : void 
    {
        this.toggleFireIndicator(true);
        console.log(`show ray ? ${typeof prjInfo.ray} : ray: ${prjInfo.ray}`);
        this.fireRayHelper.hide();
        this.fireRayHelper.ray = prjInfo.ray;
        this.fireRayHelper.show(this.mesh.getScene(), new Color3(.9, .3, .5));

        window.setInterval(() => {
            // this.toggleFireIndicator(false);
            // this.fireRayHelper.hide();
        }, 4);
    }

    private getAimVector() : Vector3 
    {
        // // incorrect: screen space method attempt
        // let m = MUtils.GetMVP(<Camera>this.mesh.getScene().getCameraByName(g_main_camera_name));
        // let screenPos = Vector3.TransformCoordinates(this.mesh.position, m); 
        // let mouse = new Vector3(this.mesh.getScene().pointerX, this.mesh.getScene().pointerY, 0);
        // let mouseDif = mouse.subtract(mid);
        // let d = mouse.subtract(screenPos);
        // return new Vector3(d.x, 0, d.y);

        return new Vector3(1, 0, 0);
        // return this.rayMousePick();
    }

    private rayMousePick() : Vector3
    {
        // for now top down aiming (for testing purposes)
        let pr = this.mesh.getScene().pick(this.mesh.getScene().pointerX, this.mesh.getScene().pointerY, (mesh) => {
            return GameEntityTags.HasTag(mesh, GameEntityTags.MousePickPlane);
        });
        if(pr && pr.hit && pr.pickedPoint)
        {
            console.log(`got mouse pick: ${pr.pickedPoint}`);
            let result = pr.pickedPoint.subtract(this.mesh.position);
            result.y = 0;
            result.normalize();
            return result;
        } else console.log('no mouse hite');
        return new Vector3(1, 0, 1); // for now
    }

    public get currentProjectileType() : ProjectileType { return ProjectileType.GenericLaser; }

    public commandFire() : Nullable<PickingInfo>
    {
        let ray = new Ray(this.mesh.position.clone(), this.getAimVector(), 30); 
        let pi = this.mesh.getScene().pickWithRay(ray, (mesh) => {
            if(mesh === this.mesh) return false;
            if(mesh.name === `${this.mesh.name}-shadow`) return false; // don't hit our own shadow
            let tgs = <string | null> Tags.GetTags(mesh, true); 
            if(tgs === null) return false;
            return tgs.indexOf(GameEntityTags.Terrain) >= 0 
            // || tgs.indexOf(GameEntityTags.PlayerObject) >= 0 
            || tgs.indexOf(GameEntityTags.Shadow) >= 0; // only shadows?
        });

        return pi;
    }

    public addDebugLinesInRenderLoop() : void
    {
        this.mesh.getScene().getEngine().runRenderLoop(() => {
            //show aim vector
            let aimRay = new Ray(this.mesh.position, this.getAimVector().normalizeToNew(), 5);
            this.fireRayHelper.hide();
            this.fireRayHelper.ray = aimRay;
            this.fireRayHelper.show(this.mesh.getScene(), Color3.Purple());
        });
    }

    public customize(skin : MPuppetSkin) : void
    {
        let gridMat : GridMaterial = <GridMaterial> this.mesh.material;
        gridMat.mainColor = skin.color;
    }

    private get boundsRadius() : number { return 1.0; } 


    private rayDebugLines() : void
    {
        this.DrawDebugRayInDirection(new Vector3(-1, 0, 0));
    }
    
    private DrawDebugRayInDirection(dir : Vector3) : void
    {
        // let udif = dir.normalizeToNew();
        // let origin = this.mesh.position.add(udif.scale(this.boundsRadius + .2));
        // let mag = 3;
        // // ray way:
        // let ray = new Ray(origin, dir, mag);
        // let pickResult = this.mesh.getScene().pickWithRay(ray, (mesh) => {
        //     if(!mesh.isPickable)
        //         return false;
        //     if(mesh.name === this.mesh.name)
        //         return false;
        //     return true;
        // });

        // this.debugRayHelper.hide();
        // // this.debugRayHelper = new RayHelper(ray);
        
        // if(pickResult && pickResult.hit)
        // {
        //     if(pickResult.pickedPoint) {
        //         this.debugRayHelper.ray = MUtils.RayFromTo(origin, pickResult.pickedPoint.subtract(udif.scale(.2)));
        //         this.debugRayHelper.show(this.mesh.getScene(), Color3.Red());
        //         // account for bounding radius
        //     }
        // }
    }

    // TODO: shoot / cmdFire rays

    private moveToPosWithRayCollisions(pos : Vector3, depth ? : number) : void
    {
        if(MUtils.VecContainsNan(this.mesh.position))
        {
            this.mesh.position.copyFrom(pos);
            return;
        }

        let dir = pos.subtract(this.mesh.position);
        let mag =  dir.length();
  
        let udir = dir.normalizeToNew();
        let origin = this.mesh.position; 
        // ray way:
        mag = this.boundsRadius + 2.3;
        let ray = new Ray(origin, udir, mag);
        this.debugRayHelper.ray = ray;

        let pickResult = this.mesh.getScene().pickWithRay(ray, (mesh : AbstractMesh) => {
            if(!mesh.isPickable)
                return false;
            let tgs = Tags.GetTags(mesh);
            return typeof(tgs) === 'string' && tgs.indexOf(GameEntityTags.Terrain) >= 0;
            // return tgs === GameEntityTags.Terrain;
        });
        
        if(pickResult && pickResult.hit)
        {
            let normal = pickResult.getNormal(true, true);
            if(normal)
            {
                // straight into a wall
                if(Vector3.Dot(normal, udir) < -.99) {
                    this.debugRayHelper.show(this.mesh.getScene(), Color3.Red());
                    return;
                } 

                // recur with a projection of the desired direction
                if(depth == undefined) depth = 0;
                if(depth < 3) {
                    let nProjection = MUtils.ProjectOnNormal(dir, normal);
                    this.moveToPosWithRayCollisions(this.mesh.position.add(nProjection), ++depth);
                }
                return;
            }

        }

        this.debugRayHelper.show(this.mesh.getScene(), Color3.Green());
        this.mesh.position.copyFrom(pos);

    }

    // TODO: de-weird collisions.  
    // TODO: determine when to move with collision checks
    // perhaps:
    //    not during entity interp
    //    yes during srvr apply commands
    //    yes during cli apply commands (prediction and reconciliation)
    //    but not while applying the authoritative state per the srvr.
    //      in fact, set the whole srvr authoratitive state for all entities.
    //       then re-apply cli commands (if we're not doing this already).

    // CONSIDER: players don't collide!

    private moveMesh(offset : Vector3) : void
    {
        MUtils.AssertVecNotNan(offset);
        this.mesh.position.addInPlace(offset);
    }

    private moveWithEnt(ent : MNetworkEntity) : void
    {
        let npe = <MNetworkPlayerEntity>(<unknown> ent);
        if(!MUtils.VecContainsNan(npe.position)) {
            if(MUtils.VecContainsNan(this.mesh.position)) { // new mesh perhaps?
                this.mesh.position.copyFrom(npe.position);
            } else {
                this.moveMesh(npe.position.subtract(this.mesh.position));
            }
        }
    }
    
    applyNetEntityUpdateIngoreCollisions(ent: MNetworkEntity): void 
    {
        this.moveWithEnt(ent);
        // let npe = <MNetworkPlayerEntity>(<unknown> ent);
        // if(!MUtils.VecContainsNan(npe.position)){
        //     this.mesh.position.copyFrom(npe.position);
        // }
    }

    public applyNetworkEntityUpdate(ne : MNetworkEntity) : void
    {
        let npe = <MNetworkPlayerEntity>(<unknown>ne);
        this.moveToPosWithRayCollisions(npe.position.clone());
        return;

    }

}