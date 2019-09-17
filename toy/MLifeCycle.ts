import { MAbstractConfirmableMessage, ConfirmableType } from "./helpers/MConfirmableMessage";


export class LifeStage
{

    data : any = null;

    constructor(
        public type : StageType
    )
    {
    }

    copyFrom(other : LifeStage) : void 
    {
        this.type = other.type;
        if(other.data) {
            this.data = JSON.parse(JSON.stringify(other.data));
        }
    }
}

export enum StageType
{
    NotConnected = 1,
    Bardo, // waiting on respawn timer
    DeadConfigureLoadout, // optionally can configure and can click respawn 
    Alive,
}

export type LifeCycleCallback = (before : LifeStage, after : LifeStage) => void;

export class MLifeCycle
{

    private callbacks : Array<LifeCycleCallback> = new Array<LifeCycleCallback>();
    public addCallback(cb : LifeCycleCallback) : void { this.callbacks.push(cb); }

    public get stage() : LifeStage { return this._stage; }

    public set stage(nextStage : LifeStage) 
    {
        if(nextStage.type !== this._stage.type)
        {
            for(let i=0; i<this.callbacks.length; ++i) {
                this.callbacks[i](this._stage, nextStage);
            }
            this._stage = nextStage;
        }
    } 

    constructor(
        private _stage : LifeStage
    )
    {
    }

    clone() : MLifeCycle
    {
        return new MLifeCycle(this._stage);
    }


}