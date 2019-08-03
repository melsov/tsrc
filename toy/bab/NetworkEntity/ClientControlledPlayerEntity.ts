import { MNetworkPlayerEntity, CliTarget } from "./MNetworkEntity";
import { CliCommand } from "../MPlayerInput";
import { ServerSimulateTickMillis } from "../../MServer";

export class ClientControlledPlayerEntity extends MNetworkPlayerEntity
{

    //
    // applying movement by updating cli targets and send data's position
    //
    public applyCliCommand(cliCommand : CliCommand) : void
    {
        let nextPos = this.sendData.position.add(this.moveDir(cliCommand).scale(this.moveSpeed)); // this.sendData.position.clone();

        nextPos = this.playerPuppet.getRayCollisionAdjustedPos(nextPos.clone());

        let targetTime = cliCommand.timestamp + ServerSimulateTickMillis;
        let now = +new Date();
    
        this.playerPuppet.lastCliTarget.copyFrom(this.playerPuppet.cliTarget);
        this.playerPuppet.cliTarget.position.copyFrom(nextPos);
        this.playerPuppet.cliTarget.timestamp = targetTime;
        this.sendData.position.copyFrom(nextPos);
    }

    public apply(ent : MNetworkPlayerEntity) : void
    {
        this.shouldDelete = ent.shouldDelete;

        // pinch cli targets
        this.playerPuppet.cliTarget.position.copyFrom(ent.position);
        this.playerPuppet.lastCliTarget.copyFrom(this.playerPuppet.cliTarget);

        this.sendData.position.copyFrom(ent.position);
    }

    public renderTick()
    {
        this.playerPuppet.interpolateWithCliTargets();
    }

}