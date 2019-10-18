import { MWorldState } from "./MWorldState";
import { Nullable } from "babylonjs";

export const STATE_BUFFER_MAX_LENGTH : number = 120;

export class MStateBuffer
{
    private stor : MWorldState[] = [];

    public readonly MaxLength : number = STATE_BUFFER_MAX_LENGTH;

    constructor(
        maxLength ? : number
    )
    {
        if(maxLength) { this.MaxLength = maxLength; }
    }

    get length() : number { return this.stor.length; }

    push(ws : MWorldState) : number {
        if(this.stor.length >= this.MaxLength) {
            this.stor.shift();
        }
        return this.stor.push(ws);
    }

    pushACloneOf(ws : MWorldState) : number {
        let clone = new MWorldState();
        clone.cloneFrom(ws);
        return this.push(clone);
    }

    shift() : MWorldState | undefined { return this.stor.shift(); }

    at(i : number) : MWorldState { return this.stor[i]; }

    first() : MWorldState { return this.stor[0]; }
    last() : MWorldState { return this.stor[this.stor.length - 1]; }

    atIndexFromLast(iFromLast : number) : Nullable<MWorldState> { 
        let place = this.stor.length - iFromLast;
        if(place < 1 || place > this.stor.length) { return null; }
        return this.stor[place - 1];
    }

    atIndexFromLastUnsafe(iFromLast : number) : MWorldState { return this.stor[this.stor.length - 1 - iFromLast]; }

    stateWithAckIndex(ack : number) : Nullable<MWorldState>
    {
        for(let i=0; i<this.stor.length; ++i) {
            if(this.stor[i].ackIndex === ack) { return this.stor[i]; }
        }
        return null;
    }

    stateWithAckDebug(ack : number, msg ? : string) : Nullable<MWorldState>
    {
        for(let i=0; i<this.stor.length; ++i) {
            if(this.stor[i].ackIndex === ack) { return this.stor[i]; }
        }
        console.log(`${msg ? msg : ""} ack ${ack} not found: ${this.DebugWorldStateAckRanges()}`);
        return null;
    }

    
    // REGION DEBUG

    private DebugWorldStateAckRanges() : string 
    {
        if(this.stor.length === 0) return '';
        return `ack range: [${this.stor[0].ackIndex} , ${this.stor[this.stor.length - 1].ackIndex}]`;
    }

}