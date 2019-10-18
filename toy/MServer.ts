import { MNetworkEntity, MNetworkPlayerEntity, InterpData } from "./bab/NetworkEntity/MNetworkEntity";
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
import { CheckboxUI } from "./html-gui/CheckboxUI";
import { UIDisplayDif } from "./html-gui/UIDisplayVectorDif";
import { UILabel } from "./html-gui/UILabel";
import { MStateBuffer } from "./MStateBuffer";
import { ShortNetId } from "./helpers/ShortNetId";
import { ServerUpdate, WelcomePackage } from "./comm/CommTypes";
import { UINumberSet } from "./html-gui/UINumberSet";


const debugElem : HTMLDivElement = <HTMLDivElement> document.getElementById("debug");

export const ServerSimulateTickMillis : number = 10;
export const ServerBroadcastTickMillis : number = 500;
// export const InterpolationRewindMillis : number = ServerBroadcastTickMillis * 2;

const ServerRecalcPingTickMillis : number = 40;

export const MillisPerExpandedSeconds : number = 1800; // a bit longer than standard seconds
export const AwaitRespawnExpandedSeconds : number = 5;

export const CLOSE_BY_RELEVANT_RADIUS : number = 4; // silly small for testing
export const AUDIBLE_RADIUS : number = CLOSE_BY_RELEVANT_RADIUS;

export const DEBUG_SHADOW_UI_UPDATE_RATE = 0;

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
    public lastAckIndex : number = 0;
    public readonly pingGauge : MPingGauge = new MPingGauge();
    public roundTripMillis : number = LAG_MS_FAKE * 2;
    public didDisconnect : boolean = false;
    public confirmableMessageBook : MConfirmableMessageBook = new MConfirmableMessageBook();

    public loadOut : Nullable<MLoadOut> = null;
    public readonly relevantBook = new Collections.Dictionary<string, number>();

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

    public equals(other : CliEntity) : boolean {
        return this.remotePlayer.user.UID === other.remotePlayer.user.UID;
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

    private stateBuffer = new MStateBuffer(); // : Array<MWorldState> = new Array<MWorldState>();
    // public readonly stateBufferMaxLength : number = 45;

    private currentState : MWorldState = new MWorldState();

    private debugShadowState = new MWorldState();

    //public readonly tickRate : number = ServerUpdateTickMillis;

    private lastTime : number = 0;

    private debugHud : DebugHud = new DebugHud('ser-debug');


    // private clients : Collections.Dictionary<tfirebase.User, CliEntity> = new Collections.Dictionary<tfirebase.User, CliEntity>(tfirebase.StringForUser);
    private clients : Collections.Dictionary<string, CliEntity> = new Collections.Dictionary<string, CliEntity>();
    // private shortIdBook = new ShortNetId();

    private debugForceAbsUpdate = new CheckboxUI("forceAbsUpdate", true, true); // force true
    private debugRelevancyFilter = new CheckboxUI("Relevancy", true);

    getGameMain() : GameMain { return this.game; }

    private puppetMaster : MPuppetMaster;

    private cmdQueue : LagQueue<QueuedCliCommand> = new LagQueue<QueuedCliCommand>(LAG_MS_FAKE, 0, 0, 6);
    // private cmdQueue : Collections.Queue<QueuedCliCommand> = new Collections.Queue<QueuedCliCommand>();

    private simulateTimer : MTickTimer = new MTickTimer(ServerSimulateTickMillis);
    private broadcastTimer : MTickTimer = new MTickTimer(ServerBroadcastTickMillis);
    private recalcPingTimer : MTickTimer = new MTickTimer(ServerRecalcPingTickMillis);

    private confirmableBroadcasts : Array<MAbstractConfirmableMessage> = new Array<MAbstractConfirmableMessage>();

    private lobbyUI : Mel.LobbyUI = new Mel.LobbyUI(); // only for hiding the UI in debug mode

    private debugHitPointMesh : Mesh;
    private debugFirePointMesh : Mesh;

    private broadcastsPerAck : number = 10; // sample ackIndices every broadcastsPerAck broadcast

    private debugWatchClaimPosCli : Nullable<CliEntity> = null;
    private debugUIShowCliClaimDif = new UIDisplayDif.UIDisplayVectorDif("cliClaimDisplay", "cli claim", "claim", "auth state");
    private debugDeltaUps = new UILabel('debugDeltaUps');

    public static readonly debugShadowRewindUI = new UINumberSet('ShadowRewind', 3, 
        ['broadcast multiple', 'include lag(B)', 'calc w/ ping gauge(B)'], 
        [2, 1, 1]);

    private welcomePackages = new Collections.Dictionary<RemotePlayer, WelcomePackage>();
    private shortIdBook = new ShortNetId();

    constructor(
        private game : GameMain
    )
    {
        this.game.init();
        this.puppetMaster = new MPuppetMaster(this.game.mapPackage);

        this.currentState.ackIndex = 1; // start with 1 to facilitate checking clients who have never ack'd

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
        let cli = new CliEntity(remotePlayer);
        this.clients.setValue(user.UID, cli);

        if(!this.debugWatchClaimPosCli)
            this.debugWatchClaimPosCli = cli;

        let shortId = this.shortIdBook.map(user.UID);

        let netPlayer = new MNetworkPlayerEntity(shortId);
        let playerPuppet : MPlayerAvatar = <MPlayerAvatar> this.puppetMaster.getPuppet(netPlayer);
        netPlayer.setupPuppet(playerPuppet);
        playerPuppet.addDebugLinesInRenderLoop();

        MUtils.Assert(playerPuppet.mesh != undefined, 'hard to believe');
        
        let skin = MLoadOut.DebugCreateLoadout(this.clients.keys().length - 1);
        playerPuppet.customize(skin);

        netPlayer.setupShadow(this.game.scene, this.clients.keys().length - 1);

        this.currentState.lookup.setValue(netPlayer.netId, netPlayer);
        // this.currentState.lookup.setValue(user.UID, netPlayer);

        // TODO: better spawn point chooser
        let bardoSpawnPos = this.clients.keys().length % 2 === 1 ? new Vector3(-3, 12, 0) : new Vector3(3, 12, 0);
        console.warn(`out of game spawn to: ${bardoSpawnPos}`);
        netPlayer.teleport(bardoSpawnPos);

        remotePlayer.peer.recExtraCallback = (uid : string, e : MessageEvent) => {
            this.handleClientMessage(uid, e.data);
        }

        this.welcomePackages.setValue(remotePlayer, new WelcomePackage(shortId));

        this.debugAddAShadowPlayer(netPlayer.netId);
    }

    private debugAddAShadowPlayer(origNetId : string) : void 
    {
        let shNetId = origNetId;
        let shplayer = new MNetworkPlayerEntity(shNetId);
        let shpuppet = new MPlayerAvatar(this.game.scene, Vector3.Zero(), shNetId, this.game.mapPackage);
        shplayer.setupPuppet(shpuppet);
        // customize does nothing
        this.debugShadowState.lookup.setValue(shplayer.netId, shplayer);

        shpuppet.setCharacterColor(new Color3(.5, 1, .8), Color3.White());

    }

    private spamWelcomePackages() 
    {
        this.welcomePackages.forEach((remotePlayer, wpp) => {
            let wppStr = WelcomePackage.Pack(wpp); // JSON.stringify(wpp);
            remotePlayer.peer.send(wppStr);
        });
    }

    private confirmWelcomed(userID : string) 
    {
        let keys = this.welcomePackages.keys();
        if(keys.length === 0)
            return;

        for(let i=0; i<keys.length; ++i) {
            if(userID === keys[i].user.UID) {
                this.welcomePackages.remove(keys[i]);
                return;
            }
        }

        console.log(`confirm welcome failed for ${keys.length} keys : user is : ${userID}`);
    }

    public disconnect(fuser : tfirebase.User) : void
    {
        let cli = this.clients.getValue(fuser.UID);
        if(cli != undefined){
            cli.didDisconnect = true;
        }

        
        let ent = this.getPlayerEntityFromCurrentState(fuser.UID); //  this.currentState.lookup.getValue(fuser.UID);
        if(ent != undefined)
        {
            ent.shouldDelete = true;
        }

        this.shortIdBook.remove(fuser.UID);

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
            this.spamWelcomePackages();
            // old update
            // this.processCliCommands();
            this.pushStateBuffer();
            this.broadcastToClients(this.debugForceAbsUpdate.checked); // always forcing abs updates (for now)

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


    private getPlayerEntityFromCurrentState(longId : string) : MNetworkPlayerEntity | undefined
    {
        let shortId = this.shortIdBook.getShortId(longId);
        if(shortId) {
            return <MNetworkPlayerEntity | undefined> this.currentState.lookup.getValue(shortId);
        }
        return undefined; 
    }

    private getEnt(ws : MWorldState, longId : string) : MNetworkEntity | undefined
    {
        let shortId = this.shortIdBook.getShortId(longId);
        if(shortId) {
            return ws.lookup.getValue(shortId);
        }
        return undefined;
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
            if(qcmd === undefined) { break; }


            this.confirmWelcomed(qcmd.UID);
            
            let playerEnt = this.getPlayerEntityFromCurrentState(qcmd.UID); // : (MNetworkPlayerEntity | undefined) = <MNetworkPlayerEntity | undefined> this.currentState.lookup.getValue(qcmd.UID);
            if(playerEnt !== undefined)
            {
                playerEnt.applyCliCommandServerSide(qcmd.cmd);
                this.handleFire(playerEnt, qcmd, true);

                // fake decrement health
                if(qcmd.cmd.debugTriggerKey) {
                    playerEnt.health.takeValue = playerEnt.health.val - 1;
                    if(playerEnt.health.val === 0) {
                        this.deathNotice(playerEnt.netId, playerEnt.netId);
                    }
                }
            }

            // last processed input
            let cli = this.clients.getValue(qcmd.UID);
            if(cli !== undefined)
            {
                cli.lastProcessedInput = qcmd.cmd.inputSequenceNumber;
                cli.lastAckIndex = qcmd.cmd.lastWorldStateAckPiggyBack;

                if(qcmd.cmd.lastWorldStateAckPiggyBack > 0) {
                    // ping gauge
                    cli.pingGauge.completeAck(qcmd.cmd.lastWorldStateAckPiggyBack);

                    //DEBUG show dif between cli position and position of the corresponding world state
                    if(this.debugWatchClaimPosCli && cli.equals(this.debugWatchClaimPosCli))
                        this.debugCompareCliClaimedPosRo(cli, qcmd.cmd.debugPosRoAfterCommand, qcmd.cmd.lastWorldStateAckPiggyBack);
                }

                // confirm messages with return hashes
                cli.confirmableMessageBook.confirmArray(qcmd.cmd.confirmHashes);
                cli.confirmableMessageBook.reinstateUnconfirmed(10);

                if(!cli.canRespawn) { console.log(`can't respawn ${qcmd.UID}`); }

                // player loadout request
                if(qcmd.cmd.loadOutRequest && cli.canRespawn
                    && (cli.loadOut === null)
                    //  || MLoadOut.GetHash(cli.loadOut) !== MLoadOut.GetHash(qcmd.cmd.loadOutRequest) ||
                    // (playerEnt && playerEnt.health <= 0))
                ) 
                {
                    let spawnPos = new Vector3(-3, 8, 4);
                    console.log(`got load out ${JSON.stringify(qcmd.cmd.loadOutRequest)}`);

                    // broadcast a player entry
                    this.confirmableBroadcasts.push(new MPlayerReentry(
                        `${qcmd.UID} has entered the game`,
                        this.shortIdBook.getShortIdUnsafe(qcmd.UID), // qcmd.UID,
                        qcmd.cmd.loadOutRequest,
                        spawnPos
                    ));

                    // also announce
                    this.confirmableBroadcasts.push(new MAnnouncement(`Welcome ${qcmd.UID}!`));

                    cli.loadOut = qcmd.cmd.loadOutRequest;
                    if(playerEnt !== undefined) 
                    {
                        playerEnt.health.takeValue = MAX_HEALTH;
                        playerEnt.playerPuppet.customize(qcmd.cmd.loadOutRequest);
                        playerEnt.teleport(spawnPos);
                    }
                }
            }
        }
        this.DebugClis();
    }

    private debugCompareCliClaimedPosRo(cli : CliEntity, claim : InterpData, lastAck : number) : void 
    {
        let ws = this.stateBuffer.stateWithAckIndex(lastAck);
        if(!ws) { return; }

        let ent = this.getEnt(ws, cli.remotePlayer.user.UID); // ws.lookup.getValue(cli.remotePlayer.user.UID);
        if(!ent) { throw new Error(`this is sure not to happen`); }

        let plent = <MNetworkPlayerEntity>ent.getPlayerEntity();
        let sID = plent.playerPuppet.getInterpData()
        this.debugUIShowCliClaimDif.update(claim.position, sID.position);
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
            firingPlayer.playerPuppet.arsenal.equipped().playReload();
            firingPlayer.recordWeaponAction(FireActionType.Reloaded);
            return;
        } 

        //
        // Will fire. check what they hit
        //
        firingPlayer.recordWeaponAction(FireActionType.Fired);

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
        pickingInfo = firingPlayer.playerPuppet.commandFire(cliCommand);

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

                    let beforeHealth = hitPlayer.health.val;

                    //if(!debugTestFire)
                    {
                        hitPlayer.getHitByProjectile(prInfo);
                        debugFireStr += ` ${hitPlayer.netId} got hit`;
                        
                        // became dead?
                        if(beforeHealth > 0 && hitPlayer.health.val <= 0) 
                        {
                            this.deathNotice(hitPlayer.netId, firingPlayer.netId);
                            
                            // start respawn timer
                            let hitCli = this.clients.getValue(hitPlayer.netId);
                            if(hitCli) {
                                // TODO: save their loadout somewhere
                                hitCli.loadOut = null; 
                                // TODO: start respawn timer
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

    private deathNotice(deadNetId : string, killerNetId : string)  
    {
        this.confirmableBroadcasts.push(new MExitDeath(
            deadNetId,
            killerNetId,
            new Ray(new Vector3(), Vector3.One(), 1),
            'test murdeded'));
    }

    private findClient(netId : string) : Nullable<CliEntity>
    {
        let cli = this.clients.getValue(netId);
        if (cli === undefined) return null;
        return cli;
    }


    private debugStateBufferTimes(targetTime : number, cli : CliEntity) : void 
    {
        if(this.stateBuffer.length === 0) return;
        let first = this.stateBuffer.first();
        let last = this.stateBuffer.last();
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

        let rewindPointMillis = cmdArriveTimestamp - cli.roundTripMillis / 2;

        return this.rewindStateAt(state, rewindPointMillis, firingPlayer.netId);
    }

    private debugRewindPosLabel = new UILabel('rewind-pos-label', "#FFFFFF", undefined, "SRVR", "18px");

    private rewindStateAt(state : MWorldState, rewindPointMillis : number, skipNetId ? : string) : boolean
    {
        
        let a : Nullable<MWorldState> = null;
        let b : Nullable<MWorldState> = null;

        // find the state buffers just before (a) and
        // just after (b) rewindPointMillis
        for(let i=0; i<this.stateBuffer.length; ++i) {
            let ws = this.stateBuffer.at(i);
            if(ws.timestamp <= rewindPointMillis) a = ws;
            else if(ws.timestamp > rewindPointMillis)
            {
                b = ws;
                break; // world states are in timestamp order
            }
        }

        if(a && b)
        {
            this.DebugSetRewindLabel(a.ackIndex,`REWIND ACK: ${(a.ackIndex % 100)}`);
            state.rewindPlayers(a, b, MUtils.InverseLerp(a.timestamp, b.timestamp, rewindPointMillis), skipNetId);
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

    public static DebugGetRewindConfig() : DebugRewindConfig
    {
        return new DebugRewindConfig(
            ServerBroadcastTickMillis * MServer.debugShadowRewindUI.getValueAt(0),
            MServer.debugShadowRewindUI.getValueAt(1) !== 0,
            MServer.debugShadowRewindUI.getValueAt(2) !== 0
        );
    }
     
    private getPlayerUnsafe(ws : MWorldState, netId : string) : MNetworkPlayerEntity
    {
        return <MNetworkPlayerEntity> ws.lookup.getValue(netId);
    }

    private debugLastRewindNow : number = 0;

    private debugPushShadowState()
    {
        this.debugShadowState.debugShadowCopyPlayerInterpDataFrom(this.currentState);


        ///TODO: rewind to the exact time. so that shadows mimic other players in a cli view
        // Arrange / design so that other interpolation and rewinding use the same function?
        // We think it should be the same rewind time delta (but with an offset to account for cli-to-server lag?)
        if(!this.debugWatchClaimPosCli) { return; }

        let rewindConfig = MServer.DebugGetRewindConfig();
        let lag = rewindConfig.includeLag ? LAG_MS_FAKE + (rewindConfig.includePingOverTwo ? this.debugWatchClaimPosCli.pingGauge.average / 2 : 0) : 0;

        this.rewindStateAt(this.debugShadowState, +new Date() - rewindConfig.InterpRewindMillis - lag);
      
    }

    private DebugSetRewindLabel(dNow : number, str : string) : void 
    {
        // let dNow = +new Date();
        if(dNow - this.debugLastRewindNow > DEBUG_SHADOW_UI_UPDATE_RATE) {
            this.debugRewindPosLabel.text = str;
            this.debugLastRewindNow = dNow;
        }
    }

    // shift an old state out of the state buffer, if buffer is max len
    // create a new MWorldState and push it to the state buffer
    // clone the current state to the new state
    // bonus points: use a ring buffer for fewer allocations?
    private pushStateBuffer() : void
    {
        // this.debugPushShadowState(); // WANT

        this.stateBuffer.pushACloneOf(this.currentState);
        this.currentState.ackIndex++;
        
        //
        // Debug: for shadows. push interpolation buffers
        this.currentState.updateAuthStatePushInterpolationBuffers(this.currentState); // weirdly enough current state pushes itself to the interp buffers ;P

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
        this.clients.forEach((longUID : string, cli : CliEntity) => 
        {
            let user = this.shortIdBook.getShortId(longUID);
            // let cliDif = this.currentState.ackIndex - cli.lastProcessedInput;
            // console.log(`server current ack: ${this.currentState.ackIndex}. cli.lastAck: ${cli.lastAckIndex} statebuffer len ${this.stateBuffer.length}`);
            // if(cliDif > 0)
            if(user)
            {
                
                // add a ping gauge entry every nth broadcast
                // if we sample too frequently, we risk having samples
                // get shifted out before they can be confirmed
                if(this.stateBuffer.last().ackIndex % this.broadcastsPerAck === 0)
                    cli.pingGauge.addAck(this.stateBuffer.last().ackIndex);

                let cliBaseState : Nullable<MWorldState> = forceAbsUpdate ? null : this.stateBuffer.stateWithAckDebug(cli.lastAckIndex, "SVR");
                
                // cli too far behind?
                // send an abs state
                if(forceAbsUpdate || 
                    !cliBaseState ||
                    // cliDif > this.stateBuffer.length || // too far behind?
                    cli.lastProcessedInput === 0)  // never ack'd?
                {
                    let state = this.stateBuffer.last().relevancyShallowClone(
                        <MNetworkPlayerEntity | undefined> this.currentState.lookup.getValue(user), 
                        this.game.scene, 
                        cli.relevantBook, 
                        CLOSE_BY_RELEVANT_RADIUS * (this.debugRelevancyFilter.checked ? 1 : 9999999));

                    // TODO: Cli side problem mostly: when an other player becomes irrelevant for a bit and then relevant again,
                    // we see 'shaking' (looks like very spread out, weird, out of order interp data)
                    // the shaking only appears in a cli view of the other.
                    // seems to go away, quickly or immediately, when abs updates are forced
                    // diagnose, fix

                    let su = new ServerUpdate(state, cli.lastProcessedInput);  

                    // send confirmable messages
                    cli.confirmableMessageBook.addArray(this.confirmableBroadcasts);
                    su.confirmableMessages = cli.confirmableMessageBook.getUnconfirmedMessagesMoveToSent();
                    
                    cli.remotePlayer.peer.send(ServerUpdate.Pack(su));

                    this.debugDeltaUps.color = "#FFFF00";
                    this.debugDeltaUps.text = `AU cli.AckI: ${cli.lastAckIndex} from: ${state.deltaFromIndex} to: ${state.ackIndex}`;
                }
                else // Delta update
                {
                    if(cliBaseState) 
                    {
                        // let delta = this.stateBuffer.last().deltaFrom(cliBaseState);
                        let delta = this.stateBuffer.last().relevancyShallowCloneOrDeltaFrom(
                            cliBaseState,
                            <MNetworkPlayerEntity | undefined> this.currentState.lookup.getValue(user),
                            this.game.scene,
                            cli.relevantBook,
                            CLOSE_BY_RELEVANT_RADIUS * (this.debugRelevancyFilter.checked ? 1 : 9999999));

                        let su = new ServerUpdate(delta, cli.lastProcessedInput);

                        // su.dbgSomeState = cliBaseState; // this.stateBuffer.last(); // DEBUG

                        // send confirmable messages
                        cli.confirmableMessageBook.addArray(this.confirmableBroadcasts);
                        su.confirmableMessages = cli.confirmableMessageBook.getUnconfirmedMessagesMoveToSent();

                        cli.remotePlayer.peer.send(ServerUpdate.Pack(su)); 

                        if(this.debugWatchClaimPosCli === cli) {
                            let deltaUser = delta.lookup.getValue(user);
                            if(deltaUser) {
                                let plent = deltaUser.getPlayerEntity();
                                if(plent)
                                    this.debugDeltaUps.text = `SEND DELTA POS: ${plent.position}`;
                            }
                        }

                    } else {
                        throw new Error(`no way. cant happen.`);
                    }
                   
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

export class DebugRewindConfig
{
    constructor(
        public InterpRewindMillis : number, 
        public includeLag : boolean,
        public includePingOverTwo : boolean
    ){}
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

