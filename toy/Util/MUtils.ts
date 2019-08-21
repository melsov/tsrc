import { Vector3, Ray, Camera, Matrix, Color3 } from "babylonjs";
import { BHelpers } from "../MBabHelpers";

export namespace MUtils 
{

    const MEU : number = .001;

    // uh oh: circular references not tracked
    //
    // export function DeepCopy(obj : any)
    // {
    //     if(obj == null || typeof(obj) != 'object')
    //     return obj;

    //     var temp = new obj.constructor(); 
    //     for(var key in obj)
    //         temp[key] = DeepCopy(obj[key]);

    //     return temp;
    // }

    export function Assert(theTruth : boolean, err ? : string){
        if(!theTruth) {
            throw new Error(err != undefined ? err : "assertion error");
        }
    }

    export function StringArrayContains(arr : Array<string>, str : string)
    {
        arr.forEach((s : string) => {
            if(s === str) return true;
        })
        return false;
    }

    export function AssertVecNotNan(v : Vector3, err ? : string) { Assert(!VecContainsNan(v), err != undefined ? err : `vec was nan ${v}`); }

    export function VecContainsNan(v : Vector3) : boolean
    {
        return (isNaN(v.x) || isNaN(v.y) || isNaN(v.z));
    }


    export function CopyXZInPlace(to : Vector3, from : Vector3) : void
    {
        to.x = from.x; to.z = from.z;
    }

    //
    // Returns a 'shadow' vector on the plane represented by normal
    // assume normal is normalized
    //
    export function ProjectOnNormal(incoming : Vector3, normal : Vector3) : Vector3
    {
        let nProj = Vector3.Dot(incoming, normal);

        // in = nP + shadow
        return incoming.subtract(normal.scale(nProj));
    }

    export function RayFromTo(from : Vector3, to : Vector3) : Ray
    {
        let dif = to.subtract(from);
        return new Ray(from, dif.normalizeToNew(), dif.length());
    }

    export function IsVerySmall(n : number) : boolean { return Math.abs(n) < MEU; }

    export function roundToPlace(n : number, places ? : number) : number {
        let mult = Math.pow(10, places ? places : 2);
        return Math.round(n * mult) / mult;
    }

    export function RoundedString(n : number, places ? : number) : string 
    {
        return  roundToPlace(n, places).toFixed(places ? places : 2);
    }

    export function RoundVecString(v : Vector3, places ? : number) : string
    {
        return `x: ${RoundedString(v.x, places)}, y: ${RoundedString(v.y, places)}, z: ${RoundedString(v.z, places)}`;
    }

    export function GetMVP(cam : Camera) : Matrix
    {
        return Matrix.GetFinalMatrix(
            cam.viewport,
            cam.getWorldMatrix(),
            cam.getViewMatrix(),
            cam.getProjectionMatrix(),
            cam.minZ,
            cam.maxZ
        );
    }

    export function GetSliderNumber(from : number, to : number, t : number) : number
    {
        if(Math.abs(to - from) < .00001) return 0;
        return (t - from) / (to - from);
    }

    // credit: https://stackoverflow.com/questions/7616461/generate-a-hash-from-string-in-javascript
    export function StringToHash(str : string) : number 
    {
        let hash = 0, i, chr;
        if (str.length === 0) return hash;
        for (i = 0; i < str.length; i++) {
            chr   = str.charCodeAt(i);
            hash  = ((hash << 5) - hash) + chr;
            hash |= 0; // Convert to 32bit integer
        }
        return hash;
    }

    export function Clamp(t : number, min : number, max : number) : number
    {
        return Math.max(min, Math.min(t, max));
    }

    export function Clamp01(t : number) { return Clamp(t, 0, 1); }

    export function RandomBrightColor() : Color3 
    {
        let c = Color3.Random();
        // TODO: use HSV instead
       
        return c;
    }

}

export namespace JHelpers
{
    export function RayFromJ(jray : any) : Ray
    {
        return new Ray(BHelpers.Vec3FromJSON(jray.origin), BHelpers.Vec3FromJSON(jray.direction), jray.length);
    }
}