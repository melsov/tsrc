import { Vector3, Ray, Camera, Matrix, Color3, Material, Nullable, expandToProperty, AbstractMesh, Scene, TransformNode, Node, Skeleton, Mesh, MeshBuilder } from "babylonjs";
import { BHelpers } from "../MBabHelpers";
import { GridMaterial } from "babylonjs-materials";
import { Set } from "typescript-collections";

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

    export function RandomString(len ? : number) {
        if(len === undefined) len = 10;
        var result           = '';
        var characters       = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        var charactersLength = characters.length;
        for ( var i = 0; i < len; i++ ) {
            result += characters.charAt(Math.floor(Math.random() * charactersLength));
        }
        return result;
    }

    export function RandIntMaxInclusive(max : number) : number 
    {
        max = Math.floor(max);
        return Math.floor(Math.random() * (max + 1)); 
    }

    export function RandIntMaxExclusive(max : number) : number 
    {
        max = Math.floor(max);
        return Math.floor(Math.random() * max);    
    }

    export const Epsilon : number = .0000001;

    export function IsWithinEpsilon(f : number) : boolean 
    {
        return f < Epsilon && f > -Epsilon;
    }

    export function AbsGreaterThanEpsilon(f:number) : boolean 
    {
        return f > Epsilon || f < -Epsilon;    
    }

    export function VecHasNonEpsilon(v:Vector3) : boolean 
    {
        return AbsGreaterThanEpsilon(v.x) || AbsGreaterThanEpsilon(v.y) || AbsGreaterThanEpsilon(v.z);
    }

    export function AssertVecNotNan(v : Vector3, err ? : string) { Assert(!VecContainsNan(v), err != undefined ? err : `vec was nan ${v}`); }

    export function VecContainsNan(v : Vector3) : boolean
    {
        return (isNaN(v.x) || isNaN(v.y) || isNaN(v.z));
    }

    export function RoundToReasonable(f:number) : number {
        return Math.round(f * 300)/300;
    }

    export function RoundVecInPlaceToReasonable(v:Vector3) 
    {
        v.x = RoundToReasonable(v.x);
        v.y = RoundToReasonable(v.y);
        v.z = RoundToReasonable(v.z);
    }

    export function FormatFloat(f:number, places : number) : string {
        return (Math.round(f * Math.pow(10, places))/Math.pow(10, places)).toFixed(places);
    }

    export function FormatVector(v:Vector3, places : number) : string {
        return `[${FormatFloat(v.x, places)},${FormatFloat(v.y, places)},${FormatFloat(v.z,places)}]`;
    }


    export function CopyXZInPlace(to : Vector3, from : Vector3) : void
    {
        to.x = from.x; to.z = from.z;
    }

    export function AddXZInPlace(target : Vector3, increment : Vector3) : void 
    {
        target.x += increment.x; target.z += increment.z;
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

    export function CreateGridMaterial(scene : Scene, mainColor : Color3, lineColor ? : Color3) : GridMaterial
    {
        let result = new GridMaterial('util-grid-mat', scene);
        result.mainColor = mainColor;
        if(lineColor) {
            result.lineColor = lineColor;
        }
        return result;
    }

    export function CreateGridMatSphere(scene : Scene, mainColor : Color3, lineColor ? : Color3, diameter ? : number) : Mesh
    {
        let sphere = MeshBuilder.CreateSphere('util-sphere', {
            diameter : diameter ? diameter : 1
        }, scene);

        sphere.material = CreateGridMaterial(scene, mainColor, lineColor);
        return sphere;
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

    export function SetGridMaterialColor(mat : Nullable<Material>, c : Color3, lineColor ? : Color3) : void 
    {
        if(!mat) return;
        let gmat = <GridMaterial> mat;
        gmat.mainColor = c;
        if(lineColor) gmat.lineColor = lineColor;
    }

    export function StringArrayContains(arr : string[], searchStr : string) : boolean
    {
        for(let i=0; i<arr.length; ++i) { if(arr[i] === searchStr) return true; }
        return false;
    }


    export function RootifiedClone(rootName : string, meshes : AbstractMesh[], scene : Scene, extraProcessing ? : (m : Node, orig : Node) => void) : TransformNode
    {
        let root = new TransformNode(rootName, scene);

        for(let i=0; i < meshes.length; ++i) 
        {
            let mesh = meshes[i];
            if(mesh.parent === null) {
                let clone = mesh.clone(`${mesh.name}`, root);

                // extra processing
                if(extraProcessing && clone) {
                    extraProcessing(clone, mesh);
                    let children = clone.getChildren((n : Node) => { return true}, false);
                    let origChildren = mesh.getChildren((n : Node) => { return true}, false);
                    for(let j=0; j < children.length; ++j) {
                        extraProcessing(children[j], origChildren[j]);
                    }
                }
            }

        }
        return root;
    }

    export function GetAllChildren(node : Node) : Node[]
    {
        // params: filter predicate , only direct children (default true)
        return node.getChildren((n : Node) => { return true; }, false);
    }

    export function GetAllMeshChildren(node : Node) : Mesh[]
    {
        return <Mesh[]> node.getChildren((n : Node) => {
            return n instanceof Mesh;
        }, false);
    }

    export function JSONStringifyDiscardCircular(o:any) : string {
        // Note: cache should not be re-used by repeated calls to JSON.stringify.
        var cache : any = []; 
        let result = JSON.stringify(o, function(key, value) {
            if (typeof value === 'object' && value !== null) { 
                if (cache.indexOf(value) !== -1) {
                    // Duplicate reference found, discard key
                    return;
                }
                // Store value in our collection
                cache.push(value);
            }
            return value;
        });
        cache = null; // Enable garbage collection
        return result;
    }

}

export namespace JHelpers
{
    export function RayFromJ(jray : any) : Ray
    {
        return new Ray(BHelpers.Vec3FromJSON(jray.origin), BHelpers.Vec3FromJSON(jray.direction), jray.length);
    }
}