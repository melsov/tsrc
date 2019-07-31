import { LagNetwork, LaggyPeerConnection } from "./LagNetwork";
import * as MServer from "./MServer";
//import { Fakebase } from "./Fakebase";
import { MNetworkPlayerEntity, MNetworkEntity } from "./bab/NetworkEntity/MNetworkEntity";
import { GameMain, TypeOfGame } from "./GameMain";
import { MWorldState } from "./MWorldState";
import { MPuppetMaster, MSkin, PlaceholderPuppet } from "./bab/MPuppetMaster";
import { CliCommand, MPlayerInput } from "./bab/MPlayerInput";
import { DebugHud } from "./html-gui/DebugHUD";
import { Color3 } from "babylonjs";
import { MPlayerAvatar } from "./bab/MPlayerAvatar";
import { CheckboxUI } from "./html-gui/CheckboxUI";
import { MUtils } from "./Util/MUtils";
import { MTickTimer } from "./Util/MTickTimer";
import { tfirebase } from "../MPlayer";
import * as Collections from 'typescript-collections';

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
    return <CliCommand> JSON.parse(str);
}

export class MClient
{

    public readonly playerEntity : MNetworkPlayerEntity;
    private clientViewState : MWorldState = new MWorldState();

    private puppetMaster : MPuppetMaster;

    public readonly game : GameMain;
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
        this.playerEntity = new MNetworkPlayerEntity(this.user.UID);
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

        this.game.engine.runRenderLoop(() => {
            this.cliRenderLoop();
        });

        this.debugHud = new DebugHud(this.DebugClientNumber == 0 ? "cli-debug-a" : "cli-debug-b");
        this.debugHudInfo = new DebugHud(this.DebugClientNumber == 0 ? "cli-debug-a-info" : "cli-debug-b-info");
        this.debugHudInfo.show(this.user.UID);

        //DEBUG toggle pause
        // window.addEventListener('keydown', (kev : KeyboardEvent) => {
        //     switch(kev.key){
        //         case this.input.getKeySet().togglePauseDebug:
        //             console.log(`pause key: ${this.input.getKeySet().togglePauseDebug}`);
        //             if(!kev.repeat)
        //                 this.game.startRenderLoop();
        //             break;
        //     }
        // }); // Sadly broken in triple canvase window
    }

    public init() : void
    {
        this.game.init();
        this.input.init(window);
    }

    
    private cliRenderLoop() 
    {
        this.sampleInputTimer.tick(this.game.engine.getDeltaTime(), () => {
            this.processInputs();
        });

        this.interpolateOthers();
        this.processServerUpdates();
    }

    public teardown() : void 
    {
        //clearInterval(this.serverTickProcessHandle);
    }
    
    private processInputs() : void
    {
        let command = this.input.nextInputAxes(); // MakeFakeCommand();
        command.lastWorldStateAckPiggyBack = this.clientViewState.ackIndex;
        if(!command.hasAMove) { 
            this.send(CommandToString(command)); // // still send a cmd for ack index // TODO: compress in this case
            // this.peerConnection.sendChannel.send(CommandToString(command));
            return; 
        }
        command.inputSequenceNumber = this.inputSequenceNumber++;

        let comstr = CommandToString(command);

        this.send(comstr);
        // this.peerConnection.sendChannel.send(comstr);
        
        this.pendingInputs.push(command);

        if (this.clientSidePrediction.checked)
        {
            this.playerEntity.applyCliCommand(command); // with collisions
        }
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
            if(this.serverReconciliation.checked)
            {
                // put our player in the server authoritative state
                let playerState = <MNetworkPlayerEntity> nextState.lookup.getValue(this.playerEntity.netId);
                // if(false) // nextState.isDelta)
                //     this.playerEntity.applyDelta(playerState);
                // else
                    this.playerEntity.apply(playerState);

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
                }
            }

        } // END WHILE TRUE

        this.debugHud.show(`pos: ${MUtils.RoundVecString((<MNetworkPlayerEntity>this.clientViewState.lookup.getValue(this.user.UID)).position)}`);
        
    }
 

    private interpolateOthers()
    {
        this.clientViewState.interpolate();
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
