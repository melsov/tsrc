import * as firebase from 'firebase/app';
import 'firebase/database';
import 'firebase/auth';

import {MSPeerConnection} from './MSPeerConnection';
import { RemotePlayer, tfirebase}  from './MPlayer';

const RABaseRoomKey : string = "rooms";
const RAMaxPlayersPerRoom : Number = 8;

export class ListenServerRoomAgent 
{
    
    get roomRef() : string {
        return `${RABaseRoomKey}/${this.room}`;
    }

    get roomCountRef() : string { return `${this.roomRef}/player-count`; }

    get playersRef() : string {
        return `${this.roomRef}/players`;
    }
    
    get messageBoothRef() : string {
        return `${this.roomRef}/booth`;
    }
    
    private inboxRefFor(_userid : string) : string {
        return `${this.roomRef}/inbox/${_userid}`;
    }
    
    private debugPlayerListDiv : HTMLDivElement;
    private debugPlayerCount : HTMLDivElement;
    private debugIsServer : HTMLElement;

    userid : string;
    userDBRef : firebase.database.ThenableReference;
    
    others : Array<RemotePlayer> = new Array<RemotePlayer>();
    readyOthers : Array<RemotePlayer> = new Array<RemotePlayer>(); // awkward // TODO: make both of these maps <uid, RemotePlayer> https://howtodoinjava.com/typescript/maps/

    // server / cli callbacks
    onChannelOpened : (remote : RemotePlayer) => void = (remote : RemotePlayer) : void => {};
    onChannelClosed : (remote : RemotePlayer) => void = (remote : RemotePlayer) : void => {};

    private findReadyIndex(uid : string) : number
    {
        let ii = -1;
        this.readyOthers.forEach((o, i) => {
            console.log("found: " + o.user.UID + " other is: " + uid);
            if(o.user.UID == uid) 
            {
                ii = i; 
            }
        });
        return ii;
    }

    private debugUpdateReadyOthersDisplay() {
        let names = Array<string>();
        names.push(` me: ${this.user.UID} <br />`);
        for(let i=0; i < this.readyOthers.length; ++i){
            let other = this.readyOthers[i].user.UID;
            names.push(` ${other} <br />`);
        }

        this.debugPlayerListDiv.innerHTML = names.toString();
    }

    constructor(
        public readonly room : string, 
        public readonly user : tfirebase.User, 
        public  onIsServer : (isServer : boolean) => void
    ) 
    {
        if(this.user == undefined) { console.warn("THIS user (passed to RoomAgent constructor) is undefined"); throw new Error("user undefined"); }
        this.userid = this.user.UID;
    
        this.debugPlayerListDiv = <HTMLDivElement>document.getElementById('debugPlayerList');
        this.debugPlayerCount = <HTMLDivElement>document.getElementById('debugPlayerCount');
        this.debugIsServer = <HTMLDivElement>document.getElementById('debugIsServer');
        // push our uid to players
        this.userDBRef = firebase.database().ref(this.playersRef).push(this.user); // this.userid);
        
        this.userDBRef.then(() => {
            console.log("here's the key: " + this.userDBRef.key);
        });
    }
    
    public init()
    {
        
        // use a transaction to limit num players per room
        // Atomically update room count
        firebase.database().ref(this.roomCountRef).transaction((count) => {
            // if we're first to the room
            // we're the server
            // NOTE: running this in two chrome tabs leads to odd behavior; (running in two chrome windows seems ok)
            // OBSERVATION: this seems to get called twice sometimes (with different values for count).
            // so don't init anything based on the value of count here. (e.g. don't call 'onIsServer')
            this.debugIsServer.innerText = (count === null || count === 0) ? `Server` : `Client ${count}`;

            if(count === null || count === 0) { 
                this.user.isServer = true; 
            } 
            else { 
                this.user.isServer = false; 
            }
            
            return count + 1;
        }).then(() => {
            // set user again (now with isServer)
            this.userDBRef.set(this.user, (err : Error | null) => { if(err) console.log(`${err}`); return null; })
            .then(() => {
                
                this.onIsServer(this.user.isServer);

            firebase.database().ref(this.roomCountRef).on('value', (snap) => {
                this.debugPlayerCount.innerText = `${snap.val()}`;

                //clean up if we are the last one out of the room
                let c : number = snap.val();
                if(c == 0) {
                    firebase.database().ref(this.roomCountRef).remove();
                }
            });


            const addPeer = (rUserConfig : tfirebase.User) => { 
                console.log(`remote user config: ${rUserConfig.displayName} color: ${rUserConfig.color}`);

                // init an MSPeerConnection between us and them
                var peer = new MSPeerConnection(this.user, rUserConfig.UID, this.messageBoothRef);

                //TODO: interface MServer & MClient with LSRoomAgent

                var other = new RemotePlayer(peer, rUserConfig);
                var len : number = this.others.push(other); 

                this.others[len - 1].peer.SendChanStateChangedCallback = (rs : RTCDataChannelState, _peer : MSPeerConnection) => {
                    console.log("RoomAgent: Send state is now: " + rs.toString());
                    if(rs == "open") {
                        //this.others[len - 1].peer.send("hi hi " + len);
                        this.readyOthers.push(this.others[len - 1]);

                        console.log("***** about to send on chann open");
                        this.onChannelOpened(this.others[len - 1]);
                    }
                    else if(rs == "closing" || rs == "closed") 
                    {
                        //remove from readyOthers 
                        let i = this.findReadyIndex(other.user.UID);
                        if(i >= 0){
                            // this.readyOthers[i].cleanup();
                            this.onChannelClosed(this.readyOthers[i]);
                            this.readyOthers.splice(i,1);
                        }
                        console.log("found disconnector (Send chnnl) at: "+i+". rOthers len now: " + this.readyOthers.length);
                        this.readyOthers.forEach((other) => {
                            console.log(other.user.UID);
                        });
                    }
                    this.debugUpdateReadyOthersDisplay();
                };

                this.others[len - 1].peer.ReceiveChanStateChangedCallback = (rs : RTCDataChannelState, _peer : MSPeerConnection) => {
                    console.log("Receive state is now: " + rs.toString());
                    if(_peer != null)
                    {
                        if(rs == "closed" || rs == "closing")
                        {
                            let i = this.findReadyIndex(_peer.user.UID);
                            if(i >= 0) {
                                // this.readyOthers[i].cleanup();
                                this.onChannelClosed(this.readyOthers[i]);
                                this.readyOthers.splice(i, 1);
                            }
                            console.log("found disconnector (Rece chnnl) at: "+i+". rOthers len now: " + this.readyOthers.length);
                        }
                    }
                    this.debugUpdateReadyOthersDisplay();
                };

                return len - 1;
            }; // END ADD_PEER

            // say 'hi' to the server, if we're not the server: 
            // foreach player listed under players
            firebase.database().ref(this.playersRef).once('value')
                .then(snap => {

                    snap.forEach((child) => {
                        let rUserConfig = <tfirebase.User>(<unknown> child.val());

                        if(rUserConfig.UID == undefined) console.warn("got an undefined user");

                        if(rUserConfig.isServer) // only notify the server
                            if(rUserConfig.UID != undefined && rUserConfig.UID != this.user.UID)
                            {
                                addPeer(rUserConfig); 
                                firebase.database().ref(this.inboxRefFor(rUserConfig.UID)).push(this.user); 
                            }
                    });
                });

            // NOTE: should we be calling this inside of a then?
            // if we're the server...now that we're in the game / room
            // listen for messages from new players ('child-added') in our 'in-box'
            firebase.database().ref(this.inboxRefFor(this.userid)).on('child_added', (data) => {
                if(this.user.isServer)
                {
                    let rUserConfig = <tfirebase.User>(<unknown> data.val());
                    console.log("from my inbox: " + data.val()+ " user: " + rUserConfig.UID);

                    var index : number = addPeer(rUserConfig);
                    this.others[index].peer.createConnection();
                }
            });

            // listen for players leaving
            firebase.database().ref(this.playersRef).on('child_removed', (data) => {

                let rUserConfig = <tfirebase.User>(<unknown> data.val());
                
                // CONSIDER: We are finding unremoved players here exactly sometimes. 
                // We probably want to learn which cases make this happen; 
                // when do the channel state changed callbacks not catch this.
                let i = this.findReadyIndex(rUserConfig.UID);
                if(i >= 0){
                    // this.readyOthers[i].cleanup();
                    this.onChannelClosed(this.readyOthers[i]);
                    this.readyOthers.splice(i, 1);
                    this.debugUpdateReadyOthersDisplay();
                }
                
                console.log(`on child_removed. removed player? ${i}. `);
            });

        return null;
        }); // end of set isServer
    }); // end of count transaction .then()

    }

    // public PeerBroadcast(msg : string)
    // {
    //     this.readyOthers.forEach((other : RemotePlayer) => {
    //         other.peer.send(msg);
    //     });
    // }

    // clean up
    public onDisconnect() 
    {
        this.others.forEach((other) => {
            other.peer.closeDataChannels();
        });

        firebase.database().ref(this.roomCountRef).transaction((count) => { 
            if(count == null || count == 0) return 0; //  hope not
            return count - 1;
        });

        firebase.database().ref(this.inboxRefFor(this.userid)).remove()
            .then(() => {});

        if(this.userDBRef.key != undefined)
            firebase.database().ref(this.playersRef + "/" + this.userDBRef.key).remove()
                .then(() => { console.log("removed: " + this.userDBRef.key); });
        else 
            console.warn("our room ref was undefined");

    }
}