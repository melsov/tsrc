import { MNetworkEntity, MNetworkPlayerEntity } from "./bab/NetworkEntity/MNetworkEntity";
import * as Collections from "typescript-collections";
import { Puppet, PlaceholderPuppet } from "./bab/MPuppetMaster";
import { MUtils } from "./Util/MUtils";
import { Vector3 } from "babylonjs";
import * as MServer  from "./MServer";

export class MWorldState
{
    public readonly lookup : Collections.Dictionary<string, MNetworkEntity> = new Collections.Dictionary<string, MNetworkEntity>();

    public getPuppet : (ent : MNetworkEntity) => Puppet;

    public ackIndex : number = -1;
    public timestamp : number;

    constructor(
    ) 
    {
        this.getPuppet = (ent : MNetworkEntity) => { return new PlaceholderPuppet(); }
        this.timestamp = +new Date();
    }

    public cloneFrom(other : MWorldState) : void
    {
        this.ackIndex = other.ackIndex;
        other.lookup.forEach((key : string, ent : MNetworkEntity) => {
            this.lookup.setValue(key, ent.clone());
        });

    }

    public minus(other : MWorldState) : MWorldState
    {
        let delta = new MWorldState();
        this.lookup.forEach((key : string, ent : MNetworkEntity) => {
            let otherEnt = other.lookup.getValue(key);
            if(otherEnt == undefined){
                delta.lookup.setValue(key, ent.clone());
            } else {
                delta.lookup.setValue(key, ent.minus(otherEnt));
            }
        });

        return delta;
    }

    // NOT IN USE
    public plus(other : MWorldState) : MWorldState
    {
        let delta = new MWorldState();
        this.lookup.forEach((key : string, ent : MNetworkEntity) => {
            let otherEnt = other.lookup.getValue(key);
            if(otherEnt == undefined){
                delta.lookup.setValue(key, ent.clone());
            } else {
                delta.lookup.setValue(key, ent.plus(otherEnt));
            }
        });

        return delta;
    } 

    public setEntity(uid : string, ent : MNetworkEntity) : void
    {
        this.lookup.setValue(uid, ent);
        // this.clientPlayerUID = uid;
        ent.setupPuppet(this.getPuppet(ent));
    }

    // client side helper 
    private makeNetEntFrom(key : string, deltaEnt : MNetworkEntity) : MNetworkEntity
    {
        this.lookup.setValue(key, deltaEnt.clone());
        let ent = <MNetworkEntity> this.lookup.getValue(key);

        // encourage this ent to set itself up
        ent.setupPuppet(this.getPuppet(ent));
        return ent;
    }

    // client side
    // public applyDelta(delta : MWorldState) : void
    // {
    //     delta.lookup.forEach((key : string, deltaEnt : MNetworkEntity) => {
    //         let ent = this.lookup.getValue(key);
            
    //         // IF ent == undef: we've never seen this entity
    //         // delta is treated as an absolute position
    //         if(ent == undefined) 
    //         {
    //             ent = this.makeNetEntFrom(key, deltaEnt);
    //         }
    //         else 
    //         {
    //             ent.applyDelta(deltaEnt);
    //         }
    //     });
    // }
    
//
// TODO: think about how what gets communicated when...
// there's probably a reason to set up an official InterpData class
// That is the proxy for a network entity in a world state
// current State (i.e. an actual set of player entities)
// make InterpData when the world state gets saved
//

    // client side
    public apply(state : MWorldState) : void
    {
        state.lookup.forEach((key : string, nextEnt : MNetworkEntity) => {
            let ent = this.lookup.getValue(key);

            if(ent == undefined) 
            {
                ent = this.makeNetEntFrom(key, nextEnt);
            }
            else 
            {
                ent.apply(nextEnt);
            }
        });
    }

    public purgeDeleted(state : MWorldState) : void
    {
        let deletables = new Array<string> ();
        state.lookup.forEach((key : string, ent : MNetworkEntity) => {
            let e = this.lookup.getValue(key);
            if(e != undefined && ent.shouldDelete)
            {
                deletables.push(key);
            }
        });

        for(let i=0; i<deletables.length; ++i) {
            let ent = this.lookup.getValue(deletables[i]);
            if(ent){
                ent.destroySelf();
            }
            this.lookup.remove(deletables[i]);
        }
    }

    // client side
    public pushInterpolationBuffers(absState : MWorldState) : void
    {
        absState.lookup.forEach((key : string, absEnt : MNetworkEntity) => {
            let ent = this.lookup.getValue(key);

            if(ent == undefined) 
            {
                ent = this.makeNetEntFrom(key, absEnt);
            }

            ent.pushInterpolationBuffer(absEnt);
        });
    }

    public interpolate(ignoreUID : string) : void 
    {
        this.lookup.forEach((uid : string, ent : MNetworkEntity) => {

            // don't interpolate our own player avatar
            if(uid != ignoreUID)
            {
                ent.interpolate(MServer.ServerBroadcastTickMillis);
            } 
        });
    }

    // client side
    public pushStateChanges(absState : MWorldState) : void
    {
        absState.lookup.forEach((key : string, absEnt : MNetworkEntity) => {
            let ent = this.lookup.getValue(key);
            if(ent != undefined)
            {
                ent.pushStateChanges(absEnt);
            }
        });
    }

    public clearTransientStates() : void
    {
        this.lookup.forEach((key : string, ent : MNetworkEntity) => {
            ent.clearTransientStates();
        });
    }

    public resetPlayersToPresent() : void
    {
        this.lookup.forEach((key : string, ent : MNetworkEntity) => {
            let plent = ent.getPlayerEntity();
            if(plent != null)
            {
                plent.resetToThePresent();
            }
        });
    }

    public rewindPlayers(a : MWorldState, b: MWorldState, lerper01 : number, skipUID : string) : void 
    {
        this.lookup.forEach((key : string, ent : MNetworkEntity) => {
            let plent = ent.getPlayerEntity();
            if(plent != null && key != skipUID)
            {
                let pA = <MNetworkPlayerEntity> a.lookup.getValue(key);
                let pB = <MNetworkPlayerEntity> b.lookup.getValue(key);
                if(pA != undefined && pB != undefined)
                {
                    let pos = Vector3.Lerp(pA.position, pB.position, lerper01);
                    plent.rewind(pos);
                } 
            }
        });
    }


    
}
