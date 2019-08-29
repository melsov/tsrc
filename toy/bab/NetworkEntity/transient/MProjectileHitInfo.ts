import { Ray, Vector3 } from "babylonjs";
import { MUtils, JHelpers } from "../../../Util/MUtils";
import { BHelpers } from "../../../MBabHelpers";

export enum ProjectileType
{
    GenericLaser
}

//CONSIDER : a parent DamageInfo class
export class MProjectileHitInfo
{
    constructor(
        public readonly sourceNetId : string,
        public readonly projectileType : ProjectileType,
        public readonly ray : Ray,
        public readonly damage : number,
        public readonly hitPoint : Vector3
    ){}

    cloneShallow() : MProjectileHitInfo
    {
        return new MProjectileHitInfo(
            this.sourceNetId, 
            this.projectileType, 
            this.ray, 
            this.damage,
            this.hitPoint);
    }

    public static FromJSON(js : any) : MProjectileHitInfo
    {
        return new MProjectileHitInfo(
            js.sourceNetId,
            js.projectileType,
            JHelpers.RayFromJ(js.ray),
            js.damage,
            BHelpers.Vec3FromJSON(js.hitPoint));
    }
}

