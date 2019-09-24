import { Animation, AnimationGroup, Scene, Skeleton, Observable, EventState, MeshAssetTask, Nullable, Vector3 } from 'babylonjs';
import { Dictionary } from 'typescript-collections';
import { TimelineAudioSpec } from './InternalAnimator';

export namespace MAnimator
{
//
// Hard to know exact position of meshes because transformations are done
// on the GPU in babylonjs. But we can get the position of bones with any luck...
export class MActionSpec
{
    constructor(
        public fromFrame : number,
        public toFrame : number,
        public actionName : string,
        public timelineAudios : TimelineAudioSpec[]
    ){}
}

class MBoneNameAnimPair 
{
    constructor(
        public boneName : string,
        public animation : Animation
    ) {}
}

//
// Maps entity names to animation books
// 'Static' class
//
export class MAnimLoader
{
    
    //
    // Utility: create a new Animation from a section of an animation defined by key frame bounds. 
    // (Note: fromFrameNumber and toFrameNumber should specify frame numbers not array indices)
    //
    static MakeSlice(animation : Animation, fromFrameNumber : number, toFrameNumber : number) : Nullable<Animation>
    {
        let keys = animation.getKeys();
        if(keys.length === 0) { console.log(`no keys`); return null; }
        if(toFrameNumber < keys[0].frame) { console.log(`bad to frame?`); return null; }
        if(fromFrameNumber > keys[keys.length - 1].frame) { console.log(`bad from frame?`); return null; }

        // find from to indices
        let fromIdx = 0; let toIdx = keys.length - 1;
        while(fromFrameNumber > keys[fromIdx].frame) {
            fromIdx++;
            if(fromIdx >= keys.length) throw new Error(`error retrieving 'from' index for ${animation.name}`);
        }
        while(toFrameNumber < keys[toIdx].frame) {
            toIdx--;
            if(toIdx < 0) throw new Error(`error retrieving 'to' index for ${animation.name}`)
        }

        let clone = animation.clone();
        let keysSlice = keys.slice(fromIdx, toIdx + 1);
        clone.setKeys(keysSlice);
        
        return clone;
    }    

    
    static AddToBook(book : MRootEntityAnimationBook, loadedSkeletons : Skeleton[], actions : MActionSpec[]) : void 
    {
        for(let i=0; i < loadedSkeletons.length; ++i) 
        {
            let skel = loadedSkeletons[i];
            for(let m=0; m < skel.bones.length; ++m) 
            {
                let bone = skel.bones[m];
                for(let j=0; j < bone.animations.length; ++j)  // length is usually one (hence, the need for slices etc.)
                {
                    for(let k=0; k < actions.length; ++k) {
                        let slice = MAnimLoader.MakeSlice(bone.animations[j], actions[k].fromFrame, actions[k].toFrame);
                        if(!slice) { console.log(`slice null: ${bone.name}`); continue; }
                        else {
                            let dbKeys = slice.getKeys();
                            book.addToAction(actions[k], bone.name, slice);
                        }
                    }
                }
            }
        }

    }

}

//
// Per root entity (e.g. skeleton or root transform node) animations
//
export class MRootEntityAnimationBook
{
    private readonly actions = new Dictionary<MActionSpec, MBoneNameAnimPair[]>((actionSpec) => { return actionSpec.actionName; });

    addToAction(actionSpec : MActionSpec, boneName : string, animation : Animation) : void
    {
        let pairs = this.actions.getValue(actionSpec);
        if(pairs === undefined) {
            pairs = new Array<MBoneNameAnimPair>();
            this.actions.setValue(actionSpec, pairs);
        }

        if(!animation) { console.warn(`undefined anim for boneName: ${boneName}, actionName: ${actionSpec}`);}

        pairs.push(new MBoneNameAnimPair(boneName, animation));
    }

    getActionSpecKeys() : MActionSpec[] { return this.actions.keys(); }

    forEach(actionSpec : MActionSpec, callback : (boneName : string, anim : Animation) => void) : void 
    {
        let pairs = this.actions.getValue(actionSpec);
        if(pairs === undefined) { return; }

        for(let i=0; i<pairs.length; ++i) {
            callback(pairs[i].boneName, pairs[i].animation);
        }
    }
}


} // end namespace MAnimator