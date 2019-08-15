import * as Babylon from "babylonjs";
import { CliCommand } from "../MPlayerInput";
import { TransformNode, Vector3, Ray, Nullable, Mesh, MeshBuilder, Tags, StandardMaterial, Scene } from "babylonjs";
import { BHelpers } from "../../MBabHelpers";
import { Puppet, PlaceholderPuppet, MLoadOut } from "../MPuppetMaster";
import { MPlayerAvatar, DEBUG_SPHERE_DIAMETER, MAX_HEALTH as MAX_HEALTH_PLAYER } from "../MPlayerAvatar";
import { MProjectileHitInfo, ProjectileType } from "../../MProjectileHitInfo";
import { GameEntityTags } from "../../GameMain";
import { MUtils } from "../../Util/MUtils";

export abstract class MNetworkEntity
{
    public abstract entityType : number;

    protected abstract puppet : Puppet;

    public shouldDelete : boolean = false;

    public isDelta : boolean = false;

    public abstract setupPuppet(pupp : Puppet) : void;

    public get isAPlayerEntity() : boolean { return false; }

    public getPlayerEntity() : Nullable<MNetworkPlayerEntity> { return null;}

    public abstract get netId() : string;

    // Server 
    public abstract applyCliCommand (cliCommand : CliCommand) : void;
    
    public abstract teleport(pos : Vector3) : void;

    // public abstract applyDelta(delta : MNetworkEntity) : void;

    public abstract apply(update : MNetworkEntity) : void;

    public abstract pushInterpolationBuffer(absUpdate : MNetworkEntity) : void;

    public abstract interpolate(serverUpdateIntervalMillis : number) : void;

    public abstract clearTransientStates() : void;

    // client state changes
    public abstract pushStateChanges(ne : MNetworkEntity) : void;

    public static deserialize(serstr : (string | object)) : MNetworkEntity
    {
        let jo = <any> serstr;
        if(typeof(serstr) === 'string')
            jo = JSON.parse(serstr);
        switch(jo.entityType)
        {
            case EntityType.PLAYER:
            case undefined:
            default:
                return MNetworkPlayerEntity.deserialize(jo);
        }
    }

    public abstract clone() : MNetworkEntity;

    public abstract minus(other : MNetworkEntity) : MNetworkEntity;

    public abstract plus(other : MNetworkEntity) : MNetworkEntity;

    public abstract renderLoopTick(deltaTime : number) : void;

    public abstract destroySelf() : void;
}

export enum EntityType
{
    PLAYER = 1
}

export class InterpData
{
    position : Vector3;
    constructor(
         _position ? : Vector3
    ) {
        this.position = (_position !== undefined) ? _position : Vector3.Zero();
    }

    clone() : InterpData
    {
        let other = new InterpData();
        other.position.copyFrom(this.position);
        return other;
    }

    copyFrom(other : InterpData) : void
    {
        this.position.copyFrom(other.position);
    }

    static Lerp(a : InterpData, b : InterpData, t : number) : InterpData
    {
        let l = new InterpData();
        l.position = Vector3.Lerp(a.position, b.position, t);
        return l;
    }
}

//
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

    static CreateFrom(_interpData : InterpData, _netId : string) : SendDataPlayerEntity
    {
        let sd = new SendDataPlayerEntity();
        sd.interpData.copyFrom(_interpData);
        sd.netId = _netId;
        return sd;
    }
}

//
// For the entities/puppets of other players
//
export class OtherPlayerInterpolation
{
    //public position : Vector3 = new Vector3();
    interpData : InterpData = new InterpData();
    public timestamp : number = 0;
}

// TODO: a single interp data class. <--YES PLEASE
// right now OtherPlayerInterpolation, CliTarget and SendData
// all replicate a variable (position).
// This will get messy once there is more data to interpolate across 
// the three of them


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

    opi.interpData.position = a.interpData.position.add(b.interpData.position.subtract(a.interpData.position).scale(lerper));

    return opi;
}

//
// MNetworkPlayerEntity manages syncing itself over
// a network. Receives/sends SendDataPlayerEntity objects
// passes itself to a (player) Puppet when its state changes
//
export class MNetworkPlayerEntity extends MNetworkEntity
{
    public get netId(): string { return this._netId; } // sendData.netId; }
    public get position() : Babylon.Vector3 { return this.playerPuppet.getInterpData().position; } // this.sendData.position; }
    public get entityType() : number { return EntityType.PLAYER; }; // = <number> EntityType.PLAYER;
    
    public health : number = MAX_HEALTH_PLAYER;

    // public lifeCycle : Nullable<MLifeCycle> = null; // new MLifeCycle(new LifeStage(StageType.DeadConfigureLoadout));
    
    // protected sendData : SendDataPlayerEntity;

    private savedCurrentPos : Nullable<Vector3> = null;


    public projectileHitsOnMe : Array<MProjectileHitInfo> = new Array<MProjectileHitInfo>();

    // public moveSpeed : number = .1;
    
    protected puppet : Puppet = new PlaceholderPuppet();

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
    public  shadow : Nullable<Mesh> = null;

    constructor(
        public _netId : string, 
        pos ? : Babylon.Vector3) 
    {
        super();
        this.puppet.setInterpData(new InterpData(pos));
    }
    

    public setupPuppet(pupp : MPlayerAvatar) : void 
    { 
        let id = this.puppet.getInterpData();
        this.puppet = pupp; 
        this.puppet.setInterpData(id);
    }
    
    public setupShadow(scene : Scene, debugColorIndex : number)
    {
        // shadow
        this.shadow = MeshBuilder.CreateSphere(`${this.netId}-shadow`, {
            diameter : DEBUG_SPHERE_DIAMETER
        }, scene);
    
        let shmat = new StandardMaterial(`mat-shadow-${this.netId}`,scene);
        let shcolor = MLoadOut.DebugCreateLoadout(debugColorIndex).color;
        shcolor = shcolor.scale(.7);
        shmat.diffuseColor = shcolor;
        this.shadow.material = shmat;
    
        Tags.AddTagsTo(this.shadow, GameEntityTags.Shadow);

    }

    

    public clone() : MNetworkPlayerEntity
    {
        let npe = new MNetworkPlayerEntity(this.netId, this.position);
        npe.health = this.health;
        MNetworkPlayerEntity.CloneNonDeltaData(this, npe);
        return npe;
    }

    public static CloneNonDeltaData(from : MNetworkPlayerEntity, to : MNetworkPlayerEntity) : void
    {
        to.projectileHitsOnMe = from.projectileHitsOnMe.slice(0);
        to.shouldDelete = from.shouldDelete;
    }
    
    // JSON.stringify() looks for this method.
    // return the data that should be sent 
    // to replicate this entity (i.e. the sendData).
    public toJSON()
    {
        // maybe not needed: make sure send data matches puppet position
        // if(this.playerPuppet && this.playerPuppet.mesh && this.playerPuppet.mesh.position)
        // {
        //     this.sendData.position.copyFrom(this.playerPuppet.mesh.position);
        //     console.log(`copied pos: ${this.sendData.position}`);
        // }
        // else {
        //     console.log(`pupp type: ${typeof this.playerPuppet} mesh: ${this.playerPuppet.mesh}, mesh pos: ${(this.playerPuppet.mesh ?  this.playerPuppet.mesh.position : 'null' )} `);
        // }

        let sendData = SendDataPlayerEntity.CreateFrom(this.puppet.getInterpData(), this._netId);
        sendData.health = this.health;

        let jObj : any = {'s' : sendData}; 

        if(this.projectileHitsOnMe.length > 0) 
        {
            jObj.hom = this.projectileHitsOnMe; 
        }

        if(this.shouldDelete)
        {
            jObj.x = true;
        }

        if(this.isDelta)
        {
            jObj.d = true;
        }

        return jObj;
    }

    public static deserialize(joData : any) : MNetworkPlayerEntity
    {
        let joSendData = joData.s; 
        let npe = new MNetworkPlayerEntity(joSendData.netId, BHelpers.Vec3FromJSON(joSendData.interpData.position));
        npe.health = joSendData.health;

        // hits on me
        if(joData.hom != undefined)
        {
            console.log(`hits on me: ${JSON.stringify(joData.hom)}`);
            let hits = <Array<MProjectileHitInfo>> joData.hom;
            for(let i=0; i < hits.length; ++i) npe.projectileHitsOnMe.push(MProjectileHitInfo.FromJSON(hits[i]));
        }

        npe.shouldDelete = joData.x != undefined;
        npe.isDelta = joData.d != undefined;
        
        return npe;
    }


    //
    //  Server: clear for example hits on me list
    //
    public clearTransientStates() : void 
    {
        this.projectileHitsOnMe.length = 0;
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
        this.projectileHitsOnMe.push(prjInfo);
        this.playerPuppet.showGettingHit(prjInfo);
        this.health = Math.max(0, this.health - prjInfo.damage);
    }

    
    public teleport(pos : Vector3) : void
    {
        console.log(`teleport : ${pos}`);
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
        if(this.shadow)
            this.shadow.position = pos.clone();
        this.teleport(pos);
    }
    
    
    //TODO: something funky when we apply deltas instead of abs states....
    public apply(update : MNetworkPlayerEntity) : void
    {
        this.shouldDelete = update.shouldDelete;

        this.health = update.health;

         


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

    

    protected applyToPuppet(cliTar : CliTarget, ignoreCollisions ? : boolean)
    {
        if(ignoreCollisions != undefined && ignoreCollisions)
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
    protected getInterpolationData() : OtherPlayerInterpolation
    {
        let opi = new OtherPlayerInterpolation();
        try {
            opi.interpData.position.copyFrom(this.position);
        } catch {
            console.log(`our mesh exists ? ${this.playerPuppet.mesh}`);
        }
        opi.timestamp = +new Date();
        return opi;
    }
    
    public pushInterpolationBuffer(absUpdate: MNetworkPlayerEntity): void 
    {
        this.interpBuffer.push(absUpdate.getInterpolationData());
    } 

    public interpolate(rewindIntervalMillis : number) : void
    {
        let now = +new Date();
        let renderTimestamp = now - rewindIntervalMillis;

        // drop older positions
        while(this.interpBuffer.length >= 2 && this.interpBuffer[1].timestamp <= renderTimestamp) {
            this.interpBuffer.shift();
        }

        if(this.interpBuffer.length >= 2 && this.interpBuffer[0].timestamp <= renderTimestamp && renderTimestamp <= this.interpBuffer[1].timestamp)
        {
            let opi = FromToInterp(this.interpBuffer[0], this.interpBuffer[1], renderTimestamp);

            if(!this.shadow) // DEBUG
            {
                // this.sendData.position = opi.interpData.position;
                let ct = new CliTarget();
                ct.interpData.position.copyFrom(opi.interpData.position);
                this.applyToPuppet(ct, true); 
            } else {
                // this.shadow.position = opi.position; // turn off for now
            }
        }
    }

    //
    // client state changes
    // 
    public pushStateChanges(npe : MNetworkPlayerEntity) : void
    {
        // handle getting hit
        while(npe.projectileHitsOnMe.length > 0)
        {
            this.playerPuppet.showGettingHit(<MProjectileHitInfo>npe.projectileHitsOnMe.shift());
        }
    }



    public minus(other : MNetworkPlayerEntity) : MNetworkPlayerEntity
    {
        let pos = this.position.subtract(other.position);
        let npe = new MNetworkPlayerEntity(this.netId, pos);
        MNetworkPlayerEntity.CloneNonDeltaData(this, npe);
        npe.isDelta = true;
        return npe;
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
        if(this.shadow) this.shadow.dispose();
        this.playerPuppet.destroy();
    }

}