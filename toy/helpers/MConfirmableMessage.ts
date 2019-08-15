import { MUtils } from "../Util/MUtils";
import { Dictionary } from "typescript-collections";
import { Nullable, Vector3, Ray } from "babylonjs";
import { MLoadOut } from "../bab/MPuppetMaster";
import { BHelpers } from "../MBabHelpers";

export enum ConfirmableType
{
    Announcement = 1,
    PlayerReentry, 
    ExitDeath
}

export abstract class MAbstractConfirmableMessage
{
    public abstract hashcode() : number;
    constructor(public readonly ctype : ConfirmableType) {}

    // let's assume child classes will be well behaved
    // i.e. they won't override toJSON and not include their ctype
    // no official 'sealed' keyword in typescript
    // public toJSON() 
    // {
    //     let jj : any = { t : this.ctype };
    //     jj.payload = this.getData();
    // }

    // public abstract getData() : any;

}

function CloneFrom(cm : any) : Nullable<MAbstractConfirmableMessage>
{
    switch(cm.ctype) {
        case ConfirmableType.Announcement:
            return new MAnnouncement(cm.announcementText);
        case ConfirmableType.PlayerReentry:
            return new MPlayerReentry(cm.announcementText, cm.netId, cm.loadOut, BHelpers.Vec3FromJSON(cm.spawnPos));
        case ConfirmableType.ExitDeath:
            return new MExitDeath(cm.deadNetId, cm.killerName, cm.ray, cm.colorCommentary);
        default:
            return null;
    }
} 

export class MAnnouncement extends MAbstractConfirmableMessage
{
    public hashcode(): number { return MUtils.StringToHash(this.announcementText); }

    
    constructor(
        public announcementText : string 
    ) 
    {
        super(ConfirmableType.Announcement);
    }
    
}

export class MPlayerReentry extends MAbstractConfirmableMessage
{
    public hashcode(): number { return MUtils.StringToHash(`${this.announcementText}`); }

    constructor(
        public announcementText : string,
        public netId : string,
        public loadOut : MLoadOut,
        public spawnPos : Vector3
    ) {
        super(ConfirmableType.PlayerReentry);
    }
    
}

export class MExitDeath extends MAbstractConfirmableMessage
{
    public hashcode(): number {
        return MUtils.StringToHash(JSON.stringify(this));
    }

    constructor(
        public deadNetId : string,
        public killerName : string,
        public ray : Ray,
        public colorCommentary : string
    )
    {
        super(ConfirmableType.ExitDeath);
    }
    
}

type CMValueType = MAbstractConfirmableMessage;

//
// intended for use client side
// manage storing and consuming confirmable messages
// and their hashes
//
export class ConfirmableMessageOrganizer
{
    private readonly lookup : Dictionary<ConfirmableType, Array<CMValueType>> = new Dictionary<ConfirmableType, Array<CMValueType>>();
    private readonly hashes : Array<number> = new Array<number>();

    add(cmobj : CMValueType) : void 
    {
        let cm = CloneFrom(cmobj);
        if(cm === null) { return; }

        let arr = this.lookup.getValue(cm.ctype);
        if(arr === undefined) {
            arr = new Array<CMValueType>();
            this.lookup.setValue(cm.ctype, arr);
        }

        arr.push(cm);
    }

    addArray(cms : CMValueType[]) : void
    {
        for (let i=0; i<cms.length; ++i)
        {
            this.add(cms[i]);
        }
    }

    consumeHashes() : Array<number> 
    { 
        return this.hashes.splice(0, this.hashes.length); 
    }

    consume(ctype : ConfirmableType) : Array<CMValueType>
    {
        let result = new Array<CMValueType>();
        let arr = this.lookup.getValue(ctype);
        if(arr === undefined || arr.length === 0) { return result; }

        while(arr.length > 0){
            let cm = arr[0]; //.shift();
            arr.shift();
            console.log(`get hash of : ${JSON.stringify(cm)}`);
            this.hashes.push(cm.hashcode());
            result.push(cm);
        }

        return result;
    }

    debugConsumeCheckClear(throwErrIfNotClear ? : boolean) : void 
    {
        this.lookup.forEach((ct : ConfirmableType, arr: CMValueType[]) => {
            let result = this.consume(ct);
            if(result.length > 0) {
                if(throwErrIfNotClear) throw new Error(`please consume all of your confirmable messages. ${result.length} not consumed for type: ${ct}`);
                else console.warn(`there were ${result.length} unconsumed for type: ${ct}`);
            }
        });
    }


}

//
// intended for use server side (per client)
// manage unconfirmed confirmable messages
//
export class MConfirmableMessageBook
{
    private book : Dictionary<number, CMValueType> = new Dictionary<number, CMValueType>();

    public getUnconfirmedMessages() : CMValueType[]
    {
        return this.book.values();
    }

    public appendMessagesToObj(jj : any) : void
    {
        jj.cm = this.getUnconfirmedMessages();
    }

    public static messagesFromJSON(jj : any) : (undefined | CMValueType[])
    {
        return jj.cm;
    }

    public static appendHashArrayToObj(jj : any, messages : CMValueType[]) : void
    {
        if(messages.length === 0) return;

        let hashes = new Array<number>();
        for(let i=0; i<messages.length; ++i) {
            hashes.push(messages[i].hashcode());
        }

        jj.hs = hashes;
    }

    private static hashesFromJSON(jj : any) : (undefined | number[])
    {
        return jj.hs;
    }

    public confirmWith(jj : any) : void 
    {
        let hashes = MConfirmableMessageBook.hashesFromJSON(jj);
        if(hashes === undefined) { return ;}

        for(let i=0; i < hashes.length; ++i){
            this.confirm(hashes[i]);
        }
    }

    public add(msg : CMValueType) : void
    {
        this.book.setValue(msg.hashcode(), msg);
    }

    public addArray(cms : CMValueType[]) : void
    {
        for(let i=0; i<cms.length; ++i)
        {
            this.add(cms[i]);
        }
    }

    public confirm(hash : number) : void
    {
        this.book.remove(hash);
    }

    public confirmArray(hashes : number[]) : void
    {
        for(let i=0; i< hashes.length; ++i) 
        {
            this.confirm(hashes[i]);
        }
    }

}

