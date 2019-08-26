import { MProjectileHitInfo } from "./MProjectileHitInfo";
import { Nullable } from "babylonjs";
import { has } from "typescript-collections/dist/lib/util";

/**
 * Encapsulates events (transient states) to broadcast to clients
 * that should only happen once. 
 * CONSIDER: change name to EventBook?
 * CONSIDER: shouldDelete should not be handled as an event
 */
export class MTransientStateBook
{
    shouldDelete : boolean = false; // e.g. player disconnected
    projectileHitsOnMe : Array<MProjectileHitInfo> = new Array<MProjectileHitInfo>();
    firedWeapon : boolean = false;

    clear() : void 
    {
        this.projectileHitsOnMe.length = 0;
        this.firedWeapon = false;
    }

    clone() : MTransientStateBook
    {
        let cl = new MTransientStateBook();
        cl.projectileHitsOnMe = this.projectileHitsOnMe.slice(0);
        cl.shouldDelete = this.shouldDelete;
        cl.firedWeapon = this.firedWeapon;
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

        if(this.firedWeapon) {
            result.f = true;
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
                
            book.firedWeapon = tsObj.f !== undefined;
            book.shouldDelete = tsObj.x !== undefined;
        }

        return book;
    }
}