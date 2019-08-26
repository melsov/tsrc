/*
 *  Copyright (c) 2015 The WebRTC project authors. All Rights Reserved.
 *
 *  Use of this source code is governed by a BSD-style license
 *  that can be found in the LICENSE file in the root of the source
 *  tree.
 */

'use strict';

import adapter from 'webrtc-adapter';

import * as firebase from 'firebase/app';
import 'firebase/database';
import 'firebase/auth';
import { tfirebase } from './MPlayer';

type tReceiveCallback = (uid : string, e: MessageEvent) => void;
type tReadyCallback = (readyState : RTCDataChannelState) => void;
type tChannelStateCallback = (readyState : RTCDataChannelState, peer : MSPeerConnection) => void;

const servers = {'iceServers': [
    {'urls': 'stun:stun.services.mozilla.com'}, 
    {'urls': 'stun:stun.l.google.com:19302'}, 
    {'urls': 'turn:numb.viagenie.ca','credential': 'thisisagoldennugget','username': 'mattpoindexter@gmail.com'}
    ]};

const dataChannelSend : HTMLTextAreaElement = <HTMLTextAreaElement> document.querySelector('textarea#dataChannelSend');
const dataChannelReceive : HTMLTextAreaElement = <HTMLTextAreaElement> document.querySelector('textarea#dataChannelReceive');

const DEBUG_MSPEER : boolean = false;
function logMSPEER(str : string) : void
{
    if(DEBUG_MSPEER) console.log(str);
}

export class MSPeerConnection
{
    localConnection : RTCPeerConnection;

    sendChannel : RTCDataChannel;
    receiveChannel : RTCDataChannel | null = null;


    public readonly user : tfirebase.User;
    get yourId() : string {
        return this.user.UID;
    } 

    theirId : string;
    messageBoothPath : string;

    private get fromThemBoothPath() : string {
        return `${this.messageBoothPath}/${this.theirId}/${this.yourId}`;
    }

    private get toThemBoothPath() : string {
        return `${this.messageBoothPath}/${this.yourId}/${this.theirId}`;
    }

    
    recExtraCallback : tReceiveCallback = function(uid : string, event : MessageEvent) {};
    SendChanStateChangedCallback : tChannelStateCallback = function(rS : RTCDataChannelState, peer : MSPeerConnection) {};
    ReceiveChanStateChangedCallback : tChannelStateCallback = function(rs : RTCDataChannelState, peer : MSPeerConnection) {};
    
    constructor(_user : tfirebase.User, _theirId : string, _messageBoothPath : string) 
    {
        this.user = _user;
        this.theirId = _theirId;
        this.messageBoothPath = _messageBoothPath;

        logMSPEER("booth: " + this.fromThemBoothPath);
        logMSPEER("booth: " + this.toThemBoothPath);
        // window.localConnection = 
        this.localConnection = new RTCPeerConnection(servers);

        const sendChannelParams = {ordered:false};

        // TODO: MS Edge error: https://stackoverflow.com/questions/13975922/script438-object-doesnt-support-property-or-method-ie
        // Does 'createDataChannel' somehow overlap with another namespace ??
        this.sendChannel = this.localConnection.createDataChannel('sendDataChannel', sendChannelParams);
        logMSPEER("send channel undefined? " + (this.sendChannel == undefined));

        this. localConnection.onicecandidate = (event => {
            event.candidate ? 
                this. sendMessage(this. yourId, JSON.stringify({'ice' : event.candidate})) : 
                logMSPEER('sent all ice'); 
        });

        logMSPEER("create conn");

        /*
         * Assigning class member functions to channel callbacks doesn't work (for us):
         * the channel objects show up undefined (in their own callback functions!)
         * Instead: define the callbacks locally.
         * OnSendChanStateCh, OnRecStateChanged, OnRecMsg
        */
        const OnSendChanStateCh = () => {
            if(this.sendChannel == undefined) { 
                console.warn('sendChannel undefined'); 
                return; 
            }

            const readyState = this. sendChannel.readyState;
            logMSPEER('Send channel state is: ' + readyState);
            if (readyState === 'open') {
                dataChannelSend.disabled = false;
                dataChannelSend.focus();
            } else {
                 dataChannelSend.disabled = true;
            }
            this. SendChanStateChangedCallback(this.sendChannel.readyState, this);
        };
        this.sendChannel.onopen = OnSendChanStateCh;
        this.sendChannel.onclose = OnSendChanStateCh;

        const OnRecStateChanged = () => {
            if(this.receiveChannel){ 
                const readyState = this. receiveChannel.readyState;
                logMSPEER(`Receive channel state is: ${readyState}`);
                this.ReceiveChanStateChangedCallback(this.receiveChannel.readyState, this);
            } 
        }

        const OnRecMsg = (event : MessageEvent) => {
            dataChannelReceive.value = event.data;
            this.recExtraCallback(this.theirId, event);
        }

        this.localConnection.ondatachannel = (event => {
            this. receiveChannel = event.channel;
            this. receiveChannel.onmessage = OnRecMsg; 
            this. receiveChannel.onopen = OnRecStateChanged;
            this. receiveChannel.onclose = OnRecStateChanged;
        });

        firebase.database().ref(this.fromThemBoothPath).on('child_added', (data) => {
            try {
                var msg = JSON.parse(data.val().message);
                var sender = data.val().sender;

                logMSPEER("got msg: from: " + ( sender== this. yourId? "myself" : sender ) + " msg: " + data.val().message);

                if(sender != this. yourId) // should always be true
                {
                    if(msg.ice != undefined)
                    {
                        try{
                            logMSPEER("ice cand is defined. ");
                            this.localConnection.addIceCandidate(new RTCIceCandidate(msg.ice));
                                
                        } catch(err) { console.log("addIceCan Errrr: " + err); }
                    }

                    else if (msg.sdp.type == "offer")
                    {
                        try {
                            logMSPEER("got sdp: offer");
                            this.localConnection.setRemoteDescription(new RTCSessionDescription(msg.sdp))
                                .then(() => this.localConnection.createAnswer())
                                .then(answer => this.localConnection.setLocalDescription(answer))
                                .then(() => this. sendMessage(this. yourId, JSON.stringify({'sdp': this.localConnection.localDescription})));
                        } catch(err) { logMSPEER("setRemoDes ERr: " + err);}
                    }
                    else if (msg.sdp.type == "answer")
                    {
                        logMSPEER("got sdp: answer" + msg.sdp);
                        this.localConnection.setRemoteDescription(new RTCSessionDescription(msg.sdp));
                    }
                }
            } 
            catch(err)
            {
                console.log("errr: on child added: data.val(): " + data.val() + " error msg: " + err);
            }
        });        
        
    }

    
    public createConnection()
    {

        this.localConnection.createOffer()
            .then(offer => {
                logMSPEER(`****offer from localConnection\n${offer.sdp}`);

                this.localConnection.setLocalDescription(offer).then(() => {
                    logMSPEER('sending sdp');
                    if(this. localConnection.localDescription) 
                    {
                        this.sendMessage(this. yourId, JSON.stringify({'sdp': this. localConnection.localDescription}));
                    } 
                    else 
                    {
                        console.warn("THEN local connection's local description is null. won't  send anything. ");
                    }
                });
                
            },
            err => {
                logMSPEER('Failed to create session description: ' + err.toString());
            });
        
    }

    private sendMessage(senderId : string, data : string) 
    {
        var msg = firebase.database().ref(this.toThemBoothPath).push({ 
            sender: senderId,
            message: data });
        msg.remove();
    }



    public send(s : string) 
    {
        try 
        {
            if(this.sendChannel.readyState == 'open')
                this. sendChannel.send(s);
        } 
        catch(err )
        {
            console.warn(`MSPEER send err: ${err.toString()}`);
        }
    }


    public closeDataChannels()
    {
        logMSPEER('Closing data channels');
        if(this.sendChannel) {
            this. sendChannel.close();
            logMSPEER('Closed data channel with label: ' + this. sendChannel.label);
        }
        if(this.receiveChannel)
        {
            this. receiveChannel.close();
            logMSPEER('Closed data channel with label: ' + this. receiveChannel.label);
        }
        if(this. localConnection)
        this. localConnection.close();

        logMSPEER('Closed peer connections');
        
         dataChannelSend.value = '';
         dataChannelReceive.value = '';
         dataChannelSend.disabled = true;

    }


}