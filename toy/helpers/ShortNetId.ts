import { Dictionary, Set } from "typescript-collections";

const FirstASCII : number = 42; 
const LastASCII : number = 122;
const NumChars : number = LastASCII + 1 - FirstASCII;

export class ShortNetId
{
    private LongToShort = new Dictionary<string, string>();
    private lastCharIndexA : number = 0; private lastCharIndexB : number = 0;

    map(longNetId : string) : string
    {
        let nextShort = this.LongToShort.getValue(longNetId);
        if(!nextShort) {
            nextShort = this.nextAvailableShortId();
            this.LongToShort.setValue(longNetId, nextShort);
        }
        return nextShort;
    }

    getShortId(longNetId : string) : string | undefined { 
        return this.LongToShort.getValue(longNetId); 
    }

    getShortIdUnsafe(longNetId : string) : string { return <string> this.LongToShort.getValue(longNetId); }

    remove(longNetId : string) : void
    {
        let keys = this.LongToShort.keys();
        for(let i=0; i<keys.length; ++i)
        {
            let longId = this.LongToShort.getValue(keys[i]);
            if(longId && longId === longNetId) {
                this.LongToShort.remove(keys[i]);
                return;
            }
        }
    }

    private containsShort(sh : string) : boolean
    {
        let keys = this.LongToShort.keys();
        for(let i=0;i<keys.length; ++i)
        {
            if(sh === this.LongToShort.getValue(keys[i]))
            {
                return true;
            }
        }
        return false;
    }

    private nextAvailableShortId() : string
    {
        // ascii 33 to 126 (decimal) 
        
        let ai : number; let bi : number;
        let result : string;
        for(let i = 0; i <= NumChars; ++i)
        {
            ai = ((i + this.lastCharIndexA) % NumChars) + FirstASCII;
            for(let j = 0; j <= NumChars; ++j)
            {
                bi = ((j + this.lastCharIndexB) % NumChars) + FirstASCII;
                result = `${String.fromCharCode(ai)}${String.fromCharCode(bi)}`;
                if(!this.containsShort(result)) {
                // if(!this.LongToShort.containsKey(result)) {
                    this.lastCharIndexA = (i + 1) % NumChars;
                    this.lastCharIndexB = (j + 1) % NumChars;
                    return result;
                }
            }
        }
        throw new Error(`Somehow we used up all ${NumChars*NumChars} short ids`);
    }

}