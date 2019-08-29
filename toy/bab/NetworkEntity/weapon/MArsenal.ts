import { MAbstractWeapon, MHandGun } from "./MWeapon";
import { MUtils } from "../../../Util/MUtils";
import { MLoader } from "../../MAssetBook";

export class MArsenal
{
    public readonly weapons : MAbstractWeapon[];
    private index : number = 0;
    
    constructor(
        _weapons : MAbstractWeapon[]
    ) 
    {
        MUtils.Assert(_weapons.length > 0, "need at least one weapon");
        this.weapons = _weapons.slice(0);
    }

    public unshift(mw : MAbstractWeapon) 
    {
        this.weapons.unshift(mw);
    }

    public equipped() : MAbstractWeapon { return this.weapons[this.index]; }

    public setEquipped(idx : number) : void 
    {
        if(idx < 0) return;
        this.index = idx % this.weapons.length;
    }

    public next() : void 
    {
        this.index = (this.index + 1) % this.weapons.length;
    }

    public previous() : void
    {
        this.index = this.index === 0 ? this.weapons.length - 1 : this.index - 1;
    }

    static MakeDefault(assetBook : MLoader.AssetBook) : MArsenal
    {
        //TODO : make a weapon mesh set using asset book

        return new MArsenal([
            MHandGun.CreateHandGun(assetBook),
        ]);
    }


}