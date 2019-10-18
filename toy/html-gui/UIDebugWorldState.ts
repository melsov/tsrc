import { MWorldState } from "../MWorldState";
import { GUIUtil } from "./GUIUtil";
import { UILabel } from "./UILabel";

export class UIDebugWorldState
{
    private display : UILabel;

    constructor(
        containerId : string,
        public readonly worldState : MWorldState
    )
    {
        this.display = new UILabel(containerId);
    }

    update() 
    {
        this.display.text = `${this.worldState.lookup.keys().length}`;

        // one day: an array of labels showing what's up with each ent
    }
}