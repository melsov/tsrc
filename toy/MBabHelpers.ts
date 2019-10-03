import { Vector3, Quaternion } from "babylonjs";

export namespace BHelpers
{
    export function Vec3FromJSON(jo : any) : Vector3
    {
        return new Vector3(jo.x, jo.y, jo.z);
    }

    export function Vec3FromPossiblyNull(jo: any) : Vector3 
    {
        if(!jo) { return Vector3.Zero(); }
        return new Vector3(jo.x ? jo.x : 0, jo.y ? jo.y : 0, jo.z ? jo.z : 0);
    }
}