import { LagNetwork, LaggyPeerConnection } from "./LagNetwork";
import * as MServer from "./MServer";
//import { Fakebase } from "./Fakebase";
import { MNetworkPlayerEntity, MNetworkEntity } from "./bab/NetworkEntity/MNetworkEntity";
import { GameMain, TypeOfGame } from "./GameMain";
import { MWorldState } from "./MWorldState";
import { MPuppetMaster, MSkin, PlaceholderPuppet } from "./bab/MPuppetMaster";
import { CliCommand, MPlayerInput } from "./bab/MPlayerInput";
import { DebugHud } from "./html-gui/DebugHUD";
import { Color3, Vector3 } from "babylonjs";
import { MPlayerAvatar } from "./bab/MPlayerAvatar";
import { CheckboxUI } from "./html-gui/CheckboxUI";
import { MUtils } from "./Util/MUtils";
import { MTickTimer } from "./Util/MTickTimer";
import { tfirebase } from "../MPlayer";
import * as Collections from 'typescript-collections';
import { ClientControlledPlayerEntity } from "./bab/NetworkEntity/ClientControlledPlayerEntity";
import { FPSCam } from "./bab/FPSCam";
import { BHelpers } from "./MBabHelpers";

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
    return cmd;
}

export class MClient
{

    public readonly playerEntity : ClientControlledPlayerEntity;
    private clientViewState : MWorldState = new MWorldState();

    private puppetMaster : MPuppetMaster;

    public readonly game : GameMain;
    public readonly fpsCam : FPSCam;
    private input : MPlayerInput;
    private inputSequenceNumber : number = 0;
    private pendingInputs : Array<CliCommand> = new Array<CliCommand>();

    private debugHud : DebugHud;
    private debugHudInfo : DebugHud;

    private entityInterpolation : CheckboxUI = new CheckboxUI('interpolation', true);
    private serverReconciliation : CheckboxUI = new CheckboxUI('reconciliation', true);
    private clientSidePrediction : CheckboxUI = new CheckboxUI('prediction', true);

    private DebugClientNumber : number = 0;

    private sampleInputTimer : MTickTimer = new MTickTimer(MServer.ServerSimulateTickMillis);

    private fromServer : Collections.Queue<string> = new Collections.Queue<string>();

    constructor(
        //public readonly peerConnection : LaggyPeerConnection,
        public readonly user : tfirebase.User,
        private send : (msg : string) => void
    ) 
    {
        this.DebugClientNumber = g_howManyClientsSoFar++;
        this.game = new GameMain(this.DebugClientNumber == 0 ? TypeOfGame.ClientA : TypeOfGame.ClientB);
        this.playerEntity = new ClientControlledPlayerEntity(this.user.UID); // MNetworkPlayerEntity(this.user.UID);
        this.puppetMaster = new MPuppetMaster(this.game.scene);
        this.input = new MPlayerInput(this.DebugClientNumber > 0);

        this.playerEntity.setupShadow(this.game.scene, this.DebugClientNumber);
        this.clientViewState.getPuppet = (ent : MNetworkEntity) => {
            return this.puppetMaster.getPuppet(ent);
        }

        this.clientViewState.setEntity(this.user.UID, this.playerEntity);


        //customize puppet
        let skin = MSkin.OrderUpASkin(this.DebugClientNumber);
        
        let playerPuppet = <MPlayerAvatar> this.puppetMaster.getPuppet(this.playerEntity);
        playerPuppet.customize(skin);
        playerPuppet.addDebugLinesInRenderLoop();

        this.fpsCam = new FPSCam(this.game.camera, playerPuppet.mesh);

        this.game.engine.runRenderLoop(() => {
            this.cliRenderLoop();
        });

        this.debugHud = new DebugHud(this.DebugClientNumber == 0 ? "cli-debug-a" : "cli-debug-b");
        this.debugHudInfo = new DebugHud(this.DebugClientNumber == 0 ? "cli-debug-a-info" : "cli-debug-b-info");
        this.debugHudInfo.show(this.user.UID);
    }

    public init() : void
    {
        this.game.init();
        this.input.init(window);
    }

    
    private cliRenderLoop() 
    {
        this.sampleInputTimer.tick(this.game.engine.getDeltaTime(), () => {
            this.processServerUpdates();
            this.processInputs();
        });

        this.interpolateOthers();
        this.playerEntity.renderTick();
        this.fpsCam.lerpToTarget();
    }

    public teardown() : void 
    {
        //clearInterval(this.serverTickProcessHandle);
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
        this.playerEntity.applyCliCommand(command); // with collisions

        if(command.debugGoWrongPlace){
            this.playerEntity.teleport(this.playerEntity.position.add(new Vector3(0, 0, 3)));
            console.log(`go wrong place ${this.playerEntity.position}`);
        }
        // if (this.clientSidePrediction.checked)
        // {
        // }
        
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
            this.playerEntity.apply(playerState);

            // / ******
            // if(this.serverReconciliation.checked)
            {
                // // put our player in the server authoritative state
                // let playerState = <MNetworkPlayerEntity> nextState.lookup.getValue(this.playerEntity.netId);
                // this.playerEntity.apply(playerState);

                // reapply newer inputs
                let j = 0;

                while(this.clientSidePrediction.checked && j < this.pendingInputs.length)
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
}
