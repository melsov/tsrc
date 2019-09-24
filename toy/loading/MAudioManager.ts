import { Sound, Scene, AssetsManager, BinaryFileAssetTask, Vector3, Nullable, TransformNode } from "babylonjs";
import { Dictionary, PriorityQueue } from "typescript-collections";
import { MLoader } from "../bab/MAssetBook";
import { MSoundType } from "../manager/SoundType";

export namespace MAudio
{
    
    
    const MAX_SIMULTANEOUS : number = 3;
                
    class AudioURL
    {
        constructor(
            public soundType : MSoundType.SoundType,
            public assetKey : string
        ){}
    }

    const audioKeys : AudioURL[] = [
        new AudioURL(MSoundType.SoundType.HandGunFire, MLoader.AudioFiles.Instance.dink.getKey()),
        new AudioURL(MSoundType.SoundType.ShotgunReload, MLoader.AudioFiles.Instance.camClick.getKey())
    ]; 


    // class MSound
    // {
    //     constructor(
    //         public readonly soundType : SoundType,
    //         public readonly sound : Sound
    //     ) {}
    // }

    class QueueableSound
    {
        constructor(
            public readonly soundType : MSoundType.SoundType,
            public readonly position : Vector3,
            public readonly referencePosition : Vector3
        ) {}

        distSquared() : number { return this.position.subtract(this.referencePosition).lengthSquared(); }
    }


    export class MAudioManager
    {

        // region instance
        private static _instance : Nullable<MAudioManager> = null;
        static get Instance() : MAudioManager { return <MAudioManager> this._instance; }
        static SetSingleton(am : MAudioManager) : void 
        {
            if(this._instance !== null) { throw new Error('we probably dont want to set the audio manager singleton more than once'); }
            this._instance = am;
        }

        private book  = new Dictionary<MSoundType.SoundType, Sound[]>();
        private queue : PriorityQueue<QueueableSound>;

        private audioEnabled : boolean = false;
        enable(_enable : boolean) : void 
        {
            this.audioEnabled = _enable;
            if(this.audioEnabled) {
                this.setupSoundsWithAssetBook();
                this.makeANoise();
            } 
        }
        
        private makeANoise() : void {
            let dinks = this.book.getValue(MSoundType.SoundType.HandGunFire);
            if(dinks === undefined) throw new Error("help");
            dinks[0].play();
        }

        private setupSoundsWithAssetBook() : void 
        {
            if(this.book.keys().length > 0) { return; } // only once

            audioKeys.forEach((audioURL : AudioURL) => {
                let binTask = this.assetBook.getAudioTask(audioURL.assetKey);
                if(binTask === undefined) {
                    throw new Error(`got an undefined bin task. oh no`);
                }

                let insts = new Array<Sound>();
                for(let i=0; i<MAX_SIMULTANEOUS; ++i) 
                {
                    insts.push(new Sound(`${audioURL.assetKey}-${i}`, binTask.data, this.scene, () => {}, {
                        loop : false,
                        autoPlay : false,
                        spatialSound : true
                    }));
                }
                this.book.setValue(audioURL.soundType, insts);
            });
        }

        constructor(
            private readonly scene : Scene,
            public listener : TransformNode,
            private readonly assetBook : MLoader.AssetBook // TODO: reconfigure files so that we don't need to import MLoader (easy with AudioFiles: just move to its own file)
        ) 
        {
            
            // this.debugPlayBackgroundMusic();

            this.queue = new PriorityQueue<QueueableSound>((a : QueueableSound, b : QueueableSound) => {
                return a.distSquared() < b.distSquared() ? 1 : -1; 
             });

             // this.setupSoundsWithAssetBook();
        }

        // 
        // chrome sometimes requires user's to opt in to audio playback
        // brief gun fire audio does not seem to make the unmute button show up
        private debugPlayBackgroundMusic() : void
        {
            let music = new Sound('bg-music', "./audio/wind-trees.wav", this.scene, () => {
                if(!music.isPlaying)
                    music.play(); 
            }, {
                loop : true,
                autoPlay : true
                
            });

            music.setVolume(.03);
        }

        enqueue(type : MSoundType.SoundType, playPosition : Vector3) : void
        {
            this.queue.enqueue(new QueueableSound(type, playPosition, this.listener.position));
        }

        playAny() : void 
        {
            let i = 0; let j = 0;
            while(!this.queue.isEmpty() && i++ < MAX_SIMULTANEOUS) 
            {
                let _type = this.queue.dequeue();
                if(_type === undefined) { break; }
                let sounds = this.book.getValue(_type.soundType);
                if(sounds === undefined) { continue; }
                
                let allWerePlaying = true;
                for(j = 0; j < sounds.length; ++j) {
                    if(!sounds[j].isPlaying) {
                        sounds[j].setPosition(_type.position);
                        this.Play(sounds[j]);
                        allWerePlaying = false;
                        break;
                    }
                }
                if(allWerePlaying) {
                    sounds[0].stop();
                    this.Play(sounds[0]);
                }
                
            }

            this.queue.clear();
        }

        private Play(s : Sound) : void 
        {
            if(this.audioEnabled) s.play();
        }
    }
}