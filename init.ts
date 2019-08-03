import  { Engine,  Scene, Vector3, FreeCamera, HemisphericLight, Mesh } from 'babylonjs';
import { GridMaterial } from 'babylonjs-materials';
import * as Gui from 'babylonjs-gui';

//import * as wrtc from './WebRTCConnection';
//import {RoomAgent} from './RoomAgent';

import * as firebase from 'firebase/app';
import 'firebase/auth';
import { Checkbox } from 'babylonjs-gui';
import { tfirebase } from './MPlayer';
import { MLocalPeer } from './MPeer';


// // Get the canvas element from the DOM.
// const canvas : HTMLCanvasElement = <HTMLCanvasElement> document.getElementById("renderCanvas");

// // Associate a Babylon Engine to it.
// const engine = new Engine(canvas);

// // Create our first scene.
// var scene = new Scene(engine);

// // This creates and positions a free camera (non-mesh)
// var camera = new FreeCamera("camera1", new Vector3(0, 5, -10), scene);

// // This targets the camera to scene origin
// camera.setTarget(Vector3.Zero());

// // This attaches the camera to the canvas
// camera.attachControl(canvas, true);

// // This creates a light, aiming 0,1,0 - to the sky (non-mesh)
// var light = new HemisphericLight("light1", new Vector3(0, 1, 0), scene);

// // Default intensity is 1. Let's dim the light a small amount
// light.intensity = 0.7;

// // Create a grid material
// var material =  new GridMaterial("grid", scene);

// BABYLON.SceneLoader.Append("./models/", "city.babylon", <BABYLON.Scene>(<unknown> scene), (_scene) => {
//     console.log("appended the mesh");
// });




//var player : LocalPlayer;
let localPeer : MLocalPeer;


var fbaseUser : tfirebase.User;

const useMSPeer = <HTMLInputElement> document.getElementById("useMSPeer");


export function init()
{
    useMSPeer.checked = true; // force
    if(useMSPeer.checked) {
        SetupClient();
    } 
}


function SetupClient()
{
    firebase.auth().signInAnonymously().catch( err  => {
        console.warn("Sign in err: " +  err.code + " :  " + err.message);
    });

    firebase.auth().onAuthStateChanged( usr => {
        if(usr){
            // for testing use a fake UID (firebase.Auth gives same UID per browser)
            fbaseUser = fakeUserConfig();  // usr;
            EnterLobby();
        } else { 
            console.log("user signed out"); 
        }
    });
}


function EnterLobby()
{
    localPeer = new MLocalPeer("roomabc", fbaseUser);

    window.onbeforeunload =  () => {
        // if we don't await. does this always happen?
        localPeer.onClose();
    };

   
}



var readyCount = 0;
var isSendReady = false;
const readyCallback = function(readyState : RTCDataChannelState) {
    console.log("got ready " + (readyCount++));
    if(readyState === 'open') {
        isSendReady = true;
    } else {
        isSendReady = false;
    }
}



const fakeNames : Array<string> = ['jill', 'bill', 'greg', 'mofo'];
function fakeUID() : string {
    return `${fakeNames[Math.floor(Math.random()*fakeNames.length)]}-${Math.ceil(Math.random()*10000)}`;
}

function fakeUserConfig() : tfirebase.User 
{
    let c = new tfirebase.User("", "", 0);

    let name = fakeNames[Math.floor(Math.random()*fakeNames.length)];
    c.UID = `${name}-${Math.ceil(Math.random()*10000)}`;
    c.color = Math.floor(Math.random()*5);
    c.displayName = name;
    return c;
}




function SetupClientFake()
{
    fbaseUser = fakeUserConfig(); //  new tfirebase.User(fakeUID());
    EnterLobby();
}