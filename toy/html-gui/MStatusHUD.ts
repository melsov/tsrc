import { ClientControlledPlayerEntity } from "../bab/NetworkEntity/ClientControlledPlayerEntity";

export class MStatusHUD
{
    private container : HTMLElement = <HTMLElement> document.getElementById('status');

    constructor(
        public player : ClientControlledPlayerEntity
    ) {

    }

    public update() : void
    {
        this.container.innerText = `health: ${this.player.health.val}`;
    }
}