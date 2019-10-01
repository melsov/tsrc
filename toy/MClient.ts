import { LagNetwork, LaggyPeerConnection, LAG_MS_FAKE } from "./LagNetwork";
import * as MServer from "./MServer";
//import { Fakebase } from "./Fakebase";
import { MNetworkPlayerEntity, MNetworkEntity, InterpData } from "./bab/NetworkEntity/MNetworkEntity";
import { GameMain, TypeOfGame } from "./GameMain";
import { MWorldState } from "./MWorldState";
import { MPuppetMaster, MLoadOut } from "./bab/MPuppetMaster";
import { CliCommand, MPlayerInput, KeyMoves } from "./bab/MPlayerInput";
import { DebugHud } from "./html-gui/DebugHUD";
import { Color3, Vector3, AssetsManager, MeshAssetTask, TransformNode, Nullable } from "babylonjs";
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
import { MAudio } from "./loading/MAudioManager";
import { MLoader } from "./bab/MAssetBook";
import { UIVector3 } from "./html-gui/UIVector3";
import { MParticleManager } from "./loading/MParticleManager";
import { UILabel } from "./html-gui/UILabel";
import { MStateBuffer } from "./MStateBuffer";



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
    cmd.debugPosRoAfterCommand = InterpData.FromJSON(cmd.debugPosRoAfterCommand);
    return cmd;
}

export class MClient
{

    public readonly playerEntity : ClientControlledPlayerEntity;
    private clientViewState : MWorldState = new MWorldState();
    private stateBuffer : MStateBuffer = new MStateBuffer();
    private puppetMaster : MPuppetMaster;

    public readonly fpsCam : FPSCam;
    private input : MPlayerInput;
    private inputSequenceNumber : number = 0;
    private pendingInputs : Array<CliCommand> = new Array<CliCommand>();

    private debugHud : DebugHud;
    private debugHudInfo : DebugHud;

    private debugDeltaUpdates = new UILabel("debugDeltaUpdates", "#33FF88");

    private entityInterpolation : CheckboxUI = new CheckboxUI('interpolation', true);
    private serverReconciliation : CheckboxUI = new CheckboxUI('reconciliation', true);
    private clientSidePrediction : CheckboxUI = new CheckboxUI('prediction', true);
    private justIgnoreServer : CheckboxUI = new CheckboxUI('ignoreServer', false); 

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

    private debugWeapOffsetUI : UIVector3;
    private debugCliDataBeforeReconciliation : InterpData = new InterpData();

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

        this.fpsCam = new FPSCam(this.game.camera, playerPuppet.mesh, Vector3.Up().scale(8));

        playerPuppet.setupClientPlayer(this.fpsCam.cam);

        this.debugWeapOffsetUI = new UIVector3("weapOffsetContainer");
        this.debugWeapOffsetUI.setValues(playerPuppet.weaponRoot.getPositionExpressedInLocalSpace());
        this.debugWeapOffsetUI.doInputChanged = (v : Vector3) => {
            console.log(`set weapon root to: ${v}`);
            playerPuppet.debugSetWeaponRootPos(v);
        };
        

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
        MParticleManager.SetSingleton(new MParticleManager(this.game.mapPackage, this.playerEntity.playerPuppet.mesh));
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
        else if(this.stageOfLifeType === StageType.Alive && next === StageType.Bardo) {
            this.lobbyUI.showHide(true);
            this.input.exitPointerLock(this.game.canvas, this.game.scene);
            this.stageOfLifeType = next;
            this.doBardoTimeout(() => {
                this.handleLifeTransition(StageType.DeadConfigureLoadout);
            });
        }
        else if(this.stageOfLifeType === StageType.Bardo && next === StageType.DeadConfigureLoadout) {
            console.warn(`loop will be choose lo`);
            // TODO: be dead for a bit
            this.lobbyUI.showEnterButton();
            this.lobbyUI.showHide(true);
            this.input.exitPointerLock(this.game.canvas, this.game.scene);
            this.loop = this.chooseLoadOutRenderLoop;
        }
        this.stageOfLifeType = next;
    }

    private doBardoTimeout(callback : () => void) : void 
    {
        let handle = -1;
        let remaining = MServer.AwaitRespawnExpandedSeconds;
        handle = window.setInterval(() => {
            console.log(`bardo: ${remaining}`);
            this.lobbyUI.showCountDown(remaining);
            if(--remaining === 0) {
                window.clearInterval(handle);
                callback();
            }
        }, MServer.MillisPerExpandedSeconds);
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
            // TODO: check whether we log out of firebase if we leave during this loop
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
        MParticleManager.Instance.playAny();
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
        command.rotation = this.game.camera.rotation.clone(); // ? not fps cam rotation?

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
        
        //TODO: instead send the pos before prediction is applied
        // referencing this with last ack index 
        // the server should be able to check if the position 
        // matches the position it sees at that ack
        command.debugPosRoAfterCommand = this.debugCliDataBeforeReconciliation; // this.playerEntity.position;

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
            if(msg === null || msg === undefined || this.justIgnoreServer.checked)
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

            this.debugDeltaUpdates.text = "";
           
            let absNextState : Nullable<MWorldState> = null;
            if(!nextState.isDelta) {
                absNextState = nextState;
            } else {
                // find the base state 
                let baseState = this.stateBuffer.stateWithAckDebug(nextState.deltaFromIndex, "CLI");
                if(!baseState) {
                    console.warn(`we probably want to deal with this case`);
                    this.debugDeltaUpdates.text = `!!! null base state! next.deltaFromIndex ${nextState.deltaFromIndex}`;
                    // CONSIDER: we could tell the server that we need an abs update?
                    // could lengthen our state buffer if we're getting deltas from too long ago
                    continue;
                }

                absNextState = new MWorldState();

                // CONSIDER: we could clone/create only the entities that exist in next State (it might have relevancy filtering)
                absNextState.cloneFrom(baseState);
                // absNextState.updateAuthState(nextState);
                absNextState.addInPlaceOrCloneCreate(nextState);
                absNextState.ackIndex = nextState.ackIndex;

                // DEBUG
                if(serverUpdate.dbgSomeState) {
                    this.debugDeltaUpdates.text += `SVR BASE ${serverUpdate.dbgSomeState.ackIndex} - CLI BASE ${baseState.ackIndex} = ${serverUpdate.dbgSomeState.ackIndex - baseState.ackIndex}`;
                    // this.debugDeltaUpdates.text += "TEST " + MWorldState.TestMinusThenAddBack(serverUpdate.debugAbsStateAnyway, baseState) + " | ";
                    this.debugDeltaUpdates.text += " | same base? " + baseState.debugDifsToString(serverUpdate.dbgSomeState);

                } else {
                    this.debugDeltaUpdates.text += "no abs";
                }
            }

            // curate state buffer
            // get an abs state
            
            // let debugDeltaWithCli = this.clientViewState.ackIndex - nextState.deltaFromIndex;
            // this.debugDeltaUpdates.text = `cli ack: ${this.clientViewState.ackIndex} cli - delta: ${debugDeltaWithCli} next - delta: ${nextState.ackIndex - nextState.deltaFromIndex}`;
            this.debugDeltaUpdates.text += `**abs state delta? ${absNextState.debugHasDeltaEntities()} | `;
            // this.debugDeltaUpdates.text += `pending cmds: ${this.pendingInputs.length}. ${(<MPlayerAvatar>this.playerEntity.puppet).debugTargets()}`;

            this.clientViewState.ackIndex = absNextState.ackIndex;

            if(this.entityInterpolation.checked) // it had better be
            {
                this.clientViewState.updateAuthStatePushInterpolationBuffers(absNextState); // nextState);

                // SERMON:
                // the following method call is a regrettable side effect of having both 'lastAuthState' and puppet 'interpdata'
                // really have to re-design the whole relationship between sent data and 
                // in-game applied data.
                // Thinking that: sent data should not be tied to anything in game; it's just a spreadsheet.
                // In game things 'stamp' themselves as send data (on the server)
                // In game things update their interpdata with received send data (on the client).
                // ...what am I not thinking of...both cli and server have a collection of puppets
                // and a buffer of world states (collections of send data organized by ackIndex)
                // would need send data classes (?) for each type of puppet (players, pickups)
                let pushClone = this.clientViewState.cloneAuthStateToInterpData();
                pushClone.ackIndex = this.clientViewState.ackIndex;
                // push the latest client view state
                this.stateBuffer.push(pushClone);
                
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
            
            
            let nextCliPlayerState = <MNetworkPlayerEntity> nextState.lookup.getValue(this.playerEntity.netId);
            // put the cli controlled player in the server authoritative state
            this.playerEntity.applyAuthStateToCliTargets();
            this.playerEntity.applyNonDeltaData(nextCliPlayerState);
            
            if(!this.gotFirstServerMessage) {
                this.playerEntity.teleport(nextCliPlayerState.position);
                this.gotFirstServerMessage = true;
            }
            
            this.debugCliDataBeforeReconciliation = this.playerEntity.lastAuthoritativeState.clone(); // getInterpData();
            //
            // server reconciliation
            // purge cli commands older than server update 
            // re-apply cli commands past the server update
            //

            if(this.serverReconciliation.checked && this.clientSidePrediction.checked)
            {
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
                }

                this.debugDeltaUpdates.text += `pending after: ${this.pendingInputs.length}`
            }
           
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
                this.handleLifeTransition(StageType.Bardo);
                // TODO: mid screen bold announcement
            }
            this.messageBoard.add( new MAnnouncement(`${ed.killerName} ${ed.colorCommentary} ${ed.deadNetId}`) );

        }
    }
}
