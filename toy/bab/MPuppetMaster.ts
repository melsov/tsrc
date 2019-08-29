import { Dictionary } from "typescript-collections";
import { MNetworkEntity, EntityType, CliTarget, InterpData } from "./NetworkEntity/MNetworkEntity";
import { TransformNode, Scene, Engine, Color3, Vector3 } from "babylonjs";
import { MPlayerAvatar } from "./MPlayerAvatar";
import { MUtils } from "../Util/MUtils";
import { MLoader } from "./MAssetBook";



export interface Puppet
{
    applyNetEntityUpdateIngoreCollisions(ent : CliTarget) : void;
    applyNetworkEntityUpdate(ent : CliTarget) : void;
    customize(skin : MLoadOut) : void;

    getInterpData() : InterpData;
    setInterpData(id : InterpData) : void;
    getBoundsCorners() : Vector3[];
}

export class PlaceholderPuppet implements Puppet
{
    getBoundsCorners(): Vector3[] {
        let corners = new Array<Vector3>();
        let position = this.interpData.position;
        let ellipsoid = Vector3.One();
        corners.push(position.clone());
        corners.push(position.add(ellipsoid.scale(.4)));
        corners.push(position.add(ellipsoid.scale(-.4)));
        return corners;
    }
    
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

    color : Color3 = Color3.Blue();

    public static DebugCreateLoadout(index : number) : MLoadOut
    {
        let loadOut = new MLoadOut();
        loadOut.color = MUtils.RandomBrightColor();
        // switch(index){
        //     case 0:
        //         loadOut.color = Color3.Purple();
        //         break;
        //     case 1:
        //         loadOut.color = Color3.Yellow();
        //         break;

        // }
        return loadOut;
    }
}

export class MPuppetMaster
{
    private puppets : Dictionary<string, Puppet> = new Dictionary<string, Puppet>();
    constructor(
        //public scene : Scene,
        public readonly mapPackage : MLoader.MapPackage
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
                return new MPlayerAvatar(this.mapPackage.scene, new Vector3(), ent.netId, this.mapPackage.assetBook); 
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