import { Vector3, Quaternion } from "babylonjs";

export namespace BHelpers
{
    export function Vec3FromJSON(jo : any) : Vector3
    {
        return new Vector3(jo.x, jo.y, jo.z);
    }
}