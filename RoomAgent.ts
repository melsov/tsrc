// import * as firebase from 'firebase/app';
// import 'firebase/database';
// import 'firebase/auth';
// // import * as Collections from 'b'

// import  { Engine,  Scene, Vector3, FreeCamera, HemisphericLight, Mesh } from 'babylonjs';
// import { GridMaterial } from 'babylonjs-materials';
// import * as Gui from 'babylonjs-gui';

// import {MSPeerConnection} from './MSPeerConnection';
// import {MPlayer, RemotePlayer, LocalPlayer, tfirebase}  from './MPlayer';

// const RABaseRoomKey : string = "rooms";
// const RAMaxPlayersPerRoom : Number = 8;



// const fakeRoom : string = "roomabc";

// export class RoomAgent 
// {
    
//     get roomRef() : string {
//         return `${RABaseRoomKey}/${this.room}`;
//     }

//     get roomCountRef() : string { return `${this.roomRef}/player-count`; }

//     get playersRef() : string {
//         return `${this.roomRef}/players`;
//     }
    
//     get messageBoothRef() : string {
//         return `${this.roomRef}/booth`;
//     }
    
//     private inboxRefFor(_userid : string) : string {
//         return `${this.roomRef}/inbox/${_userid}`;
//     }
    
//     private debugPlayerListDiv : HTMLDivElement;
//     private debugPlayerCount : HTMLDivElement;
//     userid : string;
//     userDBRef : firebase.database.ThenableReference;
    
//     others : Array<RemotePlayer> = new Array<RemotePlayer>();
//     readyOthers : Array<RemotePlayer> = new Array<RemotePlayer>(); // awkward // TODO: make both of these maps <uid, RemotePlayer> https://howtodoinjava.com/typescript/maps/

//     //peers : Array<MSPeerConnection> = Array<MSPeerConnection>();
//     private findReadyIndex(uid : string) {
//         let ii = -1;
//         this.readyOthers.forEach((o, i) => {
//             console.log("found: " + o.user.uid + " other is: " + uid);
//             if(o.user.uid == uid) 
//             {
//                 ii = i; 
//             }
//         });
//         return ii;
//     }

//     private debugUpdateReadyOthersDisplay() {
//         let names = Array<string>();
//         names.push(` me: ${this.user.uid} <br />`);
//         for(let i=0; i < this.readyOthers.length; ++i){
//             let other = this.readyOthers[i].user.uid;
//             names.push(` ${other} <br />`);
//         }

//         this.debugPlayerListDiv.innerHTML = names.toString();
//     }

//     constructor(
//         public readonly room : string, 
//         public readonly user : tfirebase.User, 
//         scene : Scene
//     ) 
//     {
//         if(user == undefined) { console.warn("THIS user (passed to RoomAgent constructor) is undefined"); throw new Error("user undefined"); }

//         this.userid = user.uid;
//         this.room = fakeRoom;

//         this.debugPlayerListDiv = <HTMLDivElement>document.getElementById('debugPlayerList');
//         this.debugPlayerCount = <HTMLDivElement>document.getElementById('debugPlayerCount');

//         // push our uid to players
//         // use transact: need to limit num players per room
//         this.userDBRef = firebase.database().ref(this.playersRef).push(user); // this.userid);
        
//         this.userDBRef.then(() => {
//             console.log("here's the key: " + this.userDBRef.key);
//         });

//         //Atomically update room count
//         firebase.database().ref(this.roomCountRef).transaction((count) => {
//             return count + 1;
//         });

//         firebase.database().ref(this.roomCountRef).on('value', (snap) => {
//             this.debugPlayerCount.innerText = "" + snap.val();

//             //clean up if we are the last one out of the room
//             let c : number = snap.val();
//             if(c == 0) {
//                 firebase.database().ref(this.roomCountRef).remove();
//             }
//         });


//         const addPeer = (rUserConfig : tfirebase.User) => { // child : firebase.database.DataSnapshot) => {
//             // let rUserConfig = <tfirebase.User>(<unknown>child.val()); //child.val();
//             console.log(`remote user config: ${rUserConfig.displayName} color: ${rUserConfig.color}`);
//            // console.log(rUserConfig.debug());

//             // init an MSPeerConnection between us and them
//             // var peer = new MSPeerConnection(user, child.val(), this.messageBoothRef);
//             var peer = new MSPeerConnection(user, rUserConfig.uid, this.messageBoothRef);

//             var other = new RemotePlayer(peer, rUserConfig, scene);
//             var len : number = this.others.push(other); // this.peers.push(peer);

//             this.others[len - 1].peer.SendChanStateChangedCallback = (rs : RTCDataChannelState, _peer : MSPeerConnection) => {
//                 console.log("RoomAgent: Send state is now: " + rs.toString());
//                 if(rs == "open") {
//                     this.others[len - 1].peer.send("hi hi " + len);
//                     this.readyOthers.push(this.others[len - 1]);
//                 }
//                 else if(rs == "closing" || rs == "closed") 
//                 {
//                     //remove from readyOthers 
//                     let i = this.findReadyIndex(other.user.uid);
//                     if(i >= 0){
//                         this.readyOthers[i].cleanup();
//                         this.readyOthers.splice(i,1);
//                     }
//                     console.log("found disconnector (Send chnnl) at: "+i+". rOthers len now: " + this.readyOthers.length);
//                     this.readyOthers.forEach((other) => {
//                         console.log(other.user.uid);
//                     });
//                 }
//                 this.debugUpdateReadyOthersDisplay();
//             };

//             this.others[len - 1].peer.ReceiveChanStateChangedCallback = (rs : RTCDataChannelState, _peer : MSPeerConnection) => {
//                 console.log("Receive state is now: " + rs.toString());
//                 if(_peer != null)
//                 {
//                     if(rs == "closed" || rs == "closing")
//                     {
//                         let i = this.findReadyIndex(_peer.user.uid);
//                         if(i >= 0) {
//                             this.readyOthers[i].cleanup();
//                             this.readyOthers.splice(i, 1);
//                         }
//                         console.log("found disconnector (Rece chnnl) at: "+i+". rOthers len now: " + this.readyOthers.length);
//                     }
//                 }
//                 this.debugUpdateReadyOthersDisplay();
//             };

//             return len - 1;
//         };

//         // foreach player listed under players
//         firebase.database().ref(this.playersRef).once('value')
//             .then(snap => {

//                 snap.forEach((child) => {
//                     let rUserConfig = <tfirebase.User>(<unknown> child.val());

//                     if(rUserConfig.uid == undefined) console.warn("got an undefined user");

//                     if(rUserConfig.uid != undefined && rUserConfig.uid != user.uid)
//                     {
//                         addPeer(rUserConfig); 

//                         // notify them that we've arrived
//                         firebase.database().ref(this.inboxRefFor(rUserConfig.uid)).push(user); 
//                     }
//                 });
//             });

//         // now that we're in the game / room
//         // listen for messages from new players ('child-added') in our 'in-box'
//         firebase.database().ref(this.inboxRefFor(this.userid)).on('child_added', (data) => {

//             let rUserConfig = <tfirebase.User>(<unknown> data.val());
//             console.log("from my inbox: " + data.val()+ " user: " + rUserConfig.uid);

//             var index : number = addPeer(rUserConfig);
//             this.others[index].peer.createConnection();

//         });

//         // listen for players leaving
//         firebase.database().ref(this.playersRef).on('child_removed', (data) => {

//             let rUserConfig = <tfirebase.User>(<unknown> data.val());
            
//             // CONSIDER: We are finding unremoved players here exactly sometimes. 
//             // We probably want to learn which cases make this happen; 
//             // when do the channel state changed callbacks not catch this.
//             let i = this.findReadyIndex(rUserConfig.uid);
//             if(i >= 0){
//                 this.readyOthers[i].cleanup();
//                 this.readyOthers.splice(i, 1);
//                 this.debugUpdateReadyOthersDisplay();
//             }
            
//             console.log(`on child_removed. removed player? ${i}. `);
//         });

//     }

//     public PeerBroadcast(msg : string)
//     {
//         this.readyOthers.forEach((other : RemotePlayer) => {
//             other.peer.send(msg);
//         });
//     }

//     // clean up
//     public onDisconnect() 
//     {
//         this.others.forEach((other) => {
//             other.peer.closeDataChannels();
//         });

//         firebase.database().ref(this.roomCountRef).transaction((count) => { 
//             if(count == null || count == 0) return 0; //  hope not
//             return count - 1;
//         });

//         firebase.database().ref(this.inboxRefFor(this.userid)).remove()
//             .then(() => {});

//         if(this.userDBRef.key != undefined)
//             firebase.database().ref(this.playersRef + "/" + this.userDBRef.key).remove()
//                 .then(() => { console.log("removed: " + this.userDBRef.key); });
//         else 
//             console.warn("our room ref was undefined");

//     }
// }