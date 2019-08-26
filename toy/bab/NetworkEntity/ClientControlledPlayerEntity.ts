import { MNetworkPlayerEntity, CliTarget } from "./MNetworkEntity";
import { CliCommand } from "../MPlayerInput";
import { ServerSimulateTickMillis } from "../../MServer";
import { MUtils } from "../../Util/MUtils";
import { MStatusHUD } from "../../html-gui/MStatusHUD";
import { Vector3 } from "babylonjs";

export class ClientControlledPlayerEntity extends MNetworkPlayerEntity
{

    protected statusHUD : MStatusHUD;

    protected isClientControlledPlayer() : boolean { return true; }

    constructor(
        public _netId : string, 
        pos ? : Vector3) 
    {
        super(_netId, pos);

        this.statusHUD = new MStatusHUD(this);
    }

    //
    // applying movement by updating cli targets and send data's position
    //
    public applyCliCommand(cliCommand : CliCommand) : void
    {
        this.playerPuppet.pushCliTargetWithCommand(cliCommand);

    }
    
    createImmediateEffectsFromInput(cliCommand : CliCommand) : void
    {
        if(cliCommand.fire) {
            //TODO: if has ammo
            console.log(`will animate fire`);
            this.playerPuppet.animateFire();
        }

    }

    public apply(ent : MNetworkPlayerEntity) : void
    {
        this.shouldDelete = ent.shouldDelete;

        this.health = ent.health;
        this.statusHUD.update();

        // pinch cli targets
        MUtils.CopyXZInPlace(this.playerPuppet.cliTarget.interpData.position, ent.position); // cli player controls their own y (this is dicey?)
        // this.playerPuppet.cliTarget.interpData.position.copyFrom(ent.position);

        this.playerPuppet.lastCliTarget.copyFrom(this.playerPuppet.cliTarget);

    }

    public renderTick(dt : number)
    {
        this.playerPuppet.renderLoopTick(dt); 
    }

}