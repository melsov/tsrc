import { Engine,  Scene, Vector3, HemisphericLight, SceneLoader, MeshBuilder, Color4, Color3, Tags, UniversalCamera, StandardMaterial, Texture } from 'babylonjs';
import { GridMaterial } from 'babylonjs-materials';
import * as Gui from 'babylonjs-gui';
import { MLoader } from './bab/MAssetBook';

//import * as wrtc from './WebRTCConnection';
//import {RoomAgent} from './RoomAgent';

//import * as firebase from 'firebase/app';
//import 'firebase/auth';
//import { Checkbox } from 'babylonjs-gui';
//import { LocalPlayer, tfirebase } from './MPlayer';

//export const g_render_canvas_id : string = "renderCanvas";
export const g_render_canvas_server_id : string = "render-canvas-server";
export const g_render_canvas_client_id_a : string = "render-canvas-client-a";
export const g_render_canvas_client_id_b : string = "render-canvas-client-b";

export const g_main_camera_name : string = "main-camera";

export class GameEntityTags
{
    public static readonly Terrain = "Terrain";
    public static readonly PlayerObject = "PlayerObject";
    public static readonly MousePickPlane = "MousePickPlane";
    public static readonly Shadow = "Shadow";
    public static readonly InvisibleToRaycasts = "InvisToRaycasts";

    public static HasTag(oo : object, tag : string) : boolean
    {
        let o = Tags.GetTags(oo, true);
        if(o == null) return false;
        return o.indexOf(tag) >= 0;
    }

}

export enum TypeOfGame
{
    Server, ClientA, ClientB
}

export class GameMain
{
    // Get the canvas element from the DOM.
    // public readonly canvas : HTMLCanvasElement;
    public get canvas() : HTMLCanvasElement { return this.mapPackage.canvas; }

    // Associate a Babylon Engine to it.
    // public readonly engine : Engine; 
    public get engine() : Engine { return this.mapPackage.engine; }

    // Create our first scene.
    // public scene : Scene;
    public get scene() : Scene { return this.mapPackage.scene; }

    // This creates and positions a free camera (non-mesh)
    public readonly camera : UniversalCamera; // = new FreeCamera("camera1", new Vector3(0, 5, -10), scene);

    

    private shouldRenderDEBUG : boolean = true;
    stopRenderLoop() : void { this.shouldRenderDEBUG = false; }
    startRenderLoop() : void { this.shouldRenderDEBUG = true; }
    togglePaused() : void { this.shouldRenderDEBUG = !this.shouldRenderDEBUG; }

    private isPointerLocked : boolean = false;

    clearColor : Color4;

    constructor(
        //public readonly typeOfTestGame : TypeOfGame,
        public readonly mapPackage : MLoader.MapPackage
        )
    {
        this.camera = new UniversalCamera(g_main_camera_name, new Vector3(0, 23, -.01), this.scene);
        // we plan to move the camera manually
        // because we don't want to have to mimic its 
        // behavior on the server
        this.camera.speed = 0; 
        this.camera.angularSensibility = 500; // lower rotates cam faster
        console.log(`INERTIA ${this.camera.inertia}`);
        this.camera.inertia = .1; // 0 => follow mouse movement exactly

        // if(typeOfTestGame != TypeOfGame.Server)
        //     this.setupPointerLocking();

        // This targets the camera to scene origin
        if(mapPackage.typeOfGame === TypeOfGame.Server)
            this.camera.setTarget(Vector3.Zero());
        
        // This attaches the camera to the canvas
        this.camera.attachControl(this.canvas, true);

        // This creates a light, aiming 0,1,0 - to the sky (non-mesh)
        var light = new HemisphericLight("light1", new Vector3(0, 1, 0), this.scene);
    
        // Default intensity is 1. Let's dim the light a small amount
        light.intensity = 0.7;

        this.clearColor = mapPackage.typeOfGame === TypeOfGame.Server ? Color4.FromHexString('#441647FF') : Color4.FromHexString('#181647FF');
        this.scene.clearColor = this.clearColor;

        // this.importSene(); 
        
        this.makeBoxWalls();
        
        // this.makeMousePickPlane();

        this.setupCrosshairs();
    }
     
    private importSene() : void  
    {
        SceneLoader.ImportMesh( null, './models/', 'relevant.babylon', this.scene, (meshes, particleSystems, animationGroups) => {
            meshes.forEach((m) => {
                Tags.AddTagsTo(m, GameEntityTags.Terrain);
            });
        });
    }

    private setupCrosshairs() : void 
    {
        // maybe use bab gui ? // this plane can go into
        let chplane = MeshBuilder.CreatePlane("chplane", {
            size : 1
        }, this.scene);

        let chmat = new StandardMaterial('chmat', this.scene);
        chmat.diffuseTexture = new Texture("./images/crosshair.png", this.scene);
        chmat.diffuseTexture.hasAlpha = true;
        chmat.backFaceCulling = false;
        chplane.material = chmat;

        chplane.parent = this.camera;
        chplane.setPositionWithLocalVector(new Vector3(0, 0, 2.1));
    }


    private makeMousePickPlane()
    {
        let plane = MeshBuilder.CreatePlane('mouse-pick-plane', {
            width : 500,
            height : 400
        }, this.scene);

        // plane.setParent(this.camera); // better if not attached, given our current 'top-down-ish' situation
        let plMat = new GridMaterial('mpickplane-mat', this.scene);
        plane.material = plMat;
        Tags.AddTagsTo(plane, GameEntityTags.MousePickPlane);
        
        plane.setPositionWithLocalVector(new Vector3(0, -2, 0));
        plane.rotate(Vector3.Right(), Math.PI / 2);

    }

    private get funColors() : Color4[] {
       let colors : Array<Color4> = new Array<Color4>();
       colors.push(Color4.FromColor3(Color3.White()));
       colors.push(Color4.FromColor3(Color3.Yellow()));
       colors.push(Color4.FromColor3(Color3.Red()));
       colors.push(Color4.FromColor3(Color3.Blue()));
       colors.push(Color4.FromColor3(Color3.Green()));
       colors.push(Color4.FromColor3(Color3.Purple()));
       return colors;
    }

    private makeBoxWalls() : void
    {
        let long = 15;
        let h = 6;
        let shrt = 2;

        let out = long / 2.0;
        let vx = new Vector3(1, 0, 0);
        let vz = new Vector3(0, 0, 1);

        for(let i=0; i<2;++i)
        {
            let ww = long; let dd = shrt;
            let pos = vz.clone();
            if(i%2==1){
                dd = long; ww = shrt;
                pos = vx.clone();
            }
            if (i > 1) {
                pos.scaleInPlace(-1.0);
            }
            pos.scaleInPlace(out + shrt / 2.0);

            let box = MeshBuilder.CreateBox(`box-wall-${i}`, {
                width: ww,
                height: h,
                depth: dd,
                faceColors: this.funColors
            }, this.scene);
            box.position.copyFrom(pos);

            Tags.AddTagsTo(box, GameEntityTags.Terrain);

            let boxMat = new GridMaterial(`box-mat-${i}`, this.scene);
            boxMat.gridRatio = .25;
            box.material = boxMat;

            
        }

        let floor = MeshBuilder.CreateBox('box-floor', {
            width : long * 2,
            height : h,
            depth : long * 2
        }, this.scene);
        floor.position = new Vector3(0, -h, 0);
        Tags.AddTagsTo(floor, GameEntityTags.Terrain);
        let flMat = new GridMaterial('floor-mat', this.scene);
        flMat.gridRatio = .5;
        flMat.mainColor = Color3.Black();
        flMat.lineColor = Color3.White();
        floor.material = flMat;

    }

    public init()
    {
        this.restartRenderLoop();
    }

    public restartRenderLoop()
    {
        this.engine.runRenderLoop(() => {
            if(this.shouldRenderDEBUG)
                this.scene.render();
        });

    }


    // BABYLON.SceneLoader.Append("./models/", "city.babylon", <BABYLON.Scene>(<unknown> scene), (_scene) => {
    //     console.log("appended the mesh");
    // });
}
