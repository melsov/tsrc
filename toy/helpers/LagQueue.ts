import { Queue } from 'typescript-collections'

type LagItem = [number, any];

export class LagQueue<T>
{
    private queue : Queue<LagItem> = new Queue<LagItem>();

    constructor(
        public lagMillis : number
    )
    {
    }

    public dequeue() : (T | undefined)
    {
        let item = this.queue.peek();
        if(item === undefined) { return undefined; }

        let now = +new Date();
        if(item[0] <= now) {
            this.queue.dequeue();
            // put item back into the front
            return <T>item[1];
        }

        return undefined;
    }

    public enqueue(item : T) : void
    {
        this.queue.enqueue([ +new Date() + this.lagMillis, item]);
    }
    
}