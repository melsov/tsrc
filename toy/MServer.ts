import { MNetworkEntity, MNetworkPlayerEntity } from "./bab/NetworkEntity/MNetworkEntity";
import * as Collections from 'typescript-collections';
import { LagNetwork, LaggyPeerConnection, MakeLaggyPair, LAG_MS_FAKE } from "./LagNetwork";
import { MClient } from "./MClient";
import * as MCli from "./MClient";
// import { Fakebase } from "./Fakebase";
import { MUtils } from "./Util/MUtils";
import { Scene, Vector3, Tags, Nullable, Color3, Mesh, AbstractMesh } from "babylonjs";
import { GameMain, TypeOfGame, GameEntityTags } from "./GameMain";
import { MWorldState } from "./MWorldState";
import { MPuppetMaster, MSkin } from "./bab/MPuppetMaster";
import { CliCommand, MPlayerInput } from "./bab/MPlayerInput";
import { DebugHud } from "./html-gui/DebugHUD";
import { MPlayerAvatar } from "./bab/MPlayerAvatar";
import { MProjectileHitInfo } from "./MProjectileHitInfo";
import { MTickTimer } from "./Util/MTickTimer";
import { MPingGauge } from "./ping/MPingGauge";
import { tfirebase, RemotePlayer } from "../MPlayer";

const debugElem : HTMLDivElement = <HTMLDivElement> document.getElementById("debug");

export const ServerSimulateTickMillis : number = 90;
export const ServerBroadcastTickMillis : number = 120;
const ServerRecalcPingTickMillis : number = 800;

//
// Encapsulate objects needed per client
//
class CliEntity
{
    public lastProcessedInput : number = 0;
    public readonly pingGauge : MPingGauge = new MPingGauge();
    public roundTripMillis : number = LAG_MS_FAKE * 2;
    public didDisconnect : boolean = false;

    constructor(
        public remotePlayer : RemotePlayer
    ){
    }

}

class QueuedCliCommand
{
    constructor
    (
        public cmd : CliCommand,
        public UID : string
    )
    {}
}


// MServer
// Let each cli and the server have LaggyPeerConnection objects (stand-ins for MSPeerConnections in the webpackkk project)
// Each cli has a 'Fakebase.User' object. (stand-in for Firebase User)
// The Fakebase.User is replicated between server and client. But not the client object itself.
// Cli and Server each set-up opposing LaggyPeerConnections.
//   --each set-up matching MNetworkPlayerEntities
// Commands come in from the client.
//   Server finds that client's MNetworkPlayerEntity
//   applies (or rejects) the commands
//   (hence it updates the world state and pushes a snapshot)
// In the server broadcast loop:
//   broadcast the latest world snapshot
export class MServer 
{
    private slog : HTMLDivElement = <HTMLDivElement> document.getElementById("debug");

    private stateBuffer : Array<MWorldState> = new Array<MWorldState>();
    public readonly stateBufferMaxLength : number = 45;

    private currentState : MWorldState = new MWorldState();

    //public readonly tickRate : number = ServerUpdateTickMillis;

    private lastTime : number = 0;

    private debugHud : DebugHud = new DebugHud('ser-debug');


    // private clients : Collections.Dictionary<tfirebase.User, CliEntity> = new Collections.Dictionary<tfirebase.User, CliEntity>(tfirebase.StringForUser);
    private clients : Collections.Dictionary<string, CliEntity> = new Collections.Dictionary<string, CliEntity>();

    private game : GameMain = new GameMain(TypeOfGame.Server);

    getGameMain() : GameMain { return this.game; }

    private puppetMaster : MPuppetMaster;

    private cmdQueue : Collections.Queue<QueuedCliCommand> = new Collections.Queue<QueuedCliCommand>();

    private simulateTimer : MTickTimer = new MTickTimer(ServerSimulateTickMillis);
    private broadcastTimer : MTickTimer = new MTickTimer(ServerBroadcastTickMillis);
    private recalcPingTimer : MTickTimer = new MTickTimer(ServerRecalcPingTickMillis);

    constructor()
    {
        this.game.init();
        this.puppetMaster = new MPuppetMaster(this.game.scene);
    }

    // todo: connect with using a RemotePlayer instead
    public connect(remotePlayer : RemotePlayer) : void // user : tfirebase.User, pc : LaggyPeerConnection) : void
    {
        let user = remotePlayer.user;
        this.clients.setValue(user.UID, new CliEntity(remotePlayer));

        let netPlayer = new MNetworkPlayerEntity(user.UID);
        let playerPuppet : MPlayerAvatar =  <MPlayerAvatar> this.puppetMaster.getPuppet(netPlayer);
        netPlayer.setupPuppet(playerPuppet);
        playerPuppet.addDebugLinesInRenderLoop();
        let skin = MSkin.OrderUpASkin(this.clients.keys().length - 1);
        playerPuppet.customize(skin);

        netPlayer.setupShadow(this.game.scene, this.clients.keys().length - 1);

        this.currentState.lookup.setValue(user.UID, netPlayer);
        this.currentState.ackIndex = 1; // start with 1 to facilitate checking clients who have never ack'd

        let fakeSpawnPos = this.clients.keys().length == 1 ? new Vector3(-3, 0, 0) : new Vector3(3, 0, 0);
        netPlayer.teleport(fakeSpawnPos);

        remotePlayer.peer.recExtraCallback = (uid : string, e : MessageEvent) => {
            this.handleClientMessage(uid, e.data);
        }
    }

    public disconnect(fuser : tfirebase.User) : void
    {
        let cli = this.clients.getValue(fuser.UID);
        if(cli != undefined){
            cli.didDisconnect = true;
        }

        let ent = this.currentState.lookup.getValue(fuser.UID);
        if(ent != undefined)
        {
            ent.shouldDelete = true;
        }
    }

    public begin() : void
    {
        this.game.engine.runRenderLoop(() => {
            this.renderLoopTick();
        });
    }

    
    private renderLoopTick() : void 
    {
        this.simulateTimer.tick(this.game.engine.getDeltaTime(), ()=> {
            // if we process inside render loop, will collisions happen? 
            // this.EnqueueIncomingCliCommands();
            this.processCliCommands();
            // this.debugPutShadowsInRewindState();
        });
        
        
        this.broadcastTimer.tick(this.game.engine.getDeltaTime(), () => {
            // old update
            // this.processCliCommands();
            this.updateStateBuffer();
            this.broadcastToClients(true); // always forcing abs updates (for now)

            this.currentState.clearTransientStates(); // purge 'hits on me' for example
            this.handleDeletes();
        });

        // ping recalc
        this.recalcPingTimer.tick(this.game.engine.getDeltaTime(), () => {
            this.clients.forEach((user, cli) => {
                cli.pingGauge.recomputeAverage();
                cli.roundTripMillis = cli.pingGauge.average;
            });
        });
        
        this.interpolateForShadows();

    }


    public handleClientMessage(uid : string, msg : string) : void
    {
        this.cmdQueue.enqueue(new QueuedCliCommand(MCli.CommandFromString(msg), uid));
    }

    // enqueue commands in an order that's (hopefully) close to
    // the order in which they were sent
    // private EnqueueIncomingCliCommands() : void
    // {
    //     while(true) 
    //     {
    //         let gotACommand = false;
    //         this.clients.forEach((user : string, cli : CliEntity) => {
    //             let msg = cli.peerConnection.receiveChannel.receive();
    //             if(msg != null)
    //             {
    //                 gotACommand = true;
    //                 this.cmdQueue.enqueue(new QueuedCliCommand(MCli.CommandFromString(msg), user));
    //             }
    //         });
    //         if(!gotACommand)
    //         {
    //             break;
    //         }
    //     }
    // }    
    
    // process pending cli commands 
    // to update the current state
    private processCliCommands() : void 
    {
        let qcmd = undefined;
        while(true)
        {
            qcmd = this.cmdQueue.dequeue();
            if(qcmd == undefined) { break; }

            let playerEnt : (MNetworkPlayerEntity | undefined) = <MNetworkPlayerEntity | undefined> this.currentState.lookup.getValue(qcmd.UID);
            if(playerEnt != undefined)
            {
                playerEnt.applyCliCommand(qcmd.cmd);
                this.handleFire(playerEnt, qcmd.cmd);
            }

            // last processed input
            let cli = this.clients.getValue(qcmd.UID);
            if(cli != undefined)
            {
                cli.lastProcessedInput = qcmd.cmd.inputSequenceNumber;

                // ping gauge
                if(qcmd.cmd.lastWorldStateAckPiggyBack > 0)
                    cli.pingGauge.completeAck(qcmd.cmd.lastWorldStateAckPiggyBack);
            }
        }
        this.DebugClis();
    }

    private interpolateForShadows() : void // DEBUG: will interpolate shadows
    {
        // this.currentState.interpolate();  // turn off
    }

    private debugPutShadowsInRewindState() : void
    {
        //get player 1
        let first = this.currentState.lookup.getValue(this.currentState.lookup.keys()[0]);
        if(first == undefined) return;

        if(!this.rewindState(this.currentState, <MNetworkPlayerEntity>first)) {
            console.log(`failed to rewind for : ${first.netId}`);
            return;
        }

        this.currentState.lookup.forEach((key: string, ent : MNetworkEntity) => {
            let plent = ent.getPlayerEntity();
            if(plent != null && plent.shadow != null) {
                plent.shadow.position = plent.position.clone();
            }
        });

        this.revertStateToPresent(this.currentState);
    }

    private DebugGetAnotherPlayer(player : MNetworkPlayerEntity) : Nullable<MNetworkPlayerEntity>
    {
        let keys = this.currentState.lookup.keys();
        for(let i=0; i < keys.length; ++i) {
            if( keys[i] != player.netId) {
                return <MNetworkPlayerEntity> this.currentState.lookup.getValue(keys[i]);
            }
        }
        return null;
    }

    private DebugPutOtherInLineOfFire(firer : MNetworkPlayerEntity) : Nullable<Vector3>
    {
        let other = this.DebugGetAnotherPlayer(firer);
        if(!other) {console.warn('didnt find other player'); return null;}
        console.log(`found other ${other.netId}`);
        let origPos = other.position.clone();
        other.teleport(firer.position.add(new Vector3(2, 0, 0)));
        return origPos;
    }


    private playerFromShadow(shad : AbstractMesh) : Nullable<MNetworkPlayerEntity>
    {
        let keys = this.currentState.lookup.keys();
        for(let i=0; i< keys.length; ++i)
        {
            let ent = <MNetworkEntity> this.currentState.lookup.getValue(keys[i]);
        // this.currentState.lookup.forEach((uid, ent) => {
            let plent = ent.getPlayerEntity();

            if(plent) console.log(`plent is ${plent.netId}`);
            else console.log(`null plent? ${ent.netId}`);

            if(plent && plent.shadow) {
                if(plent.shadow.name === shad.name) { return plent; }
                else { console.log(`names neq: ${plent.shadow.name} != ${shad.name}`); }
            }
            else if(plent) {console.log(`null shadow ? ${plent.netId}`);}
            else { console.log(`null plent?? we shouldn't get here? ${ent.netId}`);}

        } //);
        console.log(`return null player from shadow`);
        return null;
    }

    // rewind time for all players (except the firer) (who should be in the latest place, per latest commands)
    private handleFire(firingPlayer : MNetworkPlayerEntity, cliCommand : CliCommand) : void
    {
        if(!cliCommand.fire) return;
 
        if(!this.rewindState(this.currentState, firingPlayer)) { 
            console.log(`rewind failed`);
            return; 
        }

        // let other = this.DebugGetAnotherPlayer(firingPlayer);
        // if(!other) { return; }
        // let origPos = other.position.clone();
        // other.teleport(firingPlayer.position.add(new Vector3(4, 0, 0)));


        // TODO: devise a test to know when what is really being ray cast and where
        // shadows are looking like a pretty good option atm.

        // but what about handling multiple shots in the same frame???
        // maybe go back to the raycast playground and try more tests


        // render the scene here so that the rewound position registers before raycasting
        this.game.scene.render();

        let pickingInfo = firingPlayer.playerPuppet.commandFire();

        if(pickingInfo) console.log(`got fire ${(pickingInfo.pickedMesh ? pickingInfo.pickedMesh.name : 'null mesh?')}`); // DBUG

        if(pickingInfo && pickingInfo.hit && pickingInfo.pickedMesh && pickingInfo.ray)
        {
            let tgs = <string | null> Tags.GetTags(pickingInfo.pickedMesh);
            if(tgs && tgs.indexOf(GameEntityTags.Shadow) >= 0) 
            {
                // maybe will need: a way of hitting objects attached to player (whose names are not identical to netId for player)
                let hitPlayer = this.playerFromShadow(pickingInfo.pickedMesh); // <MNetworkPlayerEntity | undefined> this.currentState.lookup.getValue(netIdLookup);
                if(hitPlayer != undefined && hitPlayer != null) {
                    let netIdLookup = hitPlayer.netId; // pickingInfo.pickedMesh.name; // for now
                    let prInfo = new MProjectileHitInfo(netIdLookup, firingPlayer.playerPuppet.currentProjectileType, pickingInfo.ray, 3);
                    hitPlayer.getHitByProjectile(prInfo);

                    // //DEBUG place shadow at hit pos
                    // if(hitPlayer.shadow)
                    //     hitPlayer.shadow.position = hitPlayer.position;
                }
            }
        }

        this.revertStateToPresent(this.currentState);

        // debug restore other
        // other.teleport(origPos);
    }

    private findClient(netId : string) : Nullable<CliEntity>
    {
        let cli = this.clients.getValue(netId);
        if (cli === undefined) return null;
        return cli;
    }

    private DebugAssertBufferOrderedByTimestamp() : void
    {
        if(this.stateBuffer.length <= 1) { console.log('not enough states to check order with'); return; }

        for(let i=1; i<this.stateBuffer.length; ++i)
        {
            if(this.stateBuffer[i - 1].timestamp > this.stateBuffer[i].timestamp) { 
                throw new Error(`out of order? ${this.stateBuffer[i].timestamp} is < ${this.stateBuffer[i - 1].timestamp}`)
            }
        }
        console.log('we passed: buffers ordered by timestamp');
    }
    
    private rewindState(state : MWorldState, firingPlayer : MNetworkPlayerEntity) : boolean
    {

        let cli = this.findClient(firingPlayer.netId);
        if(!cli) { console.log('no cli?'); return false;}

        let now = +new Date();
        let rewindPointMillis = now - cli.roundTripMillis - ServerBroadcastTickMillis;
        let a : Nullable<MWorldState> = null;
        let b : Nullable<MWorldState> = null;

        // find the state buffers just before (a) and
        // just after (b) rewindPointMillis
        for(let i=0; i<this.stateBuffer.length; ++i) {
            let ws = this.stateBuffer[i];
            if(ws.timestamp <= rewindPointMillis) a = ws;
            else if(ws.timestamp > rewindPointMillis)
            {
                b = ws;
                break; // world states are in timestamp order
            }
        }

        if(a && b)
        {
            state.rewindPlayers(a, b, MUtils.GetSliderNumber(a.timestamp, b.timestamp, rewindPointMillis), firingPlayer.netId);
            return true;
        } else {
            console.warn(`get a b failed: a; ${a} b: ${b} `);
            return false;
        }
    }

    private revertStateToPresent(state : MWorldState)
    {
        state.resetPlayersToPresent();
    }

    private DebugClis() : void 
    {
        let str = "";
        let num = 0;
        this.currentState.lookup.forEach((user : string, mnet : MNetworkEntity) => {
            let pl = <MNetworkPlayerEntity>(<unknown> mnet);
            let cli = this.findClient(pl.netId);
            if(cli)
                str += ` ${user}: ping: ${cli.pingGauge.average.toFixed(2)} ${(mnet.shouldDelete ? "D" : "")} / `;
        });


        this.debugHud.show(str);
    }
    
    // shift an old state out of the state buffer, if buffer is max len
    // create a new MWorldState and push it to the state buffer
    // clone the current state to the new state
    // bonus points: use a ring buffer for fewer allocations?
    private updateStateBuffer() : void
    {
        if(this.stateBuffer.length >= this.stateBufferMaxLength) {
            this.stateBuffer.shift();
        }
        let latestState = new MWorldState();
        latestState.cloneFrom(this.currentState);
        this.stateBuffer.push(latestState);
        this.currentState.ackIndex++;
        
        //
        // Debug: for shadows. push interpolation buffers
        this.currentState.pushInterpolationBuffers(this.currentState); // weirdly enough current state pushes itself to the interp buffers ;P

    }

    // each client has a last ack'd update
    // foreach cli:
    //    for now: send the latest abs state
    //    TODO: calculate a delta between their last ack'd world state and the latest
    //    send them this delta (along with an update number)
    private broadcastToClients(forceAbsUpdate ? : boolean) : void
    {
        this.clients.forEach((user : string, cli : CliEntity) => 
        {
            let cliDif = this.currentState.ackIndex - cli.lastProcessedInput;
            // console.log(`server current ack: ${this.currentState.ackIndex}. cli.lastAck: ${cli.lastAckIndex} statebuffer len ${this.stateBuffer.length}`);
            if(cliDif > 0)
            {

                // add a ping gauge entry (just before sending data)
                // current state's ackIndex was already incremented so subtract 1
                cli.pingGauge.addAck(this.currentState.ackIndex - 1); 

                // cli too far behind?
                // send an abs state
                if(forceAbsUpdate || 
                    cliDif > this.stateBuffer.length || // too far behind?
                    cli.lastProcessedInput === 0)  // never ack'd?
                {
                    let state = this.stateBuffer[this.stateBuffer.length - 1];
                    cli.remotePlayer.peer.send(PackWorldState(new ServerUpdate(state, cli.lastProcessedInput)));
                }
                else 
                {
                    throw new Error(`delta update not implemented`);
                    // // TODO : re-design cli to enable delta updates
                    
                    /*
                    let cliBaseState = this.stateBuffer[this.stateBuffer.length - cliDif];
                    MUtils.Assert(cliBaseState.ackIndex == cli.lastProcessedInput);
                    
                    let delta : MWorldState = this.stateBuffer[this.stateBuffer.length - 1].minus(cliBaseState);

                    // // CONSIDER: save delta to a temporary dictionary. lookup before recalculating
                    // // TODO: compress the delta

                    let sdelta = PackWorldState(new ServerUpdate(delta, cli.lastProcessedInput));
                    cli.remotePlayer.peer.send(sdelta);
                    */
                }
            }
        });
    }

    private handleDeletes() : void 
    {
        this.currentState.purgeDeleted(this.currentState);

        let deletables = new Array<string> ();
        this.clients.forEach((k : string, cli : CliEntity) => {
            if(cli.didDisconnect) { deletables.push(k); }
        });
        for(let k in deletables) {
            this.clients.remove(k);
        }
    }

}

export class ServerUpdate
{
    constructor(
        public worldState : MWorldState,
        public lastInputNumber : number
    ){}
}

function PackWorldState(serverUpdate : ServerUpdate) : string
{
    let str = JSON.stringify(serverUpdate); // do we need a packer func?
    return str;
}

export function UnpackWorldState(serverUpdateString : string) : ServerUpdate
{
    let jObj = JSON.parse(serverUpdateString);

    let table = jObj.worldState.lookup.table;

    let ws : MWorldState = new MWorldState() //jObj.worldState['isDelta']);
    ws.ackIndex = jObj.worldState.ackIndex;

    for(let item in table)
    {
        let mnetKV = table[item];
        ws.lookup.setValue(mnetKV['key'], MNetworkEntity.deserialize(mnetKV['value']));
    }
    
    return new ServerUpdate(ws, jObj['lastInputNumber']); //ws;
}

// museum

// private PATTERNrecursiveGetLagMsg(lagNet : LagNetwork)
// {
//     let msg = lagNet.receive();
//     if(msg == null) {
//         console.log("no msg");
//         setTimeout(() => {
//             this.PATTERNrecursiveGetLagMsg(lagNet);
//         }, 14);
//         return;
//     }
//     console.log(msg);
// }

// private testTimes() : void
// {
//     var now = + new Date();
//     let dif = now - this.lastTime;
//     this.slog.innerText = "dif: " + dif;
//     this.lastTime = now;
// }

