import { MNetworkEntity, MNetworkPlayerEntity } from "./bab/NetworkEntity/MNetworkEntity";
import * as Collections from "typescript-collections";
import { Puppet, PlaceholderPuppet } from "./bab/MPuppetMaster";
import { MUtils } from "./Util/MUtils";
import { Vector3, Scene, Ray, Tags, RayHelper, Nullable, Color3, Mesh, AbstractMesh } from "babylonjs";
import * as MServer  from "./MServer";
import { GameEntityTags } from "./GameMain";

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

    private static _debugRH : RayHelper = new RayHelper(new Ray(Vector3.Zero(), Vector3.One(), 1));
    

    public relevancyShallowClone(
        observer : MNetworkPlayerEntity | undefined, 
        scene : Scene, 
        relevantBook : Collections.Dictionary<string, number>, 
        closeByRadius : number) : MWorldState
    {
        let ws = new MWorldState();
        ws.ackIndex = this.ackIndex;
        ws.timestamp = this.timestamp;

        if(observer === undefined) { return ws; }
        
        let keys = this.lookup.keys();
        let key : string = '';
        let relevancy : number | undefined = 0;
        let ent : MNetworkEntity | undefined = undefined;
        for(let j=0; j<keys.length; ++j)
        {
            key = keys[j];
            ent = <MNetworkEntity> this.lookup.getValue(key);
            relevancy = relevantBook.getValue(key);

            if(ent === observer) { relevancy = MServer.Relevancy.RECENTLY_RELEVANT; }
            else if(relevancy === undefined) { relevancy = MServer.Relevancy.NOT_RELEVANT; }
            // CONSIDER: clients can request relevancy for net ents that they might be about to encounter (they think)
            // without this we risk getting 'statues': never updated other players that stay in their last seen spot in the cli players view
            // could use a simple (fairly wide) radius (or a box since we foresee a boxy world? or some cleverly bounced rays) to determine which n-ents to request
            // within this radius, only need to ask for others who were not seen in the last update.
            // OR (BETTER): Simply mark irrelevant players as irrelevant in server updates and make them invisible on the client
            else if (relevancy <= -MServer.Relevancy.RECENTLY_RELEVANT) { // They haven't been relevant for a while. force relevance. 
                relevancy = MServer.Relevancy.NOT_RELEVANT + 2; 
            } 
            

            if(relevancy < MServer.Relevancy.RECENTLY_RELEVANT) 
            {
                let corners = ent.puppet.getBoundsCorners();
                for(let i=0;i<corners.length; ++i) 
                {
                    let dif = corners[i].subtract(observer.position);
                    let distSq = dif.lengthSquared();
                    if(distSq < closeByRadius * closeByRadius) {
                        relevancy = MServer.Relevancy.RECENTLY_RELEVANT;
                        break;
                    }

                    let ray = new Ray(observer.position.clone(), dif, 1.1);

                    //DEBUG
                    MWorldState._debugRH.hide();
                    MWorldState._debugRH.dispose();
                    MWorldState._debugRH.ray = ray;

                    let pinfo = scene.pickWithRay(ray, (mesh : AbstractMesh) => {
                        if(mesh === null) return false; 
                        if(mesh.name === observer.netId) return false; // pass through this player
                        let tgs = <string | null> Tags.GetTags(mesh, true); 
                        if(tgs === null) return false;
                        return (tgs.indexOf(GameEntityTags.PlayerObject) >= 0 || tgs.indexOf(GameEntityTags.Terrain) >= 0) 
                    }, true); // want fastCheck

                    if(pinfo && pinfo.hit && pinfo.pickedMesh) {
                        if(pinfo.pickedMesh.name === ent.netId) {
                            relevancy = MServer.Relevancy.RECENTLY_RELEVANT;
                            // could call break here. except debug rays
                        }
                    }

                    // DISABLE REL RAY // MWorldState._debugRH.show(scene, relevancy > MServer.Relevancy.NOT_RELEVANT ?  Color3.Red() : Color3.Yellow());
                    if(relevancy === MServer.Relevancy.RECENTLY_RELEVANT) {
                        break;
                    }

                } // END OF CORNERS LOOP
            }

            relevancy--;
            relevantBook.setValue(key, relevancy);

            if(relevancy > MServer.Relevancy.NOT_RELEVANT) {
                ws.lookup.setValue(key, ent);
            }
        }
        return ws;
    }

    public debugCheckPositions() : void
    {
        this.lookup.forEach((key : string, ent : MNetworkEntity) => {
            let plent = ent.getPlayerEntity();
            if(plent) console.log(`${plent.netId}:  ${plent.playerPuppet.getInterpData().position}`);
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
                ent.interpolate(MServer.ServerBroadcastTickMillis * 2);
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
