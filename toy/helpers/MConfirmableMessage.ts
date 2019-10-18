import { MUtils } from "../Util/MUtils";
import { Dictionary } from "typescript-collections";
import { Nullable, Vector3, Ray } from "babylonjs";
import { MLoadOut } from "../bab/MPuppetMaster";
import { BHelpers } from "../MBabHelpers";
import { MShotgun } from "../bab/NetworkEntity/weapon/MWeapon";

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
        // public shortId : string
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

    addArray(cms : Nullable< CMValueType[]>) : void
    {
        if(!cms) { return; }
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

class SentCM
{
    public attempts : number = 0;
    constructor(
        public msg : CMValueType,
    ) {}

}

//
// intended for use server side (per client)
// manage unconfirmed confirmable messages
//
export class MConfirmableMessageBook
{
    private book : Dictionary<number, CMValueType> = new Dictionary<number, CMValueType>();
    // count send attempts
    private sent = new Dictionary<number, SentCM>();

    public getUnconfirmedMessagesMoveToSent() : CMValueType[]
    {
        let msgs = this.book.values();
        this.moveToSent();
        return msgs;
    }

    private add(msg : CMValueType) : void
    {
        let hash = msg.hashcode();
        this.book.setValue(hash, msg);
    }

    addArray(cms : CMValueType[]) : void
    {
        for(let i=0; i<cms.length; ++i)
        {
            this.add(cms[i]);
        }
    }

    private confirm(hash : number) : void
    {
        //this.book.remove(hash);
        this.sent.remove(hash);
    }

    private moveToSent() : void 
    {
        // move all to sent
        let keys = this.book.keys();
        for(let i=0; i<keys.length; ++i) 
        {
            let removed = this.book.remove(keys[i]); 
            if(removed) {
                let sent = this.sent.getValue(keys[i]);
                if(!sent) {
                    sent = new SentCM(removed);
                    this.sent.setValue(keys[i], sent);
                }
            }
        }
    }

    private incrementAttempts() : void
    {
        this.sent.forEach((key, msg) => {
            msg.attempts++;
        })
    }

    confirmArray(hashes : number[]) : void
    {
        for(let i=0; i< hashes.length; ++i) 
        {
            this.confirm(hashes[i]);
        }
        this.incrementAttempts();
    }

    //
    // Mark messages for sending
    // if confirm attempts mod attemptsThreshold == 0
    reinstateUnconfirmed(attemptsThreshold : number = 10) : void
    {
        let keys = this.sent.keys();
        for(let i=0; i<keys.length; ++i)
        {
            let sentMsg = this.sent.getValue(keys[i]);
            if(sentMsg && sentMsg.attempts % attemptsThreshold === 0)
                this.book.setValue(keys[i], sentMsg.msg);
        }
    }

}

