import { Ray } from "babylonjs";
import { MUtils, JHelpers } from "./Util/MUtils";

export enum ProjectileType
{
    GenericLaser
}

export class MProjectileHitInfo
{
    constructor(
        public readonly sourceNetId : string,
        public readonly projectileType : ProjectileType,
        public readonly ray : Ray,
        public readonly damage : number
    ){}

    cloneShallow() : MProjectileHitInfo
    {
        return new MProjectileHitInfo(
            this.sourceNetId, 
            this.projectileType, 
            this.ray, 
            this.damage);
    }

    public static FromJSON(js : any) : MProjectileHitInfo
    {
        return new MProjectileHitInfo(
            js.sourceNetId,
            js.projectileType,
            JHelpers.RayFromJ(js.ray),
            js.damage);
    }
}