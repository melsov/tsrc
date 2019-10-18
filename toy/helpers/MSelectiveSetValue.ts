
export class MSelectiveSetValue<T>
{
    constructor(
        private _val : T,
        private setIfTrue : (next : T) => boolean
    ) {}

    get val() : T { return this._val; }

    set value(next : MSelectiveSetValue<T>) {
        if(this.setIfTrue(next._val)) {
            this._val = next.val;
        }
    }

    set takeValue(nextVal : T) {
        if(this.setIfTrue(nextVal)) {
            this._val = nextVal;
        }
    }
}