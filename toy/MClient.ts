import { LagNetwork, LaggyPeerConnection, LAG_MS_FAKE } from "./LagNetwork";
import * as MServer from "./MServer";
//import { Fakebase } from "./Fakebase";
import { MNetworkPlayerEntity, MNetworkEntity } from "./bab/NetworkEntity/MNetworkEntity";
import { GameMain, TypeOfGame } from "./GameMain";
import { MWorldState } from "./MWorldState";
import { MPuppetMaster, MLoadOut } from "./bab/MPuppetMaster";
import { CliCommand, MPlayerInput, KeyMoves } from "./bab/MPlayerInput";
import { DebugHud } from "./html-gui/DebugHUD";
import { Color3, Vector3, AssetsManager, MeshAssetTask } from "babylonjs";
import { MPlayerAvatar } from "./bab/MPlayerAvatar";
import { CheckboxUI } from "./html-gui/CheckboxUI";
import { MUtils } from "./Util/MUtils";
import { MTickTimer } from "./Util/MTickTimer";
import { tfirebase } from "../MPlayer";
import * as Collections from 'typescript-collections';
import { ClientControlledPlayerEntity } from "./bab/NetworkEntity/ClientControlledPlayerEntity";
import { FPSCam } from "./bab/FPSCam";
import { BHelpers } from "./MBabHelpers";
import { MMessageBoard } from "./bab/MAnnouncement";
import { ConfirmableMessageOrganizer, ConfirmableType, MAnnouncement, MPlayerReentry, MExitDeath } from "./helpers/MConfirmableMessage";
import { LifeStage, StageType } from "./MLifeCycle";
import { Mel } from "./html-gui/LobbyUI";
import { LagQueue } from "./helpers/LagQueue";
import { MAudio } from "./manager/MAudioManager";
import { MLoader } from "./bab/MAssetBook";



var fakeCommandsIndex = 0;
function MakeFakeCommand() : CliCommand
{
    let cc = new CliCommand();
        if ((fakeCommandsIndex++) % 2 == 0)
        {
            cc.horizontal = -.1;
        } else {
            cc.horizontal = .1;
        }
    return cc;
}

var g_howManyClientsSoFar = 0;

export function CommandToString(cmd : CliCommand) : string
{
    return JSON.stringify(cmd);
}

export function CommandFromString(str : string) : CliCommand
{
    let cmd = <CliCommand> JSON.parse(str);
    cmd.forward = BHelpers.Vec3FromJSON(cmd.forward);
    cmd.rotation = BHelpers.Vec3FromJSON(cmd.rotation);
    return cmd;
}

export class MClient
{

    public readonly playerEntity : ClientControlledPlayerEntity;
    private clientViewState : MWorldState = new MWorldState();
    private puppetMaster : MPuppetMaster;

    public readonly fpsCam : FPSCam;
    private input : MPlayerInput;
    private inputSequenceNumber : number = 0;
    private pendingInputs : Array<CliCommand> = new Array<CliCommand>();

    private debugHud : DebugHud;
    private debugHudInfo : DebugHud;

    private entityInterpolation : CheckboxUI = new CheckboxUI('interpolation', true);
    private serverReconciliation : CheckboxUI = new CheckboxUI('reconciliation', true);
    private clientSidePrediction : CheckboxUI = new CheckboxUI('prediction', true);

    private lobbyUI : Mel.LobbyUI = new Mel.LobbyUI();

    private DebugClientNumber : number = 0;

    private sampleInputTimer : MTickTimer = new MTickTimer(MServer.ServerSimulateTickMillis);

    private fromServer : LagQueue<string> = new LagQueue<string>(LAG_MS_FAKE);
    // private fromServer : Collections.Queue<string> = new Collections.Queue<string>();
    // private reliableFromServer : Collections.Queue<string> = new Collections.Queue<string>();

    private gotFirstServerMessage : boolean = false;

    private messageBoard : MMessageBoard = new MMessageBoard();

    private confirmMessageOrganizer : ConfirmableMessageOrganizer = new ConfirmableMessageOrganizer();

    private stageOfLifeType : StageType = StageType.DeadConfigureLoadout; // TODO: should be 'not connected'

    private loop : () => void = () => {};

    private requestLoadOutFunc : () => void = () => {};

    constructor(
        public readonly user : tfirebase.User,
        public readonly game : GameMain,
        private send : (msg : string) => void
    ) 
    {
        this.lobbyUI.showHide(true);
        this.DebugClientNumber = g_howManyClientsSoFar++;
        
        this.playerEntity = new ClientControlledPlayerEntity(this.user.UID); // MNetworkPlayerEntity(this.user.UID);
        this.puppetMaster = new MPuppetMaster(this.game.mapPackage); // this.game.scene);
        this.input = new MPlayerInput(this.DebugClientNumber > 0);
        this.input.useScene(this.game.canvas, this.game.scene);
        
        this.playerEntity.setupShadow(this.game.scene, this.DebugClientNumber);
        this.clientViewState.getPuppet = (ent : MNetworkEntity) => {
            return this.puppetMaster.getPuppet(ent);
        }
        
        this.clientViewState.setEntity(this.user.UID, this.playerEntity);
        
        MUtils.Assert(this.playerEntity.playerPuppet.mesh != undefined, "surprising!");
        
        //customize puppet
        let skin = MLoadOut.DebugCreateLoadout(this.DebugClientNumber);
        
        let playerPuppet = <MPlayerAvatar> this.puppetMaster.getPuppet(this.playerEntity);
        playerPuppet.customize(skin);
        playerPuppet.addDebugLinesInRenderLoop();
        this.setupManagers();

        this.fpsCam = new FPSCam(this.game.camera, playerPuppet.mesh);

        this.input.rightMouseToggle.callback = (isOn : boolean) => {
            this.fpsCam.toggleFOV(isOn);
        }

        this.loop = this.chooseLoadOutRenderLoop;

        this.game.engine.runRenderLoop(() => {
            this.loop();
        });

        this.debugHud = new DebugHud(this.DebugClientNumber == 0 ? "cli-debug-a" : "cli-debug-b");
        this.debugHudInfo = new DebugHud(this.DebugClientNumber == 0 ? "cli-debug-a-info" : "cli-debug-b-info");
        this.debugHudInfo.show(this.user.UID);

        this.lobbyUI.handleEnterGamePressed = (ev: MouseEvent) => {
            this.handleEnterGamePressed();

            MAudio.MAudioManager.Instance.enable(true);
        }

       
    }

    private setupManagers() : void 
    {
        MAudio.MAudioManager.SetSingleton(new MAudio.MAudioManager(this.game.scene, this.playerEntity.playerPuppet.mesh, this.game.mapPackage.assetBook));
    }

    public init() : void
    {
        this.game.init();
        this.input.init(window);
    }

    private handleLifeTransition(next : StageType) : void 
    {
        if (this.stageOfLifeType === next) 
        {
            console.log(`same life stage type: ${next}`);
            return;
        }

        // TODO: trigger send lo from an enter game button
        // TODO: show hide LOut UI

        if(this.stageOfLifeType === StageType.DeadConfigureLoadout && next === StageType.Alive) {
            console.warn(`loop will be in game`);
            this.requestLoadOutFunc = () => {};
            this.loop = this.inGameRenderLoop;
        }
        else if(this.stageOfLifeType === StageType.Alive && next === StageType.DeadConfigureLoadout) {
            console.warn(`loop will be choose lo`);
            // TODO: be dead for a bit
            this.lobbyUI.showHide(true);
            this.input.exitPointerLock(this.game.canvas, this.game.scene);
            this.loop = this.chooseLoadOutRenderLoop;
        }
        this.stageOfLifeType = next;
    }

    private handleEnterGamePressed() : void 
    {
        if(this.stageOfLifeType === StageType.DeadConfigureLoadout) {
            this.lobbyUI.showHide(false);
            this.input.enterPointerLock(this.game.canvas, this.game.scene);
            this.requestLoadOutFunc = () => { this.sendLoadOutRequest(); }
        }
    }

    private chooseLoadOutRenderLoop() : void
    {
        this.sampleInputTimer.tick(this.game.engine.getDeltaTime(), () => {
            //this.sendLoadOutRequest();
            this.requestLoadOutFunc();
            this.processServerUpdates();
        });
    }

    private debugWaitThenSendLOTimer = new MTickTimer(5);

    private sendLoadOutRequest() : void 
    {
        //this.debugWaitThenSendLOTimer.tick(this.game.engine.getDeltaTime(), () => { 

        let lo = MLoadOut.DebugCreateLoadout(this.DebugClientNumber);
        if(!lo) { return; }

        let cmd = new CliCommand();
        cmd.loadOutRequest = lo;
        cmd.confirmHashes = this.confirmMessageOrganizer.consumeHashes();

        let strcmd = CommandToString(cmd);
        console.log(`send lo req cmd:`);

        this.send(strcmd);
        
        //});
    }

    
    private inGameRenderLoop() : void
    {
        this.sampleInputTimer.tick(this.game.engine.getDeltaTime(), () => {
            this.processServerUpdates();
            if(this.gotFirstServerMessage)
                this.processInputs();
        });

        // Consider: do we need gotFirstServerMessage at this point?
        if(this.gotFirstServerMessage)
        {
            this.interpolateOthers();
            this.playerEntity.renderTick(this.game.engine.getDeltaTime());
            this.fpsCam.renderTick();
        }

        MAudio.MAudioManager.Instance.playAny();
    }

    public teardown() : void 
    {
        this.gotFirstServerMessage = false;
        // clearInterval(this.serverTickProcessHandle);
    }
    
    private processInputs() : void
    {
        let command = this.input.nextInputAxes(); // MakeFakeCommand();
        command.lastWorldStateAckPiggyBack = this.clientViewState.ackIndex;
        // if(!command.hasAMove) { 
        //     this.send(CommandToString(command)); // // still send a cmd for ack index // TODO: compress in this case
        //     return; 
        // }
        
        command.inputSequenceNumber = this.inputSequenceNumber++;
        command.forward = this.fpsCam.forward();
        command.rotation = this.game.camera.rotation.clone();

        if (this.clientSidePrediction.checked)
        {
            this.playerEntity.applyCliCommand(command); // with collisions
            this.playerEntity.createImmediateEffectsFromInput(command);
        }

        //if(command.fire <= KeyMoves.DownUpHold.Hold) console.log(command.fire);

        command.claimY = this.playerEntity.position.y;

        this.confirmMessageOrganizer.debugConsumeCheckClear(true);
        command.confirmHashes = this.confirmMessageOrganizer.consumeHashes();

        // if(command.debugGoWrongPlace){
        //     this.playerEntity.teleport(this.playerEntity.position.add(new Vector3(0, 0, 3)));
        //     console.log(`go wrong place ${this.playerEntity.position}`);
        // }

        if(command.debugTriggerKey) {
            if(this.fpsCam.offset.lengthSquared() > .00001) {
                this.fpsCam.offset = Vector3.Zero();
            } else {
                this.fpsCam.offset = new Vector3(0, 3, -3);
            }
        }
        
        command.debugPosAfterCommand = this.playerEntity.position;

        this.send(CommandToString(command));
        this.pendingInputs.push(command);
    }

    public handleServerMessage(msg : string) : void
    {
        this.fromServer.enqueue(msg);
    }
    
    private processServerUpdates() : void
    {
        while(true)
        {

            // TODO: if the update's index is < the last received index
            // throw out this update (msg can arrive out of order)
            
            let msg = this.fromServer.dequeue(); // this.peerConnection.receiveChannel.receive();
            if(msg === null || msg === undefined)
            {
                break;
            }


            // BUT... need to determine a structure / pattern
            // for client side entity states in a buffer (for interpolation).
            // either: 
            //   a buffer of world states (client side)
            // or: 
            //   a per network entity state buffer
            //   which should not be sent across the network
            // favoring 
            // the former ? since it would seem to mesh
            // well with server side lag compensation? but
            // they should both work...

            // the latter ? would seem to involve fewer dictionary lookups?

            let serverUpdate : MServer.ServerUpdate = MServer.UnpackWorldState(msg);

            //announcements
            if(serverUpdate.confirmableMessages)
            {
                this.confirmMessageOrganizer.addArray(serverUpdate.confirmableMessages);

                this.messageBoard.push(<MAnnouncement[]> this.confirmMessageOrganizer.consume(ConfirmableType.Announcement)); 

                this.handlePlayerReentry(<MPlayerReentry[]> this.confirmMessageOrganizer.consume(ConfirmableType.PlayerReentry));

                this.handleExitDeath(<MExitDeath[]> this.confirmMessageOrganizer.consume(ConfirmableType.ExitDeath));
            }

            let nextState = serverUpdate.worldState;
           
  
            // TODO: figure out how to handle deltas
            // along with interpolation
            // perhaps keep track of separate states:
            // the current authoratative state
            // the interpolated state 
            this.clientViewState.ackIndex = nextState.ackIndex;

            if(this.entityInterpolation.checked)
            {
                this.clientViewState.pushInterpolationBuffers(nextState); // nextState);
            }
            else 
            {
                // turned off (always entity interpolate)
                // MAYBE TODO: if we didn't entity interpolate, and there were deltas (not abs updates)
                // we'd need to not apply a delta twice to our own player ent,
                // which we would be doing at the moment if the lines below were uncommented

                // if(nextState.isDelta)
                //     this.worldState.applyDelta(nextState);
                // else 
                //     this.worldState.applyAbsState(nextState);
            }

            //
            // Push state changes (fire, health pickup, etc.)
            //
            this.clientViewState.pushStateChanges(nextState);
            this.clientViewState.purgeDeleted(nextState);

           

            //
            // server reconciliation
            // purge cli commands older than server update 
            // re-apply cli commands past the server update
            //
           
            // put our player in the server authoritative state
            let playerState = <MNetworkPlayerEntity> nextState.lookup.getValue(this.playerEntity.netId);
            if(playerState.playerPuppet && playerState.playerPuppet.mesh) console.warn(`got svr pos: ${playerState.playerPuppet.mesh.position}`)
            this.playerEntity.apply(playerState);

            if(!this.gotFirstServerMessage) {
                this.playerEntity.teleport(playerState.position);
                this.gotFirstServerMessage = true;
            }


            // / ******
            if(this.serverReconciliation.checked && this.clientSidePrediction.checked)
            {
                // // put our player in the server authoritative state
                // let playerState = <MNetworkPlayerEntity> nextState.lookup.getValue(this.playerEntity.netId);
                // this.playerEntity.apply(playerState);

                // reapply newer inputs
                let j = 0;

                while(j < this.pendingInputs.length)
                {
                    let input = this.pendingInputs[j];
                    if(input.inputSequenceNumber <= serverUpdate.lastInputNumber)
                    {
                        // server has already seen this input
                        this.pendingInputs.splice(j,1);
                    }
                    else 
                    {   
                        // reapply inputs beyond what server has seen
                        this.playerEntity.applyCliCommand(input);
                        j++;
                    }

                    // DEBUG:
                    // We sometimes 'think' we're seeing a jumpy adjustment in player puppet movement
                    // which we wanted to blame on a mismatch between server authoritative pos and cli
                    // command aggregated pos. but we can't find it here:
                    //let dif = this.playerEntity.position.subtract(input.debugPosAfterCommand);
                    //console.log(`dif pos reached: ${dif.length()}`);
                    
                }

                // debug pos after command
            }
           // */ 
           
        } // END WHILE TRUE

        if(!this.clientSidePrediction) { this.pendingInputs.splice(0, this.pendingInputs.length); } // just clear pending inputs (we shouldn't really need to do this...)

        this.debugHud.show(`pos: ${MUtils.RoundVecString((<MNetworkPlayerEntity>this.clientViewState.lookup.getValue(this.user.UID)).position)}`);
        
    }
 

    private interpolateOthers()
    {
        this.clientViewState.interpolate(this.playerEntity.netId);
        // this.worldState.lookup.forEach((uid : string, ent : MNetworkEntity) => {

        //     // don't interpolate our own player avatar
        //     // if(uid != this.playerEntity.netId)
        //     // {
        //         // actually do interpolate our own player. (will actually interpolate its shadow)
        //         ent.interpolate(MServer.ServerUpdateTickMillis);
        //     // } 
        // });
    }

    private handlePlayerReentry(prs :  MPlayerReentry[]) : void 
    {
        for(let i=0; i<prs.length; ++i)
        {
            let preentry = prs[i];
            let pl = this.clientViewState.lookup.getValue(preentry.netId);
            if(pl === undefined) { continue; }

            let plent = pl.getPlayerEntity();
            if(plent === null) { continue; }

            plent.teleport(preentry.spawnPos);
            plent.playerPuppet.customize(preentry.loadOut);

            console.warn(`someone got a player reentry`);

            if(preentry.netId === this.user.UID) {
                console.log(`new life transition for me: Alive`);
                this.handleLifeTransition(StageType.Alive);
            }
        }
    }

    private handleExitDeath(eds : MExitDeath[]) : void 
    {
        for(let i=0; i<eds.length; ++i)
        {
            let ed = eds[i];
            let pl = this.clientViewState.lookup.getValue(ed.deadNetId);
            if(pl == undefined) { continue; }

            let plent = pl.getPlayerEntity();
            if(plent == undefined) { continue; }

            if(ed.deadNetId === this.user.UID) {
                // we died
                this.handleLifeTransition(StageType.DeadConfigureLoadout);
                // TODO: mid screen bold announcement
            }
            this.messageBoard.add( new MAnnouncement(`${ed.killerName} ${ed.colorCommentary} ${ed.deadNetId}`) );

        }
    }
}
