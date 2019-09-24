import { MNetworkEntity, MNetworkPlayerEntity } from "./bab/NetworkEntity/MNetworkEntity";
import * as Collections from 'typescript-collections';
import { LagNetwork, LaggyPeerConnection, MakeLaggyPair, LAG_MS_FAKE } from "./LagNetwork";
import { MClient } from "./MClient";
import * as MCli from "./MClient";
// import { Fakebase } from "./Fakebase";
import { MUtils } from "./Util/MUtils";
import { Scene, Vector3, Tags, Nullable, Color3, Mesh, AbstractMesh, Ray, MeshBuilder, RayHelper, PickingInfo } from "babylonjs";
import { GameMain, TypeOfGame, GameEntityTags } from "./GameMain";
import { MWorldState } from "./MWorldState";
import { MPuppetMaster, MLoadOut } from "./bab/MPuppetMaster";
import { CliCommand, MPlayerInput, KeyMoves } from "./bab/MPlayerInput";
import { DebugHud } from "./html-gui/DebugHUD";
import { MPlayerAvatar, MAX_HEALTH } from "./bab/MPlayerAvatar";
import { MProjectileHitInfo } from "./bab/NetworkEntity/transient/MProjectileHitInfo";
import { MTickTimer } from "./Util/MTickTimer";
import { MPingGauge } from "./ping/MPingGauge";
import { tfirebase, RemotePlayer } from "../MPlayer";
import {  MAnnounce } from "./bab/MAnnouncement";
import { MConfirmableMessageBook, MAnnouncement, MAbstractConfirmableMessage, MPlayerReentry, MExitDeath } from "./helpers/MConfirmableMessage";
import { LagQueue } from "./helpers/LagQueue";
import { Mel } from "./html-gui/LobbyUI";
import { MAudio } from "./loading/MAudioManager";
import { GridMaterial } from "babylonjs-materials";
import { FireActionType } from "./bab/NetworkEntity/transient/MTransientStateBook";

const debugElem : HTMLDivElement = <HTMLDivElement> document.getElementById("debug");

export const ServerSimulateTickMillis : number = 10;
export const ServerBroadcastTickMillis : number = 20;
const ServerRecalcPingTickMillis : number = 40;

export const MillisPerExpandedSeconds : number = 1800; // a bit longer than standard seconds
export const AwaitRespawnExpandedSeconds : number = 5;

export const CLOSE_BY_RELEVANT_RADIUS : number = 4; // silly small for testing
export const AUDIBLE_RADIUS : number = CLOSE_BY_RELEVANT_RADIUS;

export enum Relevancy
{
    NOT_RELEVANT = 0,
    RECENTLY_RELEVANT = 20
}

//
// Encapsulate objects needed per client
//
class CliEntity
{
    public lastProcessedInput : number = 0;
    public readonly pingGauge : MPingGauge = new MPingGauge();
    public roundTripMillis : number = LAG_MS_FAKE * 2;
    public didDisconnect : boolean = false;
    public confirmableMessageBook : MConfirmableMessageBook = new MConfirmableMessageBook();

    public loadOut : Nullable<MLoadOut> = null;
    public readonly relevantBook : Collections.Dictionary<string, number> = new Collections.Dictionary<string, number>();

    // Respawn
    private _canRespawn : boolean = true;
    get canRespawn() : boolean { return this._canRespawn; }
    startRespawnTimer() : void 
    {
        if(!this._canRespawn) return;
        this._canRespawn = false;
        window.setTimeout(() => {
            this._canRespawn = true;
        }, AwaitRespawnExpandedSeconds * 1000);
    }

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
        public UID : string,
        public readonly arrivedTimestamp : number
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

    // = new GameMain(TypeOfGame.Server);

    getGameMain() : GameMain { return this.game; }

    private puppetMaster : MPuppetMaster;

    private cmdQueue : LagQueue<QueuedCliCommand> = new LagQueue<QueuedCliCommand>(LAG_MS_FAKE);
    // private cmdQueue : Collections.Queue<QueuedCliCommand> = new Collections.Queue<QueuedCliCommand>();

    private simulateTimer : MTickTimer = new MTickTimer(ServerSimulateTickMillis);
    private broadcastTimer : MTickTimer = new MTickTimer(ServerBroadcastTickMillis);
    private recalcPingTimer : MTickTimer = new MTickTimer(ServerRecalcPingTickMillis);

    private confirmableBroadcasts : Array<MAbstractConfirmableMessage> = new Array<MAbstractConfirmableMessage>();

    private lobbyUI : Mel.LobbyUI = new Mel.LobbyUI(); // only for hiding the UI in debug mode

    private debugHitPointMesh : Mesh;
    private debugFirePointMesh : Mesh;

    private broadcastsPerAck : number = 10; // sample ackIndices every broadcastsPerAck broadcast

    constructor(
        private game : GameMain
    )
    {
        this.game.init();
        this.puppetMaster = new MPuppetMaster(this.game.mapPackage);

        //if(!_wan)
        this.lobbyUI.showHide(false);

        this.debugHitPointMesh = MeshBuilder.CreateCylinder(`srvr-show-hit-debug`, {
            height : 6,
            diameter : 2
        }, this.game.scene);
        let mat = new GridMaterial(`debug-srvr-hitPoint-mat`, this.game.scene);
        mat.mainColor = new Color3(1, .6, .6);
        this.debugHitPointMesh.material = mat;

        this.debugFirePointMesh = MeshBuilder.CreateCylinder(`srvr-show-hit-debug`, {
            height : 6,
            diameter : 2
        }, this.game.scene);
        let fmat = new GridMaterial(`debug-srvr-firefrom-mat`, this.game.scene);
        fmat.mainColor = new Color3(0, 1, .6);
        this.debugFirePointMesh.material = fmat;
    }

    // TODO: mechanism for allowing player to get a load out and agree to enter the game
    // let them connect to the room, hope that they don't take too long to choose their load out.
    // if they take too long, boot them from the room (life status not connected)
    // so inside of connect: send them DeadChoosingLoadOut
    // they can send a command that includes load out particulars (a load out object)
    // add this as a life cycle on their ent in the current state
    // mark this update as 'needs confirm' (a new bool for world updates!)
    
    public connect(remotePlayer : RemotePlayer) : void
    {
        let user = remotePlayer.user;
        this.clients.setValue(user.UID, new CliEntity(remotePlayer));

        let netPlayer = new MNetworkPlayerEntity(user.UID);
        let playerPuppet : MPlayerAvatar =  <MPlayerAvatar> this.puppetMaster.getPuppet(netPlayer);
        netPlayer.setupPuppet(playerPuppet);
        playerPuppet.addDebugLinesInRenderLoop();

        MUtils.Assert(playerPuppet.mesh != undefined, 'hard to believe');
        
        let skin = MLoadOut.DebugCreateLoadout(this.clients.keys().length - 1);
        playerPuppet.customize(skin);

        netPlayer.setupShadow(this.game.scene, this.clients.keys().length - 1);

        this.currentState.lookup.setValue(user.UID, netPlayer);
        this.currentState.ackIndex = 1; // start with 1 to facilitate checking clients who have never ack'd

        // TODO: better spawn point chooser
        let bardoSpawnPos = this.clients.keys().length % 2 === 1 ? new Vector3(-3, 12, 0) : new Vector3(3, 12, 0);
        console.warn(`out of game spawn to: ${bardoSpawnPos}`);
        netPlayer.teleport(bardoSpawnPos);

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
            // this.EnqueueIncomingCliCommands();
            this.processCliCommands();
            // this.debugDoTestFire();
            // this.debugPutShadowsInRewindState();
        });
        
        
        this.broadcastTimer.tick(this.game.engine.getDeltaTime(), () => {
            // old update
            // this.processCliCommands();
            this.updateStateBuffer();
            this.broadcastToClients(true); // always forcing abs updates (for now)

            this.currentState.clearTransientStates(); // purge 'hits on me' for example
            this.handleDeletes();

            // fake announcement
            // this.confirmableBroadcasts.shift();
            // this.confirmableBroadcasts.push(new MAnnouncement(`fake announcement ${this.currentState.ackIndex}`));
            
        });

        // ping recalc
        this.recalcPingTimer.tick(this.game.engine.getDeltaTime(), () => {
            this.clients.forEach((user, cli) => {
                cli.pingGauge.recomputeAverage();
                if(cli.pingGauge.average > 0) // at least?
                    cli.roundTripMillis = cli.pingGauge.average;
            });
        });
       
    }

    public handleClientMessage(uid : string, msg : string) : void
    {
        this.cmdQueue.enqueue(new QueuedCliCommand(MCli.CommandFromString(msg), uid, +new Date()));
    }

    // TODO: players are either not starting in a spot that synced with server pos
    // or evolving out of synced pos. 
    
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
                playerEnt.applyCliCommandServerSide(qcmd.cmd);
                this.handleFire(playerEnt, qcmd, true);

                // fake decrement health
                if(qcmd.cmd.debugTriggerKey) {
                    playerEnt.health--;
                    if(playerEnt.health === 0) {
                        this.confirmableBroadcasts.push(new MExitDeath(
                            playerEnt.netId,
                            playerEnt.netId,
                            new Ray(new Vector3(), Vector3.One(), 1),
                            'test murdeded'));
                    }
                }
            }

            // last processed input
            let cli = this.clients.getValue(qcmd.UID);
            if(cli != undefined)
            {
                cli.lastProcessedInput = qcmd.cmd.inputSequenceNumber;

                // ping gauge
                if(qcmd.cmd.lastWorldStateAckPiggyBack > 0)
                    cli.pingGauge.completeAck(qcmd.cmd.lastWorldStateAckPiggyBack);

                // confirm messages with return hashes
                cli.confirmableMessageBook.confirmArray(qcmd.cmd.confirmHashes);

                if(!cli.canRespawn) { console.log(`can't respawn ${qcmd.UID}`); }
                // player loadout request
                if(qcmd.cmd.loadOutRequest && cli.canRespawn
                    && (cli.loadOut === null || MLoadOut.GetHash(cli.loadOut) !== MLoadOut.GetHash(qcmd.cmd.loadOutRequest) ||
                    (playerEnt && playerEnt.health <= 0))
                ) 
                {
                    let spawnPos = new Vector3(-3, 8, 4);
                    console.log(`got load out ${JSON.stringify(qcmd.cmd.loadOutRequest)}`);

                    // broadcast a player entry
                    this.confirmableBroadcasts.push(new MPlayerReentry(
                        `${qcmd.UID} has entered the game`,
                        qcmd.UID,
                        qcmd.cmd.loadOutRequest,
                        spawnPos
                    ));

                    // also announce
                    this.confirmableBroadcasts.push(new MAnnouncement(`Welcome ${qcmd.UID}!`));

                    cli.loadOut = qcmd.cmd.loadOutRequest;
                    if(playerEnt !== undefined) 
                    {
                        playerEnt.health = MAX_HEALTH;
                        playerEnt.playerPuppet.customize(qcmd.cmd.loadOutRequest);
                        playerEnt.teleport(spawnPos);
                    }
                }
            }
        }
        this.DebugClis();
    }

    private debugDoTestFire() : void
    {
        if(this.currentState.lookup.keys().length < 2) { return; }

        let k = this.currentState.lookup.keys()[0];
        let ent = this.currentState.lookup.getValue(k);
        if(!ent) return;
        let plent = ent.getPlayerEntity();
        if(!plent) return;

        let fakeCMD = new CliCommand();
        fakeCMD.fire = KeyMoves.DownUpHold.Down;
        fakeCMD.forward = plent.playerPuppet.mesh.forward;
        let fakeqcmd = new QueuedCliCommand(fakeCMD, plent.netId, -1);
        this.handleFire(plent, fakeqcmd, true);
    }

    private interpolateForShadows() : void // DEBUG: will interpolate shadows
    {
        // this.currentState.interpolate();  // turn off
    }

    private debugPutShadowsInRewindState() : void
    {
        // // get player 1
        // let first = this.currentState.lookup.getValue(this.currentState.lookup.keys()[0]);
        // if(first == undefined) return;

        // if(!this.rewindState(this.currentState, <MNetworkPlayerEntity>first)) {
        //     console.log(`failed to rewind for : ${first.netId}`);
        //     return;
        // }

        // this.currentState.lookup.forEach((key: string, ent : MNetworkEntity) => {
        //     let plent = ent.getPlayerEntity();
        //     if(plent != null && plent.shadow != null) {
        //         plent.shadow.position = plent.position.clone();
        //     }
        // });

        // this.revertStateToPresent(this.currentState);
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
 

    // private playerFromShadow(shad : AbstractMesh) : Nullable<MNetworkPlayerEntity>
    // {
    //     let keys = this.currentState.lookup.keys();
    //     for(let i=0; i< keys.length; ++i)
    //     {
    //         let ent = <MNetworkEntity> this.currentState.lookup.getValue(keys[i]);
    //     // this.currentState.lookup.forEach((uid, ent) => {
    //         let plent = ent.getPlayerEntity();

    //         if(plent) console.log(`plent is ${plent.netId}`);
    //         else console.log(`null plent? ${ent.netId}`);

    //         if(plent && plent.shadow) {
    //             if(plent.shadow.name === shad.name) { return plent; }
    //             else { console.log(`names neq: ${plent.shadow.name} != ${shad.name}`); }
    //         }
    //         else if(plent) {console.log(`null shadow ? ${plent.netId}`);}
    //         else { console.log(`null plent?? we shouldn't get here? ${ent.netId}`);}

    //     } //);
    //     console.log(`return null player from shadow`);
    //     return null;
    // }

    private DEBUG_INCLUDE_REWIND : boolean = true;
    private debugFireRayH : RayHelper = new RayHelper(new Ray(Vector3.Zero(), Vector3.One(), 1));

    // rewind time for all players (except the firer) (who should be in the latest place, per latest commands)
    private handleFire(firingPlayer : MNetworkPlayerEntity, qcmd : QueuedCliCommand, debugTestFire ? : boolean) : void
    {
        let cliCommand = qcmd.cmd;
        
        if(!firingPlayer.playerPuppet.arsenal.equipped().keyAllowsFire(cliCommand.fire)) {
            return;
        }

        if(!firingPlayer.playerPuppet.arsenal.equipped().isAmmoInClip()) {
            firingPlayer.recordWeaponFired(FireActionType.Reloaded);
            return;
        } 

        firingPlayer.recordWeaponFired(FireActionType.Fired);

        // TODO: isolate. for example. don't even rewind state (maybe this messes with us?)
        // with rewind disabled. check if rays behave
        
        if(this.DEBUG_INCLUDE_REWIND && !this.rewindState(this.currentState, firingPlayer, qcmd.arrivedTimestamp)) { 
            console.log(`rewind failed`);
            MUtils.SetGridMaterialColor(this.debugFirePointMesh.material, new Color3(.3, .7, .8));
            return; 
        } 
        
        this.debugFirePointMesh.position = firingPlayer.position;
        MUtils.SetGridMaterialColor(this.debugFirePointMesh.material, new Color3(0, .9, .3));
        
        // let other = this.DebugGetAnotherPlayer(firingPlayer);
        // if(!other) { return; }
        // let origPos = other.position.clone();
        // other.teleport(firingPlayer.position.add(new Vector3(4, 0, 0)));
        
        
        // TODO: correct loadouts in other cli's view
        
        // TODO: devise a test to know when what is really being ray cast and where
        // shadows are looking like a pretty good option atm.
        
        // but what about handling multiple shots in the same frame???
        // maybe go back to the raycast playground and try more tests
        
        
        // render the scene here. Seems needed to get the rewound position to register before raycasting
        this.game.scene.render();
        let pickingInfo : Nullable<PickingInfo> = null;
        pickingInfo = firingPlayer.playerPuppet.commandFire(cliCommand.fire, cliCommand.forward);

        //DEBUG
        let debugFireStr = "DBUG";
        if(pickingInfo) {
            debugFireStr += pickingInfo && pickingInfo.hit && pickingInfo.pickedMesh && pickingInfo.ray ? " will hit: " : `won't hit `;
            debugFireStr += `${firingPlayer.netId} shot at ${(pickingInfo.pickedMesh ? pickingInfo.pickedMesh.name : 'null mesh? ')}`;
            debugFireStr += ` hit ${pickingInfo.hit}`;
            debugFireStr += pickingInfo.ray === null ? ' null ray ' : ' yes ray ';
        }
        else debugFireStr = `fire missed`;

        // MORE DEBUG: RAY
        if(debugTestFire) {
            this.debugFireRayH.hide();
            this.debugFireRayH.dispose();
        }
        //END-DEBUG
        
        if(pickingInfo && pickingInfo.hit && pickingInfo.pickedMesh && pickingInfo.ray)
        {
            //DEBUG
            let debugHitAPlayer = 0;
            if(debugTestFire) this.debugFireRayH.ray = pickingInfo.ray;

            //DEBUG
            if(pickingInfo.pickedPoint) {
                this.debugHitPointMesh.position = pickingInfo.pickedPoint;
                MUtils.SetGridMaterialColor(this.debugHitPointMesh.material, new Color3(1, .7, .7));
            }

            let tgs = <string | null> Tags.GetTags(pickingInfo.pickedMesh);
            debugFireStr += `. tags: ${tgs}`;
            if(tgs && tgs.indexOf(GameEntityTags.PlayerObject) >= 0) 
            {
                // maybe will need: a way of hitting objects attached to player (whose names are not identical to netId for player)
                debugHitAPlayer++;
                let hitPlayer = <MNetworkPlayerEntity | undefined> this.currentState.lookup.getValue(pickingInfo.pickedMesh.name);
                if(hitPlayer != undefined && hitPlayer != null) 
                {
                    debugHitAPlayer++;

                    MUtils.SetGridMaterialColor(this.debugHitPointMesh.material, new Color3(.1, .4, 1)); //DEBUG

                    let netIdLookup = hitPlayer.netId; // pickingInfo.pickedMesh.name; // for now
                    let prInfo = new MProjectileHitInfo(
                        netIdLookup, 
                        firingPlayer.playerPuppet.currentProjectileType, 
                        pickingInfo.ray, 
                        3,
                        pickingInfo.pickedPoint ? pickingInfo.pickedPoint : Vector3.Zero());

                    let beforeHealth = hitPlayer.health;

                    //if(!debugTestFire)
                    {
                        hitPlayer.getHitByProjectile(prInfo);
                        debugFireStr += ` ${hitPlayer.netId} got hit`;
                        
                        // became dead?
                        if(beforeHealth > 0 && hitPlayer.health <= 0) 
                        {
                            this.confirmableBroadcasts.push(new MExitDeath(
                                hitPlayer.netId,
                                firingPlayer.netId,
                                pickingInfo.ray,
                                'wasted' ));

                            // start respawn timer
                            let hitCli = this.clients.getValue(hitPlayer.netId);
                            if(hitCli) {

                            }
                        }
                    }

                    // //DEBUG place shadow at hit pos
                    // if(hitPlayer.shadow)
                    //     hitPlayer.shadow.position = hitPlayer.position;
                }
            }
            
            if(debugTestFire)
                this.debugFireRayH.show(this.game.scene, debugHitAPlayer == 0 ? Color3.White() : (debugHitAPlayer == 1 ? new Color3(1, .5, .5) : Color3.Red()));
            
        }
        //DEBUG
        else if(pickingInfo) {
            console.log(`hit? ${pickingInfo.hit}, mesh? ${pickingInfo.pickedMesh !== null}, ray? ${pickingInfo.ray !== null} `);
        }

        if(this.DEBUG_INCLUDE_REWIND)
            this.revertStateToPresent(this.currentState);

        //DEBUG
        console.log(debugFireStr);
        this.confirmableBroadcasts.push(new MAnnouncement(debugFireStr));
        //END DEBUG

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

    private debugStateBufferTimes(targetTime : number, cli : CliEntity) : void 
    {
        if(this.stateBuffer.length === 0) return;
        let first = this.stateBuffer[0];
        let last = this.stateBuffer[this.stateBuffer.length - 1];
        let msg = "CONTAINS";
        if(last.timestamp < targetTime) msg = "TARGET IN FUTURE";
        else if (first.timestamp > targetTime) msg = "TARGET IN PAST";

        let span = last.timestamp - first.timestamp;
        let targetSpan = targetTime - first.timestamp;

        let commenarty = "";
        if(last.timestamp < first.timestamp) commenarty = "last before first?";
        if(cli.roundTripMillis <= 0) commenarty += " cli.rTT neg or zero?";

        console.log(`${msg} span: ${span}. target span: ${targetSpan}. ${commenarty} . calc as: -${cli.roundTripMillis} -${ServerBroadcastTickMillis}`);
    }
    
    private rewindState(state : MWorldState, firingPlayer : MNetworkPlayerEntity, cmdArriveTimestamp : number) : boolean
    {

        let cli = this.findClient(firingPlayer.netId);
        if(!cli) { console.log('no cli?'); return false;}

        
        // let rewindPointMillis = +new Date() - cli.roundTripMillis / 2 - ServerBroadcastTickMillis;
        let rewindPointMillis = cmdArriveTimestamp - cli.roundTripMillis / 2;

        let a : Nullable<MWorldState> = null;
        let b : Nullable<MWorldState> = null;

        this.debugStateBufferTimes(rewindPointMillis, cli);

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
            if(cli) {
                str += ` ${user}: ping: ${cli.pingGauge.average.toFixed(2)} ${(mnet.shouldDelete ? "D" : "")} / `;
                str += cli.pingGauge.debugStr;
            }
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

    // ***TODO****: continuous ray to show potential hits
    // for (say) first player.

    // CONSIDER ! : rewind should go back only by half of rTT!

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
            // if(cliDif > 0)
            {
                
                // cli too far behind?
                // send an abs state
                if(forceAbsUpdate || 
                    cliDif > this.stateBuffer.length || // too far behind?
                    cli.lastProcessedInput === 0)  // never ack'd?
                {
                    let state = this.stateBuffer[this.stateBuffer.length - 1].relevancyShallowClone(
                        <MNetworkPlayerEntity | undefined> this.currentState.lookup.getValue(user), 
                        this.game.scene, 
                        cli.relevantBook, 
                        CLOSE_BY_RELEVANT_RADIUS);
                        let su = new ServerUpdate(state, cli.lastProcessedInput);  
                        
                    // add a ping gauge entry every nth broadcast
                    // if we sample too frequently, we risk having samples
                    // get shifted out before they can be confirmed
                    if(state.ackIndex % this.broadcastsPerAck === 0)
                        cli.pingGauge.addAck(state.ackIndex);

                    // TODO: convert Server Update to 'any'
                    // so that we can decline to add properties that we don't need

                    // send confirmable messages
                    cli.confirmableMessageBook.addArray(this.confirmableBroadcasts);
                    su.confirmableMessages = cli.confirmableMessageBook.getUnconfirmedMessages(); // this.confirmableMessages;

                    cli.remotePlayer.peer.send(PackWorldState(su));
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

        this.confirmableBroadcasts.splice(0, this.confirmableBroadcasts.length);  // clear broadcasts
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

    public confirmableMessages : Nullable<Array<MAbstractConfirmableMessage>> = null;

    constructor(
        public worldState : MWorldState,
        public lastInputNumber : number
    ){}
}

function PackWorldState(serverUpdate : any) : string
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
    
    let su = new ServerUpdate(ws, jObj['lastInputNumber']); //ws;
    su.confirmableMessages = MAnnounce.FromServerUpdate(jObj);

    return su;
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

