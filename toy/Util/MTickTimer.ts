
export class MTickTimer
{
    private timeMillis : number = 0;
    constructor(
        public readonly intervalMillis : number
    ){}


    public tick(millisSinceLastCall : number, callback : () => void) : void 
    {
        this.timeMillis += millisSinceLastCall;
        if(this.timeMillis > this.intervalMillis) {
            this.timeMillis = this.timeMillis % this.intervalMillis;
            callback();
        }
    }


}