import { Sound, Scene, AssetsManager, BinaryFileAssetTask, Vector3, Nullable, TransformNode } from "babylonjs";
import { Dictionary, PriorityQueue } from "typescript-collections";
import { MLoader } from "../bab/MAssetBook";

export namespace MAudio
{

    const MAX_SIMULTANEOUS : number = 3;

    export enum SoundType
    {
        Fire
    }

    class AudioURL
    {
        constructor(
            public soundType : SoundType,
            public assetKey : string
        ){}
    }

    const audioKeys : AudioURL[] = [
        new AudioURL(SoundType.Fire, MLoader.AudioFiles.Instance.dink.getKey())
    ]; 


    class MSound
    {
        constructor(
            public readonly soundType : SoundType,
            public readonly sound : Sound
        ) {}
    }

    class QueueableSound
    {
        constructor(
            public readonly soundType : SoundType,
            public readonly position : Vector3,
            public readonly referencePosition : Vector3
        ) {}

        distSquared() : number { return this.position.subtract(this.referencePosition).lengthSquared(); }
    }


    export class MAudioManager
    {

        private static _instance : Nullable<MAudioManager> = null;
        static get Instance() : MAudioManager { return <MAudioManager> this._instance; }
        static SetSingleton(am : MAudioManager) : void 
        {
            if(this._instance !== null) { throw new Error('we probably dont want to set the audio manager singleton more than once'); }
            this._instance = am;
        }

        private book : Dictionary<SoundType, Sound[]> = new Dictionary<SoundType, Sound[]>();
        private queue : PriorityQueue<QueueableSound>;

        private setupSoundsWithAssetBook() : void 
        {
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
            private readonly assetBook : MLoader.AssetBook
        )
        {
            
            this.debugPlayBackgroundMusic();

            this.queue = new PriorityQueue<QueueableSound>((a : QueueableSound, b : QueueableSound) => {
                return a.distSquared() < b.distSquared() ? 1 : -1; 
             });

             this.setupSoundsWithAssetBook();

            // audioKeys.forEach((audioURL : AudioURL) => {

            //     // without asset manager
            //     let insts = new Array<Sound>();
            //     for(let i=0; i<MAX_SIMULTANEOUS; ++i) 
            //     {
            //         insts.push(new Sound(`${audioURL.assetKey}-${i}`, audioURL.assetKey, this.scene, () => {}, {
            //             loop : false,
            //             autoPlay : false,
            //             spatialSound : true
            //         }));
            //     }
            //     this.book.setValue(audioURL.soundType, insts);

            //     // // with asset manager
            //     // let task = assetManager.addBinaryFileTask(`load-${audioURL.url}`, audioURL.url);
            //     // // NOTE: onSuccess never executed for us
            //     // task.onSuccess = (task : BinaryFileAssetTask) => {
            //     //     this.dataBook.setValue(audioURL.soundType, task.data);
                    
            //     //     // load all immediately
            //     //     // need MAX_SIMULTANEOUS instances per sound type
            //     //     let insts = new Array<Sound>();
            //     //     for(let i=0; i<MAX_SIMULTANEOUS; ++i) 
            //     //     {
            //     //         insts.push(new Sound(`${audioURL.url}-${i}`, task.data, this.scene, () => {}, {
            //     //             loop : false,
            //     //             autoPlay : false,
            //     //             spatialSound : true
            //     //         }));
            //     //     }
            //     //     console.log(`adding fire sound: ${audioURL.soundType}`);
            //     //     this.book.setValue(audioURL.soundType, insts);
            //     // }

            //     // task.onError = (task : BinaryFileAssetTask, msg ? : string, exception? : any) => {
            //     //     throw new Error(`Load sound ${audioURL.url} failed: ${msg} `);
            //     // }
            // });
 

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

        enqueue(type : SoundType, playPosition : Vector3) : void
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
                        sounds[j].play();
                        allWerePlaying = false;
                        break;
                    }
                }
                if(allWerePlaying) {
                    sounds[0].stop();
                    sounds[0].play();
                }
                
            }

            this.queue.clear();
        }
    }
}