import { MWorldState } from "../MWorldState";
import { MAnnounce } from "../bab/MAnnouncement";
import { MNetworkEntity } from "../bab/NetworkEntity/MNetworkEntity";
import { Nullable } from "babylonjs";
import { MAbstractConfirmableMessage } from "../helpers/MConfirmableMessage";

export class WelcomePackage
{
    public static Prefix : string = 'w';

    constructor(
        public shortId : string
    )
    {}

    public static Pack(wpp : any) : string
    {
        let str = JSON.stringify(wpp);
        return CreateCommString(WelcomePackage.Prefix, str);
    }
}

export class ServerUpdate
{
    public static Prefix : string = 's';

    public confirmableMessages : Nullable<Array<MAbstractConfirmableMessage>> = null;
    public dbgSomeState : Nullable<MWorldState> = null;

    constructor(
        public worldState : MWorldState,
        public lastInputNumber : number
    ){}

    static Pack(serverUpdate : any) : string
    {
        let str = JSON.stringify(serverUpdate);
        return CreateCommString(ServerUpdate.Prefix, str);
    }

    static Unpack(serverUpdateString : string) : ServerUpdate
    {
        let jObj = JSON.parse(serverUpdateString);
        
        let ws : MWorldState = MWorldState.fromJSON(jObj.worldState); // new MWorldState() //jObj.worldState['isDelta']);

        let su = new ServerUpdate(ws, jObj['lastInputNumber']); //ws;
        su.confirmableMessages = MAnnounce.FromServerUpdate(jObj);
    
        // DEBUG
        if(jObj.dbgSomeState)
        {
            let aws = MWorldState.fromJSON(jObj.dbgSomeState); 
            su.dbgSomeState = aws;
        }

        return su;
    }

    // static UnpackOLD(serverUpdateString : string) : ServerUpdate
    // {
    //     let jObj = JSON.parse(serverUpdateString);
        
    //     let ws : MWorldState = new MWorldState() //jObj.worldState['isDelta']);
    //     ws.ackIndex = jObj.worldState.ackIndex;
    //     ws.deltaFromIndex = jObj.worldState.deltaFromIndex;
        
    //     let table = jObj.worldState.lookup.table;
    //     for(let item in table)
    //     {
    //         let mnetKV = table[item];
    //         ws.lookup.setValue(mnetKV['key'], MNetworkEntity.fromJSON(mnetKV['value']));
    //     }
    
    //     let su = new ServerUpdate(ws, jObj['lastInputNumber']); //ws;
    //     su.confirmableMessages = MAnnounce.FromServerUpdate(jObj);
    
    //     // DEBUG
    //     if(jObj.dbgSomeState)
    //     {
    //         let aws = new MWorldState();
    //         aws.ackIndex = jObj.dbgSomeState.ackIndex;
    //         aws.deltaFromIndex = jObj.dbgSomeState.deltaFromIndex;
    
    //         let aTable = jObj.dbgSomeState.lookup.table;
    //         for(let item in aTable)
    //         {
    //             let kv = aTable[item];
    //             aws.lookup.setValue(kv['key'], MNetworkEntity.fromJSON(kv['value']));
    //         }
    //         su.dbgSomeState = aws;
    //     }
        
    
    //     return su;
    // }
}

function CreateCommString(prefix : string, payload : string) : string 
{
    return `${prefix}${payload}`;
}

export function UnpackCommString(commString:string) : [string, string] 
{
    return [commString.substr(0,1), commString.substr(1)];
}

// export function PackServerUpdate(serverUpdate : any) : string
// {
//     let str = JSON.stringify(serverUpdate); // do we need a packer func (pass to stringify for filtering)?
//     return CreateCommString(ServerUpdate.Prefix, str);
//     // return str;
// }
