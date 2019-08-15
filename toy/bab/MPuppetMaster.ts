import { Dictionary } from "typescript-collections";
import { MNetworkEntity, EntityType, CliTarget, InterpData } from "./NetworkEntity/MNetworkEntity";
import { TransformNode, Scene, Engine, Color3, Vector3 } from "babylonjs";
import { MPlayerAvatar } from "./MPlayerAvatar";
import { MUtils } from "../Util/MUtils";



export interface Puppet
{
    applyNetEntityUpdateIngoreCollisions(ent : CliTarget) : void;
    applyNetworkEntityUpdate(ent : CliTarget) : void;
    customize(skin : MLoadOut) : void;

    getInterpData() : InterpData;
    setInterpData(id : InterpData) : void;
}

export class PlaceholderPuppet implements Puppet
{
    applyNetEntityUpdateIngoreCollisions(ent : CliTarget) : void {}
    applyNetworkEntityUpdate(ent: CliTarget): void {  }
    customize(skin: MLoadOut): void { }

    protected interpData : InterpData = new InterpData();
    getInterpData() : InterpData { return this.interpData; }
    setInterpData(id : InterpData) : void { this.interpData.copyFrom(id); }

}

export class MLoadOut
{
    public static GetHash(lo : MLoadOut) { return MUtils.StringToHash(JSON.stringify(lo)); }

    color : Color3 = Color3.Teal();



    public static DebugCreateLoadout(index : number) : MLoadOut
    {
        let loadOut = new MLoadOut();
        switch(index){
            case 0:
                loadOut.color = Color3.Purple();
                break;
            case 1:
                loadOut.color = Color3.Yellow();
                break;

        }
        return loadOut;
    }
}

export class MPuppetMaster
{
    private puppets : Dictionary<string, Puppet> = new Dictionary<string, Puppet>();
    constructor(
        public scene : Scene
    )
    {

    }

    private makePuppet(ent : MNetworkEntity) : Puppet
    {
        switch(ent.entityType)
        {
            case EntityType.PLAYER:
            case undefined:
            default:                
                return new MPlayerAvatar(this.scene, new Vector3(), ent.netId); 
        }
    }

    public getPuppet(ent : MNetworkEntity) : Puppet
    {
        let pup = this.puppets.getValue(ent.netId);
        if(pup == undefined){
            pup = this.makePuppet(ent);
            this.puppets.setValue(ent.netId, pup);
        }
        return pup;
    }

}