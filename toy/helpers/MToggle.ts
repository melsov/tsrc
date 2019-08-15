
export class MToggle
{

    callback : (isOn : boolean) => void = (isOn : boolean) => {}

    constructor(
        private _value : boolean
    ) 
    {}

    public get value() : boolean { return this._value; }

    public set value(next : boolean) {
        if(this._value !== next) {
            this._value = next;
            this.callback(next);
        }
    }

}