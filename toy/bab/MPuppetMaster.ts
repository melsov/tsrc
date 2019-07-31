import { Dictionary } from "typescript-collections";
import { MNetworkEntity, EntityType } from "./NetworkEntity/MNetworkEntity";
import { TransformNode, Scene, Engine, Color3, Vector3 } from "babylonjs";
import { MPlayerAvatar } from "./MPlayerAvatar";



export interface Puppet
{
    applyNetEntityUpdateIngoreCollisions(ent : MNetworkEntity) : void;
    applyNetworkEntityUpdate(ent : MNetworkEntity) : void;
    customize(skin : MSkin) : void;
}

export class PlaceholderPuppet implements Puppet
{
    applyNetEntityUpdateIngoreCollisions(ent : MNetworkEntity) : void {}
    applyNetworkEntityUpdate(ent: MNetworkEntity): void {  }
    customize(skin: MSkin): void { }
}

export class MSkin
{
    color : Color3 = Color3.Teal();

    public static OrderUpASkin(index : number) : MSkin
    {
        let skin = new MSkin();
        switch(index){
            case 0:
                skin.color = Color3.Purple();
                break;
            case 1:
                skin.color = Color3.Yellow();
                break;

        }
        return skin;
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