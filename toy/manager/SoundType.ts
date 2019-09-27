
export namespace MSoundType
{
    export enum SoundType
    {
        HandGunFire, 
        ShotgunReload,
        ShotgunFire
    }
 
    export function SoundTypeFromString(audioNameStr : string) : SoundType 
    {
        switch(audioNameStr.toLowerCase()) {
            case "shotgunfire":
            default:
                return SoundType.ShotgunFire;
            case "shotgunreload":
                return SoundType.ShotgunReload;

        }    
    }
}