
// Example code. not in use
//
//
// /*
//  *  Copyright (c) 2015 The WebRTC project authors. All Rights Reserved.
//  *
//  *  Use of this source code is governed by a BSD-style license
//  *  that can be found in the LICENSE file in the root of the source
//  *  tree.
//  */

// 'use strict';

// import adapter from 'webrtc-adapter';

// import * as firebase from 'firebase/app';
// import 'firebase/database';
// import 'firebase/auth';


// let localConnection : ( RTCPeerConnection );

// let sendChannel : RTCDataChannel;
// let receiveChannel : RTCDataChannel;

// const dataChannelSend : HTMLTextAreaElement = <HTMLTextAreaElement> document.querySelector('textarea#dataChannelSend');
// const dataChannelReceive : HTMLTextAreaElement = <HTMLTextAreaElement> document.querySelector('textarea#dataChannelReceive');
// const startButton : HTMLButtonElement = <HTMLButtonElement> document.querySelector('button#startButton');
// const sendButton : HTMLButtonElement = <HTMLButtonElement> document.querySelector('button#sendButton');
// const closeButton : HTMLButtonElement = <HTMLButtonElement> document.querySelector('button#closeButton');

// startButton.onclick = createConnection;
// sendButton.onclick = sendData;
// closeButton.onclick = closeDataChannels;

// var user : firebase.User;
// var yourId : string = "" + Math.floor(Math.random() * 1000000000);
// //var servers = null;
// var servers = {'iceServers': [
//     {'urls': 'stun:stun.services.mozilla.com'}, 
//     {'urls': 'stun:stun.l.google.com:19302'}, 
//     {'urls': 'turn:numb.viagenie.ca','credential': 'thisisagoldennugget','username': 'mattpoindexter@gmail.com'}
//     ]};

// type tReceiveCallback = (e: MessageEvent) => void;

// var recExtraCallback : tReceiveCallback = function(event : MessageEvent) {};

// export function SetExtraReceiveCallback(callback : tReceiveCallback) {
//     recExtraCallback = callback;
// }

// type tReadyCallback = (readyState : RTCDataChannelState) => void;

// var ReadyCallback : tReadyCallback = function(rS : RTCDataChannelState) {};

// export function SetConnectionReadyCallback(callback : tReadyCallback) {
//     ReadyCallback = callback;
// }

// function onReceiveMessageCallback(event : MessageEvent) {
//     dataChannelReceive.value = event.data;
//     recExtraCallback(event);
// }
  
// function onSendChannelStateChange() 
// {
//     const readyState = sendChannel.readyState;
//     console.log('Send channel state is: ' + readyState);
//     if (readyState === 'open') {
//         dataChannelSend.disabled = false;
//         dataChannelSend.focus();
//       sendButton.disabled = false;
//       closeButton.disabled = false;
//     } else {
//         dataChannelSend.disabled = true;
//         sendButton.disabled = true;
//         closeButton.disabled = true;
//     }
//     ReadyCallback(sendChannel.readyState);
// }

// export function WebRTCInit()
// {
//     if(adapter != null){
//         console.log("adapter exists");
//     }
//     else {
//         console.log("no adapter");
//     }

//     //InitPeer();
//     firebase.auth().signInAnonymously().catch(  err  => {
//         var errmsg = "Sign in err: " +  err.code + " :  " + err.message;
//         console.warn(errmsg);
//     });

//     firebase.auth().onAuthStateChanged(  usr => {
//         if(usr){
//             user = usr;
//             yourId = usr.uid;
//             console.log("UID: "  + yourId);
//             InitPeer();
//         } else {
//             console.log("user  signed out");
//         }
//     });
// }

// function InitPeer()
// {
//     // window.localConnection = 
//     localConnection = new RTCPeerConnection(servers);

//     const sendChannelParams = {ordered:false};

//     // TODO: MS Edge error: https://stackoverflow.com/questions/13975922/script438-object-doesnt-support-property-or-method-ie
//     sendChannel = localConnection.createDataChannel('sendDataChannel', sendChannelParams);

//     localConnection.onicecandidate = (event => {
//         event.candidate ? 
//         sendMessage(yourId, JSON.stringify({'ice' : event.candidate})) : 
//         console.log('sent all ice'); 
//     });

//     console.log("create conn");

//     sendChannel.onopen = onSendChannelStateChange;
//     sendChannel.onclose = onSendChannelStateChange;
  
//     localConnection.ondatachannel = (event => {
//         console.log('receive channel callback');
//         receiveChannel = event.channel;
//         receiveChannel.onmessage = onReceiveMessageCallback;
//         receiveChannel.onopen = onReceiveChannelStateChange;
//         receiveChannel.onclose = onReceiveChannelStateChange;
//     });

//     firebase.database().ref().on('child_added', (data) => {
//         try {
//             var msg = JSON.parse(data.val().message);
//             var sender = data.val().sender;

//             console.log("got msg: from: " + ( sender== yourId? "myself" : sender ) + " msg: " + data.val().message);

//             if(sender != yourId)
//             {
//                 if(msg.ice != undefined)
//                 {
//                     try{
//                         console.log("ice cand is defined. ");
//                         localConnection.addIceCandidate(new RTCIceCandidate(msg.ice));
                            
//                     } catch(err) { console.log("addIceCan Errrr: " + err); }
//                 }

//                 else if (msg.sdp.type == "offer")
//                 {
//                     try {
//                         console.log("got sdp: offer");
//                         localConnection.setRemoteDescription(new RTCSessionDescription(msg.sdp))
//                             .then(() => localConnection.createAnswer())
//                             .then(answer => localConnection.setLocalDescription(answer))
//                             .then(() => sendMessage(yourId, JSON.stringify({'sdp': localConnection.localDescription})));
//                     } catch(err) { console.log("setRemoDes ERr: " + err);}
//                 }
//                 else if (msg.sdp.type == "answer")
//                 {
//                     console.log("got sdp: answer" + msg.sdp);
//                     localConnection.setRemoteDescription(new RTCSessionDescription(msg.sdp));

//                 }
//             }
//         } 
//         catch(err)
//         {
//             console.log("errr: on child added: data.val(): " + data.val() + " error msg: " + err);
//         }
//     });
    
// }

// export function hasOffer() {
//     if(!localConnection || localConnection.connectionState == 'closed') {
//         return false;
//     }

//     return localConnection.remoteDescription != null;
// }

// // 'start' button callback
// export function createConnection()
// {

//     localConnection.createOffer()
//         .then(offer => {
//             console.log(`****offer from localConnection\n${offer.sdp}`);

//             localConnection.setLocalDescription(offer).then(() => {
//                 console.log('sending sdp');
//                 if(localConnection.localDescription) 
//                 {
//                     sendMessage(yourId, JSON.stringify({'sdp': localConnection.localDescription}));

//                     startButton.disabled = true;
//                     closeButton.disabled = false;
//                 } 
//                 else 
//                 {
//                     console.warn("THEN local connection's local description is null. won't  send anything. ");
//                 }
//             });
            
//         },
//         err => {
//             console.log('Failed to create session description: ' + err.toString());
//         });
        
    
// }

// function sendMessage(senderId : string, data : string) 
// {
//     var msg = firebase.database().ref().push({ 
//     	sender: senderId,
//     	message: data });
//     msg.remove();
// }


// function sendData()
// {
//     const data = dataChannelSend.value;
//     sendChannel.send(data);
//     console.log('Sent Data: ' + data);
// }

// export function send(s : string) {
//     sendChannel.send(s);
// }


// export function closeDataChannels()
// {
//     console.log('Closing data channels');
//     sendChannel.close();
//     console.log('Closed data channel with label: ' + sendChannel.label);
//     receiveChannel.close();
//     console.log('Closed data channel with label: ' + receiveChannel.label);
//     if(localConnection)
//         localConnection.close();

//     console.log('Closed peer connections');
//     startButton.disabled = false;
//     sendButton.disabled = true;
//     closeButton.disabled = true;
//     dataChannelSend.value = '';
//     dataChannelReceive.value = '';
//     dataChannelSend.disabled = true;

//     // disableSendButton();
//     // enableStartButton();
// }


// function onReceiveChannelStateChange() {
//     const readyState = receiveChannel.readyState;
//     console.log(`Receive channel state is: ${readyState}`);
//   }
