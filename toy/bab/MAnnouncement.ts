import { Nullable } from "babylonjs";
import { MAnnouncement, MAbstractConfirmableMessage } from "../helpers/MConfirmableMessage";

// export class MAnnouncement
// {

//     constructor(
//         public content : string
//     ){}

// }

export namespace MAnnounce
{
    export function FromServerUpdate(su : any) : Nullable<Array<MAbstractConfirmableMessage>>
    {
        if(su.confirmableMessages === undefined) {
            return null;
        }
        let result : Array<MAbstractConfirmableMessage> = su.confirmableMessages;

        return result;
    }

    // export function AddToServerUpdate(anns: Nullable<Array<MAnnouncement>>, su : any) : void
    // {
    //     if(!anns || anns.length === 0) { return; }
    //     su.a = anns;
    // }
}

export class MMessageBoard
{
    private scroller : HTMLElement = <HTMLElement> document.getElementById('scroller');

    maxMessages : number = 8;

    private readonly messages : Array<MAnnouncement> = new Array<MAnnouncement>();

    add(ann : MAnnouncement, dontUpdateDisplay ? : boolean) {
        this.messages.push(ann);
        if(this.messages.length >= this.maxMessages) this.messages.shift();

        if(dontUpdateDisplay === undefined || dontUpdateDisplay === false) {
            this.rescroll();
        }
    }

    push(anns : Array<MAnnouncement> | undefined) : void
    {

        if(anns === undefined) { return; }
        
        for(let i=0; i<anns.length; ++i) { 
            this.add(anns[i], true);
        }

        this.rescroll();

    }

    private rescroll() : void 
    {
        let strs = [];
        for(let i=0; i< this.messages.length; ++i) { 
            strs.push(`${this.messages[i].announcementText} <br />`);
        }
        this.scroller.innerHTML = strs.join('');
    }

}