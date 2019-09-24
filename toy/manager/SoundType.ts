
export namespace MSoundType
{
    export enum SoundType
    {
        HandGunFire, 
        ShotgunReload
    }
 
    export function SoundTypeFromString(audioNameStr : string) : SoundType 
    {
        switch(audioNameStr.toLowerCase()) {
            case "shotgunfire":
            default:
                return SoundType.HandGunFire;
            case "shotgunreload":
                return SoundType.ShotgunReload;
        }    
    }
}