import { MNetworkEntity, MNetworkPlayerEntity } from "./bab/NetworkEntity/MNetworkEntity";
import * as Collections from "typescript-collections";
import { Puppet, PlaceholderPuppet } from "./bab/MPuppetMaster";
import { MUtils } from "./Util/MUtils";
import { Vector3, Scene, Ray, Tags, RayHelper, Nullable, Color3, Mesh, AbstractMesh } from "babylonjs";
import * as MServer  from "./MServer";
import { GameEntityTags } from "./GameMain";
import { MByteUtils } from "./Util/MByteUtils";
import { UIDebugWorldState } from "./html-gui/UIDebugWorldState";
import { MPlayerAvatar } from "./bab/MPlayerAvatar";

export class MWorldState
{
    readonly lookup : Collections.Dictionary<string, MNetworkEntity> = new Collections.Dictionary<string, MNetworkEntity>();

    getPuppet : (ent : MNetworkEntity) => Puppet;

    ackIndex : number = -1;

    // If a delta state,
    // the index of the state on which the delta is based
    deltaFromIndex : number = -1;
    get isDelta() : boolean { return this.deltaFromIndex >= 0; }

    get timestamp() : number { return this._timestamp; }
    private _timestamp : number;


    private metaDataToByteString() : string
    {
        const bytesPerNumber = 4;
        // ack, deltaFrom, timestamp
        const size = 3 * bytesPerNumber;
        let buff = new ArrayBuffer(size);
        let int32s = new Int32Array(buff);
        int32s[0] = this.ackIndex;
        int32s[1] = this.deltaFromIndex;
        int32s[2] = this._timestamp;
        let int8s = new Uint8Array(buff);
        return MByteUtils.Uint8ArrayToString(int8s);
    }

    private static SetMetaDataFromByteString(ws : MWorldState, bs : string) 
    {
        let uint8s = MByteUtils.StringToUInt8s(bs);
        let ints = new Int32Array(uint8s.buffer);
        ws.ackIndex = ints[0];
        ws.deltaFromIndex = ints[1];
        ws._timestamp = ints[2];
    }

    private static SetEntsFromJSON(ws : MWorldState, jray : any) 
    {
        for(let i=0; i<jray.length; ++i)
        {
            let jEnt = JSON.parse(jray[i]);
            let ent = MNetworkEntity.fromJSON(jEnt);
            ws.lookup.setValue(ent.netId, ent);
        }
    }

    toJSON()
    {
        let result : any = {};
        result.m = this.metaDataToByteString();
        let entstrs = new Array<string>();
        this.lookup.forEach((key, ent) => {
            entstrs.push(JSON.stringify(ent));
        });
        result.l = entstrs;
        return result;
    }

    static fromJSON(jo : any) : MWorldState
    {
        let ws = new MWorldState();
        this.SetMetaDataFromByteString(ws, jo.m);
        this.SetEntsFromJSON(ws, jo.l);
        return ws;
    }

    constructor(
    ) 
    {
        this.getPuppet = (ent : MNetworkEntity) => { return new PlaceholderPuppet(); }
        this._timestamp = +new Date();
    }

    public cloneFrom(other : MWorldState) : void
    {
        this.ackIndex = other.ackIndex;
        other.lookup.forEach((key : string, ent : MNetworkEntity) => {
            this.lookup.setValue(key, ent.clone());
        });

    }

    debugShadowCopyPlayerInterpDataFrom(other : MWorldState) : void 
    {
        this.ackIndex = other.ackIndex;
        other.forEachPlayer((plent) => {
            let shnetId = plent.netId; // + "SHAD";
            let shPlayer = this.lookup.getValue(shnetId);
            if(shPlayer) {
                let shplent = shPlayer.getPlayerEntity();
                if(shplent) {
                    let otherID = plent.puppet.getInterpData();
                    let shID = shplent.puppet.setInterpData(otherID);
                }
            }
            else {
                console.log(`no shplayer with netId ${shnetId}`);
            }
        })        
    }

    debugFindAnotherPlayer(skipNetId : string) : Nullable<MNetworkPlayerEntity>
    {
        let result = null;
        this.forEachPlayer((plent) => {
            if(plent.netId !== skipNetId) { result = plent; return true; }
            return false;
        });

        return result;
    }

    debugGetPlayerUnsafe(netId : string) : MNetworkPlayerEntity
    {
        return <MNetworkPlayerEntity> this.lookup.getValue(netId);
    }

    // lamentable (spaghetti)
    public cloneAuthStateToInterpData() : MWorldState
    {
        let clone = new MWorldState();
        this.lookup.forEach((key , ent) => {
            clone.lookup.setValue(key, ent.cloneWithAuthStateOfOtherToInterpData());
        });
        return clone;
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
        ws._timestamp = this._timestamp;

        this.relevancyFilter(
            observer, 
            scene,
            relevantBook,
            closeByRadius,
            (relevancy, key, ent) => {
                if(relevancy > MServer.Relevancy.NOT_RELEVANT) {
                    ws.setEntity(key, ent);
                }
            }
        );

        return ws;
    }

    public relevancyFilter(
        observer : MNetworkPlayerEntity | undefined, 
        scene : Scene, 
        relevantBook : Collections.Dictionary<string, number>, 
        closeByRadius : number,
        callback : (relevancy : MServer.Relevancy, key : string, ent : MNetworkEntity, prevRelevancy : MServer.Relevancy) => void
        ) : void
    {

        if(observer === undefined) { return; } // ws; }
        
        let keys = this.lookup.keys();
        let key : string = '';
        let relevancy : number | undefined = 0;
        let prevRelevancy : MServer.Relevancy = MServer.Relevancy.NOT_RELEVANT;
        let ent : MNetworkEntity | undefined = undefined;
        for(let j=0; j<keys.length; ++j)
        {
            key = keys[j];
            ent = <MNetworkEntity> this.lookup.getValue(key);
            relevancy = relevantBook.getValue(key);

            if(relevancy !== undefined) { prevRelevancy = relevancy; }

            if(ent === observer) { relevancy = prevRelevancy = MServer.Relevancy.RECENTLY_RELEVANT; }
            else if(relevancy === undefined) { 
                relevancy = MServer.Relevancy.NOT_RELEVANT; 
            }
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

            callback(relevancy, key, ent, prevRelevancy);
            // if(relevancy > MServer.Relevancy.NOT_RELEVANT) {
            //     ws.lookup.setValue(key, ent);
            // }
        }
        // return ws;
    }

    public debugCheckPositions() : void
    {
        this.lookup.forEach((key : string, ent : MNetworkEntity) => {
            let plent = ent.getPlayerEntity();
            if(plent) console.log(`${plent.netId}:  ${plent.playerPuppet.getInterpData().position}`);
        });
    }

    debugHasDeltaEntities() : string
    {
        let deltaCount = 0;
        let len = this.lookup.keys().length;
        this.lookup.forEach((key, ent) => {
            if(ent.isDelta) {
                deltaCount++;
            }
        });
        return deltaCount === 0 ? "no deltas" : (deltaCount === len ? "all deltas" : `mixed delta, abs ${deltaCount} / ${len}`);
    }

    relevancyShallowCloneOrDeltaFrom(
        other : MWorldState,
        observer : MNetworkPlayerEntity | undefined, 
        scene : Scene, 
        relevantBook : Collections.Dictionary<string, number>, 
        closeByRadius : number) : MWorldState
    {
        // delta updates don't play well with relevancy filtering at the moment.
        // resolving a base state when an entity comes into relevancy from irrelevancy
        // doesn't work. (causes inaccurate positions and shaking.)
        throw new Error(`please don't use this method at all. (only do abs updates)`);

        let delta = new MWorldState();
        delta.ackIndex = this.ackIndex;
        delta.deltaFromIndex = other.ackIndex;
        delta._timestamp = this._timestamp;
        

        this.relevancyFilter(
            observer,
            scene,
            relevantBook,
            closeByRadius,
            (relevancy, key, ent, prevRelevancy) => {
                if(relevancy > MServer.Relevancy.NOT_RELEVANT) {
                    let baseEnt = other.lookup.getValue(key);
                    if(!baseEnt) {
                        delta.lookup.setValue(key, ent);
                    } else {
                        // TODO: Actually handle relevancy transitions
                        // on client. We're reverting to Abs updates for now
                        // so this method won't even be used

                        // did they just become relevant?
                        // if so, just copy. don't send a delta
                        // because deltas won't be accurate when 
                        // based on out of date base states
                        // if(prevRelevancy <= MServer.Relevancy.NOT_RELEVANT) {
                        //     let clone = ent.clone();
                        //     clone.needsRebase = true;
                        //     delta.lookup.setValue(key, clone);
                        // } else 
                        {
                            delta.lookup.setValue(key, ent.minus(baseEnt));
                        }
                    }
                }
            }
        );
        return delta;
    }

    deltaFrom(other : MWorldState) : MWorldState
    {
        let delta = this.minus(other);
        delta.ackIndex = this.ackIndex;
        delta.deltaFromIndex = other.ackIndex;
        delta._timestamp = this._timestamp;
        return delta;
    }
 
    private minus(other : MWorldState) : MWorldState
    {
        let delta = new MWorldState();
        this.lookup.forEach((key : string, ent : MNetworkEntity) => {
            let otherEnt = other.lookup.getValue(key);
            if(otherEnt === undefined){
                delta.lookup.setValue(key, ent.clone());
            } else {
                delta.lookup.setValue(key, ent.minus(otherEnt));
            }
        });

        return delta;
    }

    // 'un - minus' (client)
    addInPlaceCopyOrCloneCreate(other : MWorldState) : void
    {
        other.lookup.forEach((key, otherEnt) => {
            let thisEnt = this.lookup.getValue(key);
            if (thisEnt === undefined) {
                // assert otherEnt not delta
                this.lookup.setValue(key, otherEnt.clone());
            } else {
                thisEnt.addInPlaceOrCopyNonDelta(otherEnt);
            }
        });
    }

    debugDifsToString(other : MWorldState) : string
    {
        let result = "";
        other.lookup.forEach((key, otherEnt) => {
            let ent = this.lookup.getValue(key);
            if(ent) {
                result += ent.puppet.getInterpData().difToString(otherEnt.puppet.getInterpData());
            } else {
                result += "[]";
            }
        });
        return result;
    }

    static TestMinusThenAddBack(a : MWorldState, b : MWorldState) : string
    {
        let delta = a.minus(b);
        b.addInPlaceCopyOrCloneCreate(delta);

        return b.debugDifsToString(a);
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
        let ent = deltaEnt.clone();
        this.lookup.setValue(key, ent);

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

    // client side (acutally nowhere, not in use!)
    // purge?
    // public apply(state : MWorldState) : void
    // {
    //     state.lookup.forEach((key : string, nextEnt : MNetworkEntity) => {
    //         let ent = this.lookup.getValue(key);

    //         if(ent == undefined) 
    //         {
    //             ent = this.makeNetEntFrom(key, nextEnt);
    //         }
    //         else 
    //         {
    //             ent.apply(nextEnt);
    //         }
    //     });
    // }

    public purgeDeleted(state : MWorldState) : void
    {
        let deletables = new Array<string> ();
        state.lookup.forEach((key : string, ent : MNetworkEntity) => {
            let e = this.lookup.getValue(key);
            if(e !== undefined && ent.shouldDelete)
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
    public updateAuthStatePushInterpolationBuffers(update : MWorldState) : void
    {
        update.lookup.forEach((key : string, updateEnt : MNetworkEntity) => {
            let ent = this.lookup.getValue(key);

            if(ent === undefined) {
                ent = this.makeNetEntFrom(key, updateEnt);
            }
           
            ent.updateAuthState(updateEnt);
            ent.pushInterpolationBuffer(update.ackIndex);
            // health
            ent.applyNonDelta(updateEnt);
        });

        // the update may not contain all entities
        // (some may have been deemed irrelevant or have had zero deltas)
        // push the interpolation buffers for these ents as well, to avoid repeatedly
        // replaying the last known from-to interpolation. 
        // WANT?
        // this.lookup.forEach((key, ent) => {
        //     if(!update.lookup.getValue(key)) {
        //         ent.pushInterpolationBuffer(update.ackIndex);
        //     }
        // });
    }

    // client side
    // updateAuthState(update : MWorldState) : void 
    // {
    //     update.lookup.forEach((key : string, updateEnt : MNetworkEntity) => {
    //         let ent = this.lookup.getValue(key);

    //         if(ent == undefined) {
    //             ent = this.makeNetEntFrom(key, updateEnt);
    //         }
           
    //         ent.updateAuthState(updateEnt);
            
    //     });
    // }

    public interpolate(ignore : MNetworkPlayerEntity) : void 
    {
        this.lookup.forEach((uid : string, ent : MNetworkEntity) => {

            // don't interpolate our own player avatar
            if(ent !== ignore)
            {
                ent.interpolate();
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

    public rewindPlayers(a : MWorldState, b: MWorldState, lerper01 : number, skipUID ? : string) : void 
    {
        this.lookup.forEach((key : string, ent : MNetworkEntity) => {
            let plent = ent.getPlayerEntity();
            if(plent !== null && key !== skipUID)
            {
                let pA = <MNetworkPlayerEntity> a.lookup.getValue(key);
                let pB = <MNetworkPlayerEntity> b.lookup.getValue(key);
                if(pA !== undefined && pB !== undefined)
                {
                    let pos = Vector3.Lerp(pA.position, pB.position, lerper01);
                    plent.rewind(pos);
                } 
            }
        });
    }

    private forEachPlayer(callbackShouldNotContinue : (plent : MNetworkPlayerEntity) => (boolean | void)) : void 
    {
        let keys = this.lookup.keys();
        for(let i=0; i<keys.length; ++i) {
            let ent = this.lookup.getValue(keys[i]);
            if(ent) {
                let plent = ent.getPlayerEntity();
                if(plent) {
                    if(callbackShouldNotContinue(plent)) {return;}
                }
            }
        }
        // this.lookup.forEach((key, ent) => {
        //     let plent = ent.getPlayerEntity();
        //     if(plent !== null) {
        //         callback(plent);
        //     }
        // });
    }

    debugSetPlayerColors(c : Color3, lineColor ? : Color3) : void
    {
        this.forEachPlayer((plent) => {
            let pupp = plent.puppet;
            if(pupp instanceof MPlayerAvatar) {
                pupp.setCharacterColor(c, lineColor);
            }
        });
    }


    
}
