
export class MFlopbackTimer
{
    private _value : boolean = false;
    public get value() : boolean { return this._value; }

    private timeoutRef : number = 0;
    private sofar : number = 0;

    constructor(
        private duration : number
    )
    {}

    public start() : void 
    {
        if(this._value) {
            return;
        }
        this.sofar = 0;
        this._value = true;
    }

    public tick(dtSeconds : number) {
        this.sofar += dtSeconds;
        if(this.sofar > this.duration) {
            this._value = false;
        }
    }

    public clear() : void 
    {
        this._value = false;
    }
}