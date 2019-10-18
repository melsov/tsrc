import { Queue } from 'typescript-collections'
import { MUtils } from '../Util/MUtils';

type LagItem = [number, any];

export class LagQueue<T>
{
    // private queue : Queue<LagItem> = new Queue<LagItem>();
    private queue = new Array<LagItem>();

    public dropChance01 : number = 0;
    public outOfOrderChance01 : number = 0;
    public outOfOrderSkipRange : number = 6;

    constructor(
        public lagMillis : number,
        dropChance01 ? : number,
        outOfOrderChance01 ? : number,
        outOfOrderSkipRange ? : number
    )
    {
        if(dropChance01) { this.dropChance01 = MUtils.Clamp01(dropChance01); }
        if(outOfOrderChance01) { this.outOfOrderChance01 = MUtils.Clamp01(outOfOrderChance01); }
        if(outOfOrderSkipRange) { this.outOfOrderSkipRange = outOfOrderSkipRange; }
    } 

    get length() : number { return this.queue.length; }

    private getOutOfOrderIndex() : number
    {
        if(this.outOfOrderChance01 < .000001 || this.queue.length === 0) { return this.queue.length; }
        let rand = Math.random();
        if(this.outOfOrderChance01 < rand) { return this.queue.length; }
        let range = Math.min(this.outOfOrderSkipRange, this.queue.length);
        return this.queue.length - Math.floor(range * (.99999 - .99999* rand));
    }

   
    private firstLagged(limit : number) : T | undefined
    {
        let now = +new Date();
        for(let i=0; i < Math.min(limit, this.queue.length); ++i)
        {
            if(this.queue[i][0] <= now) {
                let result = this.queue.splice(i, 1);
                return <T>result[0][1];
            }
        }
        return undefined;
    }

    dequeue() : (T | undefined)
    {
        if(this.queue.length === 0) { return undefined; }
        // let item = this.firstLagged(Math.min(3, this.outOfOrderSkipRange));
        // if(Math.random() < this.dropChance01) {return undefined;}
        // return item;
        let item = this.queue[0];

        let now = +new Date();
        if(item[0] <= now) {
            this.queue.shift();
            
            if(Math.random() < this.dropChance01) { return undefined; }

            return <T>item[1];
        }

        return undefined;
    }

    enqueue(item : T) : void
    {
        let idx = this.getOutOfOrderIndex();
        this.queue.splice(idx, 0, [ +new Date() + this.lagMillis, item]);
    }
    
}