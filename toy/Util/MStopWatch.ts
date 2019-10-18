import { PlaySoundAction } from "babylonjs";

export class MStopWatch
{
    private laps = new Array<[number, string]>();

    constructor(
        public name : string
    )
    {
        this.laps.push([+new Date(), "start"]);
    }

    lap(label : string) : string 
    {
        this.laps.push([+new Date(), label]);
        return this.getLapStr(this.laps.length - 1);
    }

    logLap(label : string) : void 
    {
        console.log(this.lap(label));
    }

    getLapStr(idx : number) : string 
    {
        return `${this.name}: ${this.laps[idx - 1][1]} to ${this.laps[idx][1]}: ${(this.laps[idx][0] - this.laps[idx - 1][0])/1000.0} s`;
    }


}