import  { Engine,  Scene, Vector3, FreeCamera, HemisphericLight, Mesh } from 'babylonjs';
import { GridMaterial } from 'babylonjs-materials';
import * as Gui from 'babylonjs-gui';

// import {RoomAgent} from './RoomAgent';
import {ListenServerRoomAgent} from './ListenServerRoomAgent';
import {MSPeerConnection} from './MSPeerConnection';

import * as firebase from 'firebase/app';
import 'firebase/auth';

// Test user class: stand-in for 
// the actual firebase.User class.
// because firebase auth gives the 
// same user between browser tabs;
// and we want to test different users 
// without having to use multiple browsers
export namespace tfirebase
{
    export function StringForUser(user : User) { return user.UID; }
    
    export class User 
    {

        public isServer : boolean = false;
        constructor(
            public UID : string,
            public displayName : string,
            public color : number
        )
        {}

        public debug() {
            return `tF.User: ${this.UID}, name: ${this.displayName}, color: ${this.color}`;
        }

        public clone() : User 
        {
            let c = new User(this.UID, this.displayName, this.color);
            c.isServer = this.isServer;
            return c;
        }

    }
}

// export namespace MUserConfig
// {
//     export var Config = {
//         "uid" : "",
//         "displayName" : "",
//         "color" : ""
//     };
// }

// export class UserConfig
// {
//     constructor(
//         public fBaseUser : tfirebase.User,
//         public displayName : string,
//         public color : number
//     )
//     {}
// }

function testColor(i : number){
    switch(i){
        case 0:
            return new BABYLON.Color3(1, 0, 0);
        case 1:
            return new BABYLON.Color3(0, .5, .2);
        case 2:
            return new BABYLON.Color3(0, .1, .8);
        case 3:
        default:
            return new BABYLON.Color3(.3, 0, .4);
    }
}

export class MPlayer
{
    public mesh : Mesh;
    constructor(
        public readonly user : tfirebase.User, 
        protected scene : Scene
    ) 
    {

        //TODO: configure look based on user config
        //TODO: rename class tfirebase.User to something with the word config

        this.mesh = Mesh.CreateSphere("sphere1", 16, 2, scene);
        let mat = new GridMaterial("grid", scene);
        mat.mainColor = testColor(user.color); 
        this.mesh.material = mat;
        
    }

    public cleanup() {
        this.mesh.dispose();
    }
}

export class RemotePlayer // extends MPlayer
{
    constructor(
        public peer : MSPeerConnection,
        public user : tfirebase.User,
    )
    {

        // peer.recExtraCallback = (e : MessageEvent) => {
        //     this.mesh.position.x = e.data; 
        // }
    }
}

// export class LocalPlayer extends MPlayer
// {
//     public roomAgent : ListenServerRoomAgent; // RoomAgent;

//     constructor(
//         room : string,
//         user : tfirebase.User, 
//         protected scene : Scene
//         // _mesh : Mesh
//     ) 
//     {
//         super(
//             user,
//             scene
//             );

//         this.roomAgent = new ListenServerRoomAgent(room, user, scene); // new RoomAgent(room, user, scene);
//     }

//     public renderLoopTick() 
//     {
//         this.mesh.position.x = ((this.scene.pointerX / 500.0) - .5) * 2.0;
//         this.roomAgent.PeerBroadcast("" + this.mesh.position.x);
//     }
// }