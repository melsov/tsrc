import { shadowsFragmentFunctions } from "babylonjs/Shaders/ShadersInclude/shadowsFragmentFunctions";

export class MTickableCurve
{
    private sofar : number = 0;
    private _prev : number = 0;
    private _next : number = 0;

    public get prev() : number {return this._prev;}
    public get next() : number {return this._next;}
    public get delta() : number {return this._next - this.prev;}

    constructor(
        public evaluate : (x : number) => number
    )
    {
    }

    public reset() : void
    {
        this.sofar = 0;
        this._prev = this._next = this.evaluate(this.sofar);
    }

    public tick(dtSeconds : number) : void
    {
        this._prev = this._next;
        this.sofar += dtSeconds;
        this._next = this.evaluate(this.sofar);
    }

}

//TODO: a 3 state toggle:
// grounded (t at apex)
// startingJump (t at 0)
// midJump (t can go anywhere)

export enum JumpState
{
    NOT_JUMPING, ASCENDING, DESCENDING
}

export class MJumpCurve
{
    private sofar : number;
    private _prev : number = 0;
    private _next : number = 0;
    
    public get prev() : number {return this._prev;}
    public get next() : number {return this._next;}
    public get delta() : number {return this._next - this.prev;}
    public get isAscending() : boolean { return this.sofar < this.secondsToMaxHeight * .9999; }
    public get normalizedCurvePosition() : number { return this.sofar / (2 * this.secondsToMaxHeight); }

    public secondsToMaxHeight : number;
    public get ellapsedSeconds() : number { return this.sofar; }

    private _state : JumpState = JumpState.NOT_JUMPING;
    public get state() : JumpState { return this._state; }

    constructor(
        public gravity : number,
        public maxHeight : number
    )
    {
        this.secondsToMaxHeight = Math.sqrt(-this.maxHeight / this.gravity); // should be positive
        this.sofar = this.secondsToMaxHeight;
    }


    public evaluate(t : number) : number
    {
        let p = t - this.secondsToMaxHeight;
        return p*p*this.gravity + this.maxHeight;
    }

    public set state(js : JumpState) {
        switch(js) {
            case JumpState.ASCENDING:
                this._state = JumpState.ASCENDING;
                this.sofar = 0;
                this._prev = this._next = this.evaluate(this.sofar);
                break;
            case JumpState.NOT_JUMPING:
                this._state = JumpState.NOT_JUMPING;
                this.sofar = this.secondsToMaxHeight;
                this._prev = this._next = this.evaluate(this.sofar);
                break;
            case JumpState.DESCENDING:
                this._state = JumpState.DESCENDING;
                break;
        }
    }

    // public reset() : void
    // {
    //     this.sofar = 0;
    //     this._prev = this._next = this.evaluate(this.sofar);
    // }

    public tick(dtSeconds : number) : void
    {
        switch(this.state)
        {
            case JumpState.NOT_JUMPING:
                this.sofar = this.secondsToMaxHeight;
                break;
            case JumpState.ASCENDING:
            case JumpState.DESCENDING:
                this.sofar += dtSeconds;
        }

        if(this.state === JumpState.ASCENDING && this.sofar > this.secondsToMaxHeight) {
            this._state = JumpState.DESCENDING;
        }

        this._prev = this._next;
        this._next = this.evaluate(this.sofar);
    }

}