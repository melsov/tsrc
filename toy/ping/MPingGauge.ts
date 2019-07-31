import * as Collections from 'typescript-collections';
import { Nullable } from 'babylonjs';

export class Stopwatch
{
    private _start : number;
    private _end : number = -1;
    public get startMillis() : number { return this._start; }
    public get endMillis() : number { return this._end; }
    public get durationMillis() : number { return this._end - this._start; }
    public get hasCompleted() : boolean { return this._end >= 0; }

    constructor() {
        this._start = +new Date();
    }

    public complete() : void { this._end = +new Date(); }
}

class AckTimer
{
    constructor(
        public readonly ackIndex : number,
        public readonly stopWatch : Stopwatch
    ) {}
}

const GAUGE_MAX_SAMPLES : number = 50;

export class MPingGauge
{
    //public readonly times : Collections.Dictionary<number, Stopwatch> = new Collections.Dictionary<number, Stopwatch>();
    public readonly times : Array<AckTimer> = new Array<AckTimer>();
    private _average : number = -1;
    public get average() : number { return this._average; }
    public get hasValidAverage() : boolean { return this._average > 0; }

    public addAck(ackIndex : number) : void {
        if(this.times.length >= GAUGE_MAX_SAMPLES) {
            this.times.shift();
        }
        this.times.push(new AckTimer(ackIndex, new Stopwatch));
    }

    public completeAck(ackIndex : number) : void 
    {
        let ackTimer : Nullable<AckTimer> = null;
        for(let i=0; i < this.times.length; ++i){
            if(this.times[i].ackIndex === ackIndex) {
                ackTimer = this.times[i];
                break;
            }
        }

        if(!ackTimer) return;
        ackTimer.stopWatch.complete();
    }

    public recomputeAverage() : void {
        let total = 0.0;
        let count = 0;
        for(let i=0; i < this.times.length; ++i){
            if(this.times[i].stopWatch.hasCompleted) {
                count++;
                total += this.times[i].stopWatch.durationMillis;
            }
        }
        if(count > 0) {
            this._average = total / count;
        }
    }

}