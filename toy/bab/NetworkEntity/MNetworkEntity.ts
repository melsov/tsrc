import * as Babylon from "babylonjs";
import { CliCommand, KeyMoves } from "../MPlayerInput";
import { TransformNode, Vector3, Ray, Nullable, Mesh, MeshBuilder, Tags, StandardMaterial, Scene, NoiseProceduralTexture, SSAORenderingPipeline } from "babylonjs";
import { BHelpers } from "../../MBabHelpers";
import { Puppet, PlaceholderPuppet, MLoadOut } from "../MPuppetMaster";
import { MPlayerAvatar, DEBUG_SPHERE_DIAMETER, MAX_HEALTH as MAX_HEALTH_PLAYER } from "../MPlayerAvatar";
import { MProjectileHitInfo, ProjectileType } from "./transient/MProjectileHitInfo";
import { GameEntityTags } from "../../GameMain";
import { MUtils } from "../../Util/MUtils";
import { MTransientStateBook, FireActionType } from "./transient/MTransientStateBook";
import { MAudio } from "../../loading/MAudioManager";
import { Float16Array, getFloat16, setFloat16, hfround } from "@petamoriken/float16";
import { MByteUtils } from "../../Util/MByteUtils";
// import { MServer } from "../../MServer";
import * as MServr  from "../../MServer"
import { MSelectiveSetValue } from "../../helpers/MSelectiveSetValue";
import { MPrintBinaryUtil } from "../../Util/MPrintBinaryUtil";
import { UILabel } from "../../html-gui/UILabel";


export abstract class MNetworkEntity
{

    constructor(
        public _netId : string
    ) {}

    public abstract entityType : number;

    public lastAuthoritativeState : InterpData = new InterpData();

    public abstract puppet : Puppet;

    // needsRebase : boolean = false;
    // rebaseInterpData : Nullable<InterpData> = null;

    public get shouldDelete() : boolean {return false; }
    public set shouldDelete(val : boolean)  { }

    public isDelta : boolean = false;

    public abstract setupPuppet(pupp : Puppet) : void;

    public get isAPlayerEntity() : boolean { return false; }

    public getPlayerEntity() : Nullable<MNetworkPlayerEntity> { return null;}

    public get netId() : string { return this._netId; }

    // Server 
    public abstract applyCliCommand (cliCommand : CliCommand) : void;
    
    public abstract teleport(pos : Vector3) : void;

    // public abstract applyDelta(delta : MNetworkEntity) : void;

    public abstract apply(update : MNetworkEntity) : void;

    public abstract applyNonDelta(update : MNetworkEntity) : void;

    abstract updateAuthState(update : MNetworkEntity) : void;

    public abstract pushInterpolationBuffer(debubAckIndex : number) : void //absUpdate : MNetworkEntity) : void;

    public abstract interpolate() : void;

    public abstract clearTransientStates() : void;

    // client state changes
    public abstract pushStateChanges(ne : MNetworkEntity) : void;

    public static fromJSON(serstr : any) : MNetworkEntity
    {
        let jo = <any> serstr;
        // if(typeof(serstr) === 'string')
        //     jo = JSON.parse(serstr);
        switch(jo.entityType)
        {
            case EntityType.PLAYER:
            case undefined:
            default:
                return MNetworkPlayerEntity.fromJSON(jo);
        }
    }

    public abstract clone() : MNetworkEntity;

    abstract cloneWithAuthStateOfOtherToInterpData() : MNetworkEntity;

    public abstract minus(other : MNetworkEntity) : MNetworkEntity;

    public abstract addInPlaceOrCopyNonDelta(delta : MNetworkEntity) : void;

    public abstract plus(other : MNetworkEntity) : MNetworkEntity;

    public abstract renderLoopTick(deltaTime : number) : void;

    public abstract destroySelf() : void;
}

export enum EntityType
{
    PLAYER = 1
}



function GetTInterpDataBuffer(buff:ArrayBuffer) {
    return new Float32Array(buff);
}
function SizeTInterpDataByes() : number { return 4; }

export class InterpData
{
    // TODO: send, reinstate interpdata to, from Float16

    position : Vector3;
    rotation : Vector3;

    constructor(
         _position ? : Vector3,
         _rotation ? : Vector3
    ) {
        this.position = (_position !== undefined) ? _position : Vector3.Zero();
        this.rotation = (_rotation !== undefined) ? _rotation : Vector3.Zero();
    }

    clone() : InterpData
    {
        let other = new InterpData();
        other.copyFrom(this);
        return other;
    }

    minus(other : InterpData) : InterpData
    {
        let dPos = this.position.subtract(other.position);
        MUtils.RoundMoveVecInPlace(dPos);
        return new InterpData(dPos, this.rotation.subtract(other.rotation));
    }

    addInPlace(other : InterpData) : void 
    {
        this.position.addInPlace(other.position);
        this.rotation.addInPlace(other.rotation);
    }

    addXZInPlace(other : InterpData) : void 
    {
        MUtils.AddXZInPlace(this.position, other.position);
        MUtils.AddXZInPlace(this.rotation, other.rotation);
    }

    hasNonZeroData() : boolean
    {
        return MUtils.VecHasNonEpsilon(this.position) || MUtils.VecHasNonEpsilon(this.rotation);
    }


    copyFrom(other : InterpData) : void
    {
        this.position.copyFrom(other.position);
        this.rotation.copyFrom(other.rotation);
    }

    static Lerp(a : InterpData, b : InterpData, t : number) : InterpData
    {
        let l = new InterpData();
        l.position = Vector3.Lerp(a.position, b.position, t);
        l.rotation = Vector3.Lerp(a.rotation, b.rotation, t);
        return l;
    }

    static FromJSON(idj : any) : InterpData
    {
        return new InterpData(BHelpers.Vec3FromJSON(idj.position), BHelpers.Vec3FromJSON(idj.rotation));
    }

    difToString(other : InterpData) : string
    {
        let delta = this.position.subtract(other.position);
        if(delta.lengthSquared() < .00001) { return 'small'; }
        return MUtils.FormatVector(delta, 4); 
    }

    // region Float16Array
    private writeToFloatArray(fsrView : any, offset : number) : void
    {
        MUtils.WriteVecToFloatArray(fsrView, this.position, offset);
        MUtils.WriteVecToFloatArray(fsrView, this.rotation, offset + 3);
    }

    private static FromFloatArray(ftrView : any, offset : number) : InterpData
    {
        return new InterpData(
            MUtils.ReadVec(ftrView, offset),
            MUtils.ReadVec(ftrView, offset + 3)
        );
    }

    public static SizeFloatBytes() : number { return 2 * 3 * SizeTInterpDataByes(); } // 2 vectors * 3 floats per vector * sizeof a float

    toByteString() : string
    {
        let buff = new ArrayBuffer(InterpData.SizeFloatBytes());
        let floats = GetTInterpDataBuffer(buff); 
        this.writeToFloatArray(floats, 0);
        let uint8s = new Uint8Array(buff);
        return MByteUtils.Uint8ArrayToString(uint8s);
    }

    static FromByteString(str : string) : InterpData
    {
        let uint8s = MByteUtils.StringToUInt8s(str);
        let floats = GetTInterpDataBuffer(uint8s.buffer); 
        return InterpData.FromFloatArray(floats, 0);
    }
}


//
// NOT IN USE
// Encapsulates the data should be replicated
// between clients for player entities
//
class SendDataPlayerEntity
{
    // public position : Babylon.Vector3 = new Vector3();
    interpData : InterpData = new InterpData();
    public get position() : Vector3 { return this.interpData.position; }
    public set position(v : Vector3) { this.interpData.position = v; }

    // public entityType : number = <number> EntityType.PLAYER; // leave undefined. EntityType.PLAYER is the default (e.g. in deserialize)
    public netId : string = "";
    public health : number = -1;

    // static CreateFrom(id : InterpData, _netId : string) : any // SendDataPlayerEntity
    // {
    //     let sd : any = {}; // new SendDataPlayerEntity();
    //     if(id.hasNonZeroData()) {
    //         // TO BYTE STRING INSTEAD ?
    //         // sd.interpData = id.toByteString();

    //         /// old way
    //         sd.interpData = new InterpData();
    //         if(MUtils.VecHasNonEpsilon(id.position)) { sd.interpData.position = id.position.clone(); }
    //         if(MUtils.VecHasNonEpsilon(id.rotation)) { sd.interpData.rotation = id.rotation.clone(); }
    //     }

    //     sd.netId = _netId;
    //     return sd;
    // }
}

//
// For the entities/puppets of other players
//
export class OtherPlayerInterpolation
{
    interpData : InterpData = new InterpData();
    public timestamp : number = 0;
    public debugAckIndex : number = -1;

    constructor(
        interpData ? : InterpData,
        timestamp ? : number,
        debugAckIndex ? : number
    ) {
        if(interpData) { this.interpData = interpData; }
        if(timestamp) { this.timestamp = timestamp; }
        if(debugAckIndex) { this.debugAckIndex = debugAckIndex;}
    }

}

export class CliTarget
{
    // public position : Vector3 = new Vector3();
    interpData : InterpData = new InterpData();
    public timestamp : number = 0;
   

    clone() : CliTarget
    {
        let other = new CliTarget();
        other.interpData.copyFrom(this.interpData);
        other.timestamp = this.timestamp;
        return other;
    }

    copyFrom(other : CliTarget) : void
    {
        this.interpData.copyFrom(other.interpData);
        this.timestamp = other.timestamp;
    }

    static Lerp(a : CliTarget, b : CliTarget, t : number) : CliTarget
    {
        let l = new CliTarget();
        l.interpData = InterpData.Lerp(a.interpData, b.interpData, t);
        return l;
    }
}

function FromToInterp(a : OtherPlayerInterpolation, b : OtherPlayerInterpolation, renderTimestamp : number) : OtherPlayerInterpolation
{
    let opi = new OtherPlayerInterpolation();
    let lerper = (renderTimestamp - a.timestamp) / (b.timestamp - a.timestamp);

    opi.interpData = InterpData.Lerp(a.interpData, b.interpData, lerper);
    // opi.interpData.position = a.interpData.position.add(b.interpData.position.subtract(a.interpData.position).scale(lerper));

    return opi;
} 

const NOT_HEALTH_DATA : number = MAX_HEALTH_PLAYER * MAX_HEALTH_PLAYER;
 
//
// MNetworkPlayerEntity manages syncing itself over
// a network. Receives/sends SendDataPlayerEntity objects
// passes itself to a (player) Puppet when its state changes
//
export class MNetworkPlayerEntity extends MNetworkEntity
{

    public get position() : Babylon.Vector3 { return this.playerPuppet.getInterpData().position; } // this.sendData.position; }
    public getPuppetInterpDataClone() : InterpData { return this.playerPuppet.getInterpData(); }

    public get entityType() : number { return EntityType.PLAYER; }; 

    protected isClientControlledPlayer() : boolean { return false; }

    public readonly health = new MSelectiveSetValue<number>(
        MAX_HEALTH_PLAYER, 
        (next)=> { return next !== NOT_HEALTH_DATA; }); 


    private savedCurrentPos : Nullable<Vector3> = null;

    public get shouldDelete() : boolean {return this.transientStateBook.shouldDelete; }
    public set shouldDelete(val : boolean)  { this.transientStateBook.shouldDelete = val; }
    // protected projectileHitsOnMe : Array<MProjectileHitInfo> = new Array<MProjectileHitInfo>();
    protected transientStateBook : MTransientStateBook = new MTransientStateBook();

    // public moveSpeed : number = .1;
    
    public puppet : Puppet = new PlaceholderPuppet();

    public get playerPuppet() : MPlayerAvatar { return <MPlayerAvatar> this.puppet; }
    
    protected interpBuffer : Array<OtherPlayerInterpolation> = new Array<OtherPlayerInterpolation>();

    public get isAPlayerEntity() : boolean { return true; }


    // TODO: interpolate command moves for cliOwnedPlayer 
    // each command updates a move target.
    // player must reach the move target by next command time

    public getPlayerEntity() : Nullable<MNetworkPlayerEntity> { return this; }

    //
    // debug: shadow to show our position from the
    // perspective of another client
    // public  shadow : Nullable<Mesh> = null;

    constructor(
        public _netId : string, 
        _pos ? : Vector3,
        _rot ? : Vector3) 
    {
        super(_netId);
        this.puppet.setInterpData(new InterpData(_pos, _rot));

    }

    static CreateFrom(_netId : string, interpData ? : InterpData) : MNetworkPlayerEntity 
    {
        if(interpData) {
            return new MNetworkPlayerEntity(_netId, BHelpers.Vec3FromPossiblyNull(interpData.position), BHelpers.Vec3FromPossiblyNull(interpData.rotation));
        } else {
            return new MNetworkPlayerEntity(_netId, Vector3.Zero(), Vector3.Zero());
        }
    }
    

    public setupPuppet(pupp : MPlayerAvatar) : void 
    { 
        let id = this.puppet.getInterpData();
        this.puppet = pupp; 
        this.puppet.setInterpData(id);
    }
    
    public setupShadow(scene : Scene, debugColorIndex : number)
    {
        // // shadow
        // this.shadow = MeshBuilder.CreateSphere(`${this.netId}-shadow`, {
        //     diameter : DEBUG_SPHERE_DIAMETER
        // }, scene);
    
        // let shmat = new StandardMaterial(`mat-shadow-${this.netId}`,scene);
        // let shcolor = MLoadOut.DebugCreateLoadout(debugColorIndex).color;
        // shcolor = shcolor.scale(.7);
        // shmat.diffuseColor = shcolor;
        // this.shadow.material = shmat;
    
        // Tags.AddTagsTo(this.shadow, GameEntityTags.Shadow);

    }

    public clone() : MNetworkPlayerEntity
    {
        let id = this.puppet.getInterpData();
        let npe = new MNetworkPlayerEntity(this.netId, id.position, id.rotation);
        npe.health.value = this.health;

        MNetworkPlayerEntity.CloneTransientData(this, npe);
        return npe;
    }

    cloneWithAuthStateOfOtherToInterpData() : MNetworkPlayerEntity
    {
        let id = this.lastAuthoritativeState;
        let npe = new MNetworkPlayerEntity(this.netId, id.position, id.rotation);
        npe.health.value = this.health;

        MNetworkPlayerEntity.CloneTransientData(this, npe);
        return npe;
    }

    public static CloneTransientData(from : MNetworkPlayerEntity, to : MNetworkPlayerEntity) : void
    {
        to.transientStateBook = from.transientStateBook.clone();
        // to.projectileHitsOnMe = from.projectileHitsOnMe.slice(0);
        // to.shouldDelete = from.shouldDelete;
    }

    private Pack(sd : any) 
    {
        let id = this.puppet.getInterpData();
        let threeFlagsThenHealth = (0b00011111 & this.health.val);
        threeFlagsThenHealth |= ((this.isDelta ? 1 : 0) << 7);
        // two unused bits!
        let strhealth = MByteUtils.ByteSizeNumberToString(threeFlagsThenHealth);
        sd.c = `${this.netId}${id.toByteString()}${strhealth}`;
        this.transientStateBook.addToObject(sd);
    }

    private static Unpack(sd : any) : MNetworkPlayerEntity
    {
        let bstr = <string> sd.c;
        let netId = bstr.substr(0,2);
        let idstr = bstr.substr(2, InterpData.SizeFloatBytes());
        let id = InterpData.FromByteString(idstr);

        let result = new MNetworkPlayerEntity(netId, id.position, id.rotation);
        
        bstr = bstr.substr(2 + InterpData.SizeFloatBytes());
        let uint8s = MByteUtils.StringToUInt8s(bstr);
        result.health.takeValue = uint8s[0] & 0b11111;
        
        result.isDelta = (uint8s[0] & 0b10000000) === 1;

        let tsBook = MTransientStateBook.ExtractFromObject(sd);
        if(tsBook) {
            result.transientStateBook = tsBook;
        }

        return result;
    }
    
    // JSON.stringify() looks for this method.
    // return the data that should be sent 
    // to replicate this entity (i.e. the sendData).
    toJSON()
    {
        let sd : any = {};
        this.Pack(sd);
        return sd;
    }
    
    public static fromJSON(sd : any) : MNetworkPlayerEntity
    {
        return this.Unpack(sd);
    }

    // OLD WAY
    // public toJSON()
    // {
    //     let sd : any = {}; // new SendDataPlayerEntity();
    //     let id = this.puppet.getInterpData();

    //     if(id.hasNonZeroData()) {
    //         sd.i = id.toByteString();
    //     }

    //     sd.n = this._netId;

    //     // TODO: if health hasn't changed (mechanism for determining whether it has)
    //     // don't include health in send data
    //     sd.h = this.health.val;

    //     let jObj : any = {}; // {'s' : sd}; 

    //     // TODO: if there's no interesting send data, don't assign sd to jObj.s;
    //     if(sd) { jObj.s = sd; }

    //     this.transientStateBook.addToObject(jObj);

    //     if(this.isDelta) { jObj.d = true; }
    //     // if(this.needsRebase) { jObj.rb = true; }

    //     return jObj;
    // }



    public static fromJSONOLDWAY(joData : any) : MNetworkPlayerEntity
    {
        // ******** OLD WAY ******************//
        // ******** OLD WAY ******************//
        
        let joSendData = joData.s; 
        let npe : MNetworkPlayerEntity;
        let id : InterpData;
        if(!joSendData.i) {
            id = new InterpData();
        } 
        else {
            id = InterpData.FromByteString(joSendData.i);
        }
        // ******** OLD WAY ******************//
        // ******** OLD WAY ******************//


        npe = new MNetworkPlayerEntity(
            joSendData.n, 
            BHelpers.Vec3FromPossiblyNull(id.position), 
            BHelpers.Vec3FromPossiblyNull(id.rotation));
            // BHelpers.Vec3FromPossiblyNull(joSendData.interpData.position), 
            // BHelpers.Vec3FromPossiblyNull(joSendData.interpData.rotation));

        // ******** OLD WAY ******************//
        // ******** OLD WAY ******************//
        npe.health.takeValue = joSendData.h ? joSendData.h : NOT_HEALTH_DATA;
        // npe.needsRebase = joData.rb !== undefined;

        let tsBook = MTransientStateBook.ExtractFromObject(joData);
        if(tsBook) {
            npe.transientStateBook = tsBook;
        }
        // npe.transientStateBook = MTransientStateBook.ExtractFromObject(joData);

        npe.isDelta = joData.d !== undefined;
        
        return npe;
    }


    //
    //  Server: clear, for example, hits on me list
    //
    public clearTransientStates() : void 
    {
        this.transientStateBook.clear();
        // this.projectileHitsOnMe.length = 0;
    }   

    public recordWeaponAction(fireAction : FireActionType) : void
    {
        this.transientStateBook.firedWeapon = fireAction;
    }
    
    protected moveDir(cmd : CliCommand) : Vector3
    {
        let groundForward = MUtils.ProjectOnNormal(cmd.forward, Vector3.Up()).normalize();
        let groundRight = Vector3.Cross(Vector3.Up(), groundForward);
        return groundForward.scale(cmd.vertical).add(groundRight.scale(cmd.horizontal)).normalize();
    }

    // need to apply commands directly to the puppet.
    // anything the puppet does should be over a parameterized time interval
    

    // consider: simply hand over the command to the puppet?
    // then: net entity just snags send data from puppet at send time
    // send time is on the server.
    // still we must ensure that jumps on the server get player to the same place
    // as jumps on the client (which are animated with more granularity)
    // this would be simple enough if we knew there would never be head bumps...
    
    // nowhere
    public applyCliCommand (cliCommand : CliCommand) : void
    {
        this.playerPuppet.applyCommandServerSide(cliCommand);
        throw new Error('this will never happen');
    }
 
    // server
    public applyCliCommandServerSide(cliCommand : CliCommand) : void
    {
        this.playerPuppet.applyCommandServerSide(cliCommand);
    }

    // server
    public getHitByProjectile(prjInfo : MProjectileHitInfo) 
    {
        console.log(`got hit ${prjInfo}`);
        this.transientStateBook.projectileHitsOnMe.push(prjInfo);
        this.playerPuppet.showGettingHit(prjInfo);
        this.health.takeValue = Math.max(0, this.health.val - prjInfo.damage);
        console.log(`HEALTH: ${this.health.val}`);
    }
    
    public teleport(pos : Vector3) : void
    {
        //force the puppet
        this.playerPuppet.teleport(pos);
        // this.sendData.position.copyFrom(pos); 
    }
    
    public resetToThePresent() : void 
    {
        if(this.savedCurrentPos)
        {
            this.teleport(this.savedCurrentPos);
            this.savedCurrentPos = null;
        }
    }
    
    public rewind(pos : Vector3) : void
    {
        this.savedCurrentPos = this.position.clone();
        //debug place shadow
        // if(this.shadow)
        //     this.shadow.position = pos.clone();
        this.teleport(pos);
    }
    
    public apply(update : MNetworkPlayerEntity) : void
    {
        this.transientStateBook.shouldDelete = update.transientStateBook.shouldDelete;

        this.health.value = update.health;

        // want delta compression
        // if(update.isDelta)
        // {
        //     this.sendData.position.addInPlace(update.position);
        //     this.applyToPuppet();
        // } 
        // else 
        {
            this.teleport(update.position);
        }
    }

    applyNonDelta(update : MNetworkPlayerEntity) : void 
    {
        if(this.health.val !== update.health.val)
            console.log(`My HEALTH: ${this.health.val}`);

        this.health.value = update.health;
    }

    // Use only for interpolating other players
    protected applyToPuppet(cliTar : CliTarget, ignoreCollisions ? : boolean)
    {
        if(ignoreCollisions !== undefined && ignoreCollisions)
            this.puppet.applyNetEntityUpdateIngoreCollisions(cliTar);
        else 
            this.puppet.applyNetworkEntityUpdate(cliTar);

        

        // apply puppet pos back to our send data.
        // our need to do this might indicate a design flaw ;P
        // this.sendData.position.copyFrom(this.playerPuppet.mesh.position);
    }

    //
    // interpolation 
    //


    pushInterpolationBuffer(debugAckIndex : number) : void 
    {
        this.interpBuffer.push(new OtherPlayerInterpolation(this.lastAuthoritativeState.clone(), +new Date(), debugAckIndex));
    }

    updateAuthState(update : MNetworkEntity) : void 
    {
        if(update.isDelta) {
            throw "This won't happen. not doing deltas at the moment";
            console.log("up auth state: is delta");
            this.lastAuthoritativeState.addInPlace(update.puppet.getInterpData());
        } else {
            this.lastAuthoritativeState.copyFrom(update.puppet.getInterpData());
        }
    }

    public debugLastOPIPair : Nullable<[OtherPlayerInterpolation, OtherPlayerInterpolation]> = null;

    // TODO: do we need three point interpolation?
    // we see a very slight pause that may be due to transitions across interp points. (maybe)
    // (or maybe could be due to the extra computation time during server message processing?)
    // the pause is hard to notice; not game-breaking.
    
    interpolate() : void
    {
        let debugRewindConfig = MServr.MServer.DebugGetRewindConfig();
        let now = +new Date();
        let renderTimestamp = now - debugRewindConfig.InterpRewindMillis;

        // drop older positions
        while(this.interpBuffer.length >= 2 && this.interpBuffer[1].timestamp <= renderTimestamp) {
            this.interpBuffer.shift();
        }

        this.debugLastOPIPair = null;

        if(this.interpBuffer.length >= 2 && this.interpBuffer[0].timestamp <= renderTimestamp && renderTimestamp <= this.interpBuffer[1].timestamp)
        {
            let opi = FromToInterp(this.interpBuffer[0], this.interpBuffer[1], renderTimestamp);
            let ct = new CliTarget();
            ct.interpData.copyFrom(opi.interpData);
            this.applyToPuppet(ct, true); 

            this.debugLastOPIPair = [this.interpBuffer[0], this.interpBuffer[1]];
        }
    }

    //
    // client state changes
    // 
    pushStateChanges(npe : MNetworkPlayerEntity) : void
    {
        // handle getting hit
        while(npe.transientStateBook.projectileHitsOnMe.length > 0)
        {
            this.playerPuppet.showGettingHit(<MProjectileHitInfo>npe.transientStateBook.projectileHitsOnMe.shift());
        }

        if(!this.isClientControlledPlayer())
        {
            if(npe.transientStateBook.firedWeapon === FireActionType.Fired) 
            {
                // play weapon fire audio
                console.log(`kaboom! (source : ${this.netId})`);
                this.playerPuppet.arsenal.equipped().fire(KeyMoves.DownUpHold.Down);
                this.playerPuppet.createFireImpactEffects(this.playerPuppet.getFireRay(this.playerPuppet.mesh.forward));
                this.playerPuppet.arsenal.equipped().playClientSideFireEffects(); // Don't want
                // MAudio.MAudioManager.Instance.enqueue(MAudio.SoundType.HandGunFire, npe.position);
            }
            else if(npe.transientStateBook.firedWeapon === FireActionType.Reloaded)
            {
                console.log(`reloading (source: ${this.netId})`);
                this.playerPuppet.arsenal.equipped().playReload();
            }
        }
    }



    public minus(other : MNetworkPlayerEntity) : MNetworkPlayerEntity
    {
        let id = this.getPuppetInterpDataClone();        
        let otherID = other.getPuppetInterpDataClone();
        let delta = id.minus(otherID);

        // CONSIDER: this constructor causes an unneeded extra copying of interp data.
        // TODO: just change it so that it takes an optional InterpData arg instead of pos ro separately.
        let npe = new MNetworkPlayerEntity(this.netId, delta.position, delta.rotation);
        MNetworkPlayerEntity.CloneTransientData(this, npe);
        npe.health.value = this.health;
        npe.isDelta = true;

        return npe;
    }

    public addInPlaceOrCopyNonDelta(delta : MNetworkPlayerEntity) : void
    {
        if(delta.isDelta)
        {
            let id = this.getPuppetInterpDataClone();
            let otherID = delta.getPuppetInterpDataClone();

            id.addInPlace(otherID);
            this.puppet.setInterpData(id);
        } 
        else 
        {
            // this.needsRebase = delta.needsRebase;
            this.puppet.setInterpData(delta.getPuppetInterpDataClone());
        }

        // health always copy (for now?)
        this.health.value = delta.health;
    }

    public plus(other : MNetworkEntity) : MNetworkEntity
    {
        throw new Error("impl, if we end up needing this");
    }

    public renderLoopTick(deltaTime : number) : void
    {

    }

    public destroySelf() : void
    {
        // if(this.shadow) this.shadow.dispose();
        this.playerPuppet.destroy();
    }

}