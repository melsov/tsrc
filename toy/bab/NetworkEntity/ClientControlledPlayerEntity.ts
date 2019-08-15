import { MNetworkPlayerEntity, CliTarget } from "./MNetworkEntity";
import { CliCommand } from "../MPlayerInput";
import { ServerSimulateTickMillis } from "../../MServer";
import { MUtils } from "../../Util/MUtils";
import { MStatusHUD } from "../../html-gui/MStatusHUD";
import { Vector3 } from "babylonjs";

export class ClientControlledPlayerEntity extends MNetworkPlayerEntity
{

    protected statusHUD : MStatusHUD;

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

    public apply(ent : MNetworkPlayerEntity) : void
    {
        this.shouldDelete = ent.shouldDelete;

        this.health = ent.health;
        this.statusHUD.update();


        // pinch cli targets
        MUtils.CopyXZInPlace(ent.position, this.playerPuppet.cliTarget.interpData.position); // cli player controls their own y (this is insane?)
        // this.playerPuppet.cliTarget.interpData.position.copyFrom(ent.position);

        this.playerPuppet.lastCliTarget.copyFrom(this.playerPuppet.cliTarget);
    }

    public renderTick(dt : number)
    {
        this.playerPuppet.renderLoopTick(dt); 
    }

}