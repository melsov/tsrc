import { MSoundType } from "../manager/SoundType";

export class TimelineAudioSpec
{
    constructor(
        public keyName : string,
        public offsetSeconds : number
    ) 
    {}

    static ToTimeLineAudios(timelineAudioSpecs : TimelineAudioSpec[]) : MTimelineAudio[]
    {
        let result : MTimelineAudio[] = [];
        if(timelineAudioSpecs)
            for(let i=0; i<timelineAudioSpecs.length; ++i) {
                result.push(new MTimelineAudio(MSoundType.SoundTypeFromString(timelineAudioSpecs[i].keyName), timelineAudioSpecs[i].offsetSeconds));
            }
        return result;
    }
}

export class MTimelineAudio
{
    constructor(
        public keyName : number, // MAudio.SoundType, // WANT <--can have (MSoundType.SoundType)
        public offsetSeconds : number
    ) 
    {}
}