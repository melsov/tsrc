import { MProjectileHitInfo } from "./MProjectileHitInfo";
import { Nullable } from "babylonjs";
import { has } from "typescript-collections/dist/lib/util";


export class MTransientStateBook
{
    shouldDelete : boolean = false;
    projectileHitsOnMe : Array<MProjectileHitInfo> = new Array<MProjectileHitInfo>();


    clear() : void 
    {
        this.projectileHitsOnMe.length = 0;
    }

    clone() : MTransientStateBook
    {
        let cl = new MTransientStateBook();
        cl.projectileHitsOnMe = this.projectileHitsOnMe.slice(0);
        cl.shouldDelete = this.shouldDelete;
        return cl;
    }

    private asObject() : Nullable<object>
    {
        let result : any = {};
        let hasData = false;

        if(this.shouldDelete) {
            result.x = true;
            hasData = true;
        }

        if(this.projectileHitsOnMe.length > 0) {
            result.hom = this.projectileHitsOnMe.slice(0);
            hasData = true;
        }

        if(!hasData) { return null; }

        return result;
    }

    addToObject(jOb : any) : void
    {
        let book = this.asObject();
        if(book === null) return;
        jOb.tr = book;
    }

    static ExtractFromObject(jOb : any) : MTransientStateBook
    {
        let book = new MTransientStateBook();

        let tsObj = jOb.tr;
        if(tsObj !== undefined) 
        {
            if(tsObj.hom !== undefined) {
                let hits = <Array<MProjectileHitInfo>> tsObj.hom;
                for(let i=0; i < hits.length; ++i) book.projectileHitsOnMe.push(MProjectileHitInfo.FromJSON(hits[i]));
            }
                
            
            book.shouldDelete = tsObj.x !== undefined;
        }

        return book;
    }
}