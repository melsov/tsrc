import { Animation, TransformNode, Scene, Engine, Mesh, Color3, Vector3, Ray, RayHelper, MeshBuilder, PickingInfo, Nullable, Tags, AbstractMesh, Camera, Vector4, Quaternion, SceneLoader, Skeleton } from "babylonjs";
import { GridMaterial } from "babylonjs-materials";
import { MNetworkPlayerEntity, MNetworkEntity, CliTarget as EnTarget, CliTarget, InterpData } from "./NetworkEntity/MNetworkEntity";
import { Puppet, MLoadOut as MPuppetSkin } from "./MPuppetMaster";
import { MUtils } from "../Util/MUtils";
import { GameEntityTags, g_main_camera_name } from "../GameMain";
import { ProjectileType, MProjectileHitInfo } from "./NetworkEntity/transient/MProjectileHitInfo";
import { MFlopbackTimer } from "../helpers/MFlopbackTimer";
import { CliCommand, KeyMoves } from "./MPlayerInput";
import { ServerSimulateTickMillis } from "../MServer";
import { MJumpCurve, JumpState } from "../helpers/MCurve";
import { MAudio } from "../manager/MAudioManager";
import { WeaponMeshImport, MHandGun } from "./NetworkEntity/weapon/MWeapon";
import { MLoader } from "./MAssetBook";
import { MArsenal } from "./NetworkEntity/weapon/MArsenal";

const physicsNudgeDist : number = .01;
const collisionBlockMargin : number = .2; // large for debug

export const DEBUG_SPHERE_DIAMETER : number = 2;
export const PLAYER_GRAVITY : number = -3;
export const MAX_HEALTH : number = 5;


const corners : Array<Vector3> = [
    new Vector3(1, 0, 1), 
    new Vector3(-1, 0, 1),
    new Vector3(-1, 0, -1),
    new Vector3(1, 0, 1)
];

const clearance : number = 2.3;

export class MPlayerAvatar implements Puppet
{
    
    mesh : Mesh;
    debugRayHelper : RayHelper;
    fireRayHelper : RayHelper;
    private fireIndicatorMesh : Mesh;

    public lastCliTarget : EnTarget = new EnTarget();
    public cliTarget : EnTarget = new EnTarget();

    private debugLastFireDir : Vector3 = Vector3.Forward();

    private headFeetCheckRays : Array<Ray> = new Array<Ray>(4); // garbage collection relief
    private hfPickResult : Nullable<PickingInfo> = null;

    private _grounded : boolean = false;
    public get grounded() : boolean { return this._grounded; }
    private groundY : number = 0;
    private velocityY : number = 0;
    public shouldJump : boolean = false;
    private didJumpStart : MFlopbackTimer = new MFlopbackTimer(5);
    private jumpCurve : MJumpCurve = new MJumpCurve(PLAYER_GRAVITY, 3);

    private MAX_MULTI_JUMPS = 3;
    private remainingJumps = 3;

    public moveSpeed : number = .1;
    
    private debugShowHitTimer : MFlopbackTimer = new MFlopbackTimer(3);
    private debugHitPointMesh : Mesh;

    public readonly arsenal : MArsenal;

    constructor
    (
        _scene : Scene,
        _startPos : Vector3,
        _name : string,
        assetBook : MLoader.AssetBook
    )
    {
        this.mesh = MeshBuilder.CreateSphere(`${_name}`, {diameter : DEBUG_SPHERE_DIAMETER / 3}, _scene); // happy tsc.mesh will be set elsewhere
        this.mesh.checkCollisions = true;
        this.mesh.ellipsoid = new Vector3(1,1,1);
        this.mesh.position.copyFromFloats(_startPos.x, _startPos.y, _startPos.z);
        this.fireIndicatorMesh = this.setupFireIndicatorMesh(); // make tsc happy
        this.debugHitPointMesh = MeshBuilder.CreateBox(`dbg-hit-point-${_name}`, { size : .5}, _scene);
        // this.toggleFireIndicator(false);

        this.importCharacter(_name, _scene, _startPos);

        this.debugRayHelper = new RayHelper(new Ray(new Vector3(), Vector3.Forward(), 0));
        this.fireRayHelper = new RayHelper(new Ray(new Vector3(), Vector3.Forward(), 0));


        for(let i=0; i < this.headFeetCheckRays.length; ++i) { this.headFeetCheckRays[i] = new Ray(new Vector3(), new Vector3(), clearance * 3.1); } // debug shoudl be 1.1 not 3.1

        this.arsenal = MArsenal.MakeDefault(assetBook);
        this.setupDefaultWeapon();

    }

    private setupDefaultWeapon() : void 
    {
        let w = this.arsenal.equipped();
        w.meshSet.main.parent = this.mesh;
        // TODO: if cli owned. attach to camera
        w.meshSet.main.setPositionWithLocalVector(new Vector3(-1, 0, 2));
    }

    private importCharacter(_name : string, _scene : Scene, _pos : Vector3) : void
    {
        SceneLoader.ImportMesh( null, './models/', 'golf.babylon', _scene, (meshes, particleSystems, animationGroups) => {
            meshes.forEach((m) => {
                console.log(`${_name}: char import: ${m.name}`);
                //if(m.name === 'Head') {
                    this.characterImportCallback(<Mesh>m, _name, _scene, _pos);
                //}

                // console.log(`num anims on mesh m: ${m.animations.length}`);
                // m.animations.forEach((anim : Animation, index : number, array : Animation[]) => {
                //     console.log(`begin anim: ${anim.name}`);
                //     _scene.beginAnimation(anim, 0, 100, true);
                // });
            });

            console.log(`num anim groups: ${animationGroups.length}`);
            // animationGroups.forEach((skel : Skeleton, idx : number, array : Skeleton[]) => {
            //     console.log(`anim: ${skel.name} idx: ${idx}, skels: ${JSON.stringify(array)}`);
            // });
        });
    }
    
    private characterImportCallback(m : Mesh, _name : string, _scene : Scene, _startPos : Vector3) : void 
    {
        //m.name = `${_name}-body`;
        Tags.AddTagsTo(this.mesh, GameEntityTags.PlayerObject);
        m.material = new GridMaterial(`mat-${_name}`, _scene);
        
        // this.mesh.isPickable = false;
        m.parent = this.mesh;

        
    }

    private makeNoseMesh() : void 
    {
        let nose = MeshBuilder.CreateBox('nose', { size : DEBUG_SPHERE_DIAMETER * .3}, this.mesh.getScene());
        Tags.AddTagsTo(nose, GameEntityTags.InvisibleToRaycasts);
        nose.parent = this.mesh;
        nose.setPositionWithLocalVector(new Vector3(0, 0, DEBUG_SPHERE_DIAMETER * .4));
    }

    getInterpData() : InterpData 
    {
        let id = new InterpData();
        id.position.copyFrom(this.mesh.position);
        id.rotation.copyFrom(this.mesh.rotation);
        return id;
    }

    setInterpData(id : InterpData) : void
    {
        this.mesh.position.copyFrom(id.position);
    }

    getBoundsCorners() : Vector3[]
    {
        let corners = new Array<Vector3>();
        corners.push(this.mesh.position.clone());
        // corners.push(this.mesh.position.add(this.mesh.ellipsoid.scale(.6)));
        // corners.push(this.mesh.position.add(this.mesh.ellipsoid.scale(-.6)));
        return corners;
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
        fim.setPositionWithLocalVector(Vector3.One().add(new Vector3(0, 0, .8)));

        fim.material = new GridMaterial(`fim-mat-${this.mesh.name}`, this.mesh.getScene());
        return fim;
    }

    private toggleFireIndicator(isHit : boolean) : void
    {
        let fimMat = <GridMaterial> this.fireIndicatorMesh.material;
        fimMat.mainColor = isHit ? Color3.Red() : Color3.Blue();
    }

    private paintFireIndicator(c : Color3) : void 
    {
        let fimMat = <GridMaterial> this.fireIndicatorMesh.material;
        fimMat.mainColor = c;
    }

    public showGettingHit(prjInfo: MProjectileHitInfo) : void 
    {
        this.debugShowHitTimer.start();
        //this.toggleFireIndicator(true);
        this.fireRayHelper.hide();
        this.fireRayHelper.ray = prjInfo.ray;
        this.fireRayHelper.show(this.mesh.getScene(), new Color3(.9, .3, .5));

        this.debugHitPointMesh.position = prjInfo.hitPoint;
    }

    private setHeadFeetRays(yDir : number) : void
    {
        let middle = new Vector3(0, this.mesh.ellipsoid.y * .5 * yDir, 0).add(this.mesh.position); 
        for(let i=0; i < 4; ++i)
        {
            this.headFeetCheckRays[i].origin.copyFromFloats(middle.x + corners[i].x, middle.y, middle.z + corners[i].z);
            this.headFeetCheckRays[i].direction.copyFromFloats(0, yDir, 0);
        }
    }

    // private getAimVector() : Vector3 
    // {
    //     // // incorrect: screen space method attempt
    //     // let m = MUtils.GetMVP(<Camera>this.mesh.getScene().getCameraByName(g_main_camera_name));
    //     // let screenPos = Vector3.TransformCoordinates(this.mesh.position, m); 
    //     // let mouse = new Vector3(this.mesh.getScene().pointerX, this.mesh.getScene().pointerY, 0);
    //     // let mouseDif = mouse.subtract(mid);
    //     // let d = mouse.subtract(screenPos);
    //     // return new Vector3(d.x, 0, d.y);

    //     return new Vector3(1, 0, 0);
    //     // return this.rayMousePick();
    // }

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

    get currentProjectileType() : ProjectileType { return ProjectileType.GenericLaser; }

    // server
    commandFire(duh : KeyMoves.DownUpHold, forward : Vector3) : Nullable<PickingInfo>
    {
        if(!this.arsenal.equipped().shouldFire(duh)) {
            return null;
        }

        this.arsenal.equipped().fire(duh);

        this.debugLastFireDir.copyFrom(forward);
        let ray = new Ray(this.mesh.position.clone(), forward, 30); 
        let pi = this.mesh.getScene().pickWithRay(ray, (mesh) => {
            if(mesh === this.mesh) return false;
            if(mesh.name === `${this.mesh.name}-shadow`) return false; // don't hit our own shadow
            let tgs = <string | null> Tags.GetTags(mesh, true); 
            if(tgs === null) return false;
            return tgs.indexOf(GameEntityTags.Terrain) >= 0 
            || tgs.indexOf(GameEntityTags.PlayerObject) >= 0 
            || tgs.indexOf(GameEntityTags.Shadow) >= 0; // only shadows?
        });

        return pi;
    }
    
    // client owned player
    animateFire(duh : KeyMoves.DownUpHold) : void 
    {
        // if(!this.arsenal.equipped().fire(duh)) {
        //     return;
        // }
        // MAudio.MAudioManager.Instance.enqueue(MAudio.SoundType.HandGunFire, this.mesh.position);
        this.arsenal.equipped().playClientSideEffects();
    }


    public addDebugLinesInRenderLoop() : void
    {
        this.mesh.getScene().getEngine().runRenderLoop(() => {
            //show aim vector
            let aimRay = new Ray(this.mesh.position, this.debugLastFireDir, 5);
            this.fireRayHelper.hide();
            this.fireRayHelper.ray = aimRay;
            this.fireRayHelper.show(this.mesh.getScene(), Color3.Purple());
        });
    }

    public customize(skin : MPuppetSkin) : void
    {
        // let gridMat : GridMaterial = <GridMaterial> this.mesh.material;
        // gridMat.mainColor = skin.color; // want

        // WANT BUT, long story: keep this out at the moment. Otherwise spaghetti.
        // Why the spaghetti. well... because MWorldStates store actual network entities.
        // but there are really two kinds of network entites: the ones in the game and the ones used in state snapshots.
        // the pure-data, state entities should be another class (which already exists and whose name is SendData?)
        // MPuppetMaster came into existence largely in order to avoid having the state type entities create their own PlayerAvatars
        // PuppetMaster helped in this because it provided a way for in game states to get actual puppets (Player Avatars), sort of lazily,
        // and state type entities never ask for their actual puppets (they just use their PlaceholderPuppets).
        // PROPOSAL: SendData should be stored in the world state snapshots?
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

    private updateGrounded() : void
    {
        this.setHeadFeetRays(-1);
        for(let i=0; i < this.headFeetCheckRays.length; ++i)
        {
            this.hfPickResult = null;
            this.hfPickResult = this.mesh.getScene().pickWithRay(this.headFeetCheckRays[i], (mesh) => {
                return this.pickTerrain(mesh);
            });

            if(this.hfPickResult && this.hfPickResult.hit && this.hfPickResult.pickedPoint) 
            { 
                this.groundY = this.hfPickResult.pickedPoint.y;
                this._grounded = true;
                this.velocityY = 0;
                return;
            }
        }
        this._grounded = false;
    }


    private escapeBuriedInTerrain() : void 
    {
        throw new Error('not impld');
    }

    private applyGravity(dt : number) : void
    {

        if(this.jumpCurve.state === JumpState.NOT_JUMPING) 
        { 
            if(this.grounded)
            {
                this.cliTarget.interpData.position.y = this.groundY + clearance;
            } else 
            {
                this.jumpCurve.state = JumpState.DESCENDING;
            }
        } 
        
        if(this.jumpCurve.state !== JumpState.NOT_JUMPING) 
        {
           // apply jump delta (but max() to protect against falling too fast)
            this.cliTarget.interpData.position.y += Math.max(PLAYER_GRAVITY / 2.0, this.jumpCurve.delta); 

            if(this.grounded && this.jumpCurve.state === JumpState.DESCENDING) {
                if(this.groundY + clearance > this.cliTarget.interpData.position.y) {
                    this.cliTarget.interpData.position.y = this.groundY + clearance;
                    this.jumpCurve.state = JumpState.NOT_JUMPING;
                    this.remainingJumps = this.MAX_MULTI_JUMPS;
                }
            }
        }

    }


    public jump() : void 
    {
        if((this.grounded  && this.jumpCurve.state === JumpState.NOT_JUMPING) || 
            (this.remainingJumps > 0 && this.jumpCurve.normalizedCurvePosition > .35)) {
            this.remainingJumps--;
            this.jumpCurve.state = JumpState.ASCENDING;
        }

    }

    private pickTerrain(mesh : AbstractMesh) : boolean
    {
        if(!mesh.isPickable)
                return false;
        let tgs = Tags.GetTags(mesh);
        return typeof(tgs) === 'string' && tgs.indexOf(GameEntityTags.Terrain) >= 0;
    }

    public getRayCollisionAdjustedPos(pos : Vector3, depth ? : number) : Vector3
    {
        if(MUtils.VecContainsNan(this.mesh.position))
        {
            return pos.clone();
        }

        let dir = pos.subtract(this.mesh.position);
        let mag =  dir.length();
  
        let udir = dir.normalizeToNew();
        let origin = this.mesh.position; 

        // ray way:
        mag = this.boundsRadius + .3;
        let ray = new Ray(origin, udir, mag);
        this.debugRayHelper.ray = ray;

        let pickResult = this.mesh.getScene().pickWithRay(ray, (mesh : AbstractMesh) => {
            return this.pickTerrain(mesh);
        });
        
        if(pickResult && pickResult.hit)
        {
            let normal = pickResult.getNormal(true, true);
            if(normal)
            {
                // straight into a wall
                if(Vector3.Dot(normal, udir) < -.99) {
                    this.debugRayHelper.show(this.mesh.getScene(), Color3.Red());
                    return this.mesh.position.clone();
                } 

                // recur with a projection in the direction along the wall
                if(depth == undefined) depth = 0;
                if(depth < 3) {
                    let nProjection = MUtils.ProjectOnNormal(dir, normal);
                    return this.getRayCollisionAdjustedPos(this.mesh.position.add(nProjection), ++depth);
                }
            }
            return this.mesh.position.clone();

        } 

        this.debugRayHelper.show(this.mesh.getScene(), Color3.Green());
        return pos.clone();
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
        mag = this.boundsRadius + .3;
        let ray = new Ray(origin, udir, mag);
        this.debugRayHelper.ray = ray;

        let pickResult = this.mesh.getScene().pickWithRay(ray, (mesh : AbstractMesh) => {
            if(!mesh.isPickable)
                return false;
            let tgs = Tags.GetTags(mesh);
            return typeof(tgs) === 'string' && tgs.indexOf(GameEntityTags.Terrain) >= 0;
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

    // todo: jumping with rudimentary forces / gravity
    // TODO: head & feet collision detection (use boxes? no use rays to capture down (and not to the side))

    
    applyNetEntityUpdateIngoreCollisions(ct: CliTarget): void 
    {
        if(!MUtils.VecContainsNan(ct.interpData.position)) {
            this.mesh.position.copyFrom(ct.interpData.position);
        }

        if(!MUtils.VecContainsNan(ct.interpData.rotation)) {
            this.mesh.rotation.copyFrom(ct.interpData.rotation);
        }
    }

    applyNetworkEntityUpdate(ct : CliTarget) : void
    {
        this.moveToPosWithRayCollisions(ct.interpData.position.clone());
    }

    teleport(pos : Vector3) : void
    {
        this.cliTarget.interpData.position.copyFrom(pos);
        this.lastCliTarget.interpData.position.copyFrom(pos);
        this.mesh.position.copyFrom(pos);
    }


    //
    // movement & actions for client controlled players
    //
    pushCliTarget(nextCliTarget : CliTarget) : void
    {
        this.lastCliTarget = this.cliTarget.clone();
        this.cliTarget = nextCliTarget.clone();
    }

    private static MoveDir(cmd : CliCommand) : Vector3
    {
        let groundForward = MUtils.ProjectOnNormal(cmd.forward, Vector3.Up()).normalize();
        let groundRight = Vector3.Cross(Vector3.Up(), groundForward);
        return groundForward.scale(cmd.vertical).add(groundRight.scale(cmd.horizontal)).normalize();
    }

    private makeNextTargetWithCollisions(cmd : CliCommand) : CliTarget
    {
        let nextTarget = this.cliTarget.clone();
        nextTarget.timestamp = cmd.timestamp + ServerSimulateTickMillis;
        nextTarget.interpData.position.addInPlace(MPlayerAvatar.MoveDir(cmd).scale(this.moveSpeed));
        nextTarget.interpData.position = this.getRayCollisionAdjustedPos(nextTarget.interpData.position.clone());


        return nextTarget;
    }

    private nextInterpDataFrom(cmd : CliCommand) : InterpData
    {
        let id = this.getInterpData();
        let mv = MPlayerAvatar.MoveDir(cmd).scale(this.moveSpeed);
        id.position.addInPlace(mv);
        id.position = this.getRayCollisionAdjustedPos(id.position.clone());
        return id;
    }

    // server 
    applyCommandServerSide(cmd : CliCommand) : void
    {
        // CONSIDER: could update cli target in place for gc smoothing
        let target = this.makeNextTargetWithCollisions(cmd);
        target.interpData.rotation = cmd.rotation.clone();

        // for now blind acceptance
        target.interpData.position.y = cmd.claimY;

        // pinch targets
        this.cliTarget.copyFrom(target);
        this.lastCliTarget.copyFrom(this.cliTarget); 

        // CONSIDER: 
        // we have valid interpData even on the server in 'cliTarget'
        // and we don't have to instantiate a new interpData in getInterpData() ? 

        this.mesh.position.copyFrom(target.interpData.position);

        // would need quaternions if using physics
        //this.mesh.rotationQuaternion = Quaternion.RotationYawPitchRoll(target.interpData.rotation.x, target.interpData.rotation.y, target.interpData.rotation.z);
        this.mesh.rotation.copyFrom(target.interpData.rotation);
    } 

    private debugJumpRepeatedly : boolean = false;

    // cli controlled player
    pushCliTargetWithCommand(cmd : CliCommand) : void
    {
        if(cmd.jump){
            this.jump();
        }

        if(cmd.debugTriggerKey) {
            this.debugJumpRepeatedly = !this.debugJumpRepeatedly;
        }
        if(this.debugJumpRepeatedly && this.jumpCurve.state === JumpState.NOT_JUMPING) {
            this.jump();
        }

        this.lastCliTarget.copyFrom(this.cliTarget);
        let next = this.makeNextTargetWithCollisions(cmd);
        this.cliTarget.copyFrom(next);
    }

    // todo: get a pos adjusted for collisions
    // set this as the interp target
    renderLoopTick(dt : number) : void 
    {
        // console.log(`Bfr renloopTk: cliTrg: ${this.cliTarget.interpData.position}`);
        this.updateGrounded();
        this.didJumpStart.tick(dt / 1000.0);
        this.jumpCurve.tick(dt / 1000.0);
        this.applyGravity(dt);
        this.interpolateWithCliTargets();
        
        // console.log(`Aft renloopTk: cliTrg: ${this.cliTarget.interpData.position}`);
        this.debugShowHitTimer.tick(dt / 1000.0);
        this.toggleFireIndicator(this.debugShowHitTimer.value);
    }

    // TODO: the server can't get accurate gravity behavior with a low resolution tick
    // instead: let clients send a claimed y position (if they are not grounded)
    // accept clients y pos if it passes a sniff test

    // want?
    // tickServerSide(dt : number) : void
    // {
    //     this.updateGrounded();
    //     this.applyGravity(dt);
        
    //     // force latest pos from the now updated cliTarget
    //     this.mesh.position.copyFrom(this.cliTarget.interpData.position);
    // }

    
    private interpolateWithCliTargets() : void
    {
        let now = +new Date();
        let lerper = MUtils.GetSliderNumber(this.lastCliTarget.timestamp, this.cliTarget.timestamp, now);
        lerper = MUtils.Clamp01(lerper);
        let l = CliTarget.Lerp(this.lastCliTarget, this.cliTarget, lerper);
        // this.moveToPosWithRayCollisions(l.position);
        this.mesh.position.copyFrom(l.interpData.position);
        //  this.moveNoCollisions(l.position); // test
    }

}