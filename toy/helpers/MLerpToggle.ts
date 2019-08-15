
export class MLerpToggle
{
    private _t : number;
    private lerpStartTimeMillis : number = 0;

    constructor(
        private _toggle : boolean,
        public off : number,
        public on : number,
        public durationMillis : number
    ){
        this._t = this._toggle ? this.on : this.off;
    }

    public get value() : number { return this._t; }

    public set toggle(next : boolean) {

    }

    public tick() : number {
        throw new Error('impl');
    }
}