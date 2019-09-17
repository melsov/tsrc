import { Animation, AnimationGroup, Scene, Skeleton, Observable, EventState, MeshAssetTask, Nullable } from 'babylonjs';
import { Dictionary } from 'typescript-collections';

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
    ){}
}

//TODO: file spec. map entities to .bab files

export const TestActionSpecs : MActionSpec[] = [
    new MActionSpec(40, 60, "Dane"),
    new MActionSpec(0, 39, "Jump")
];




class MBoneNameAnimPair 
{
    constructor(
        public boneName : string,
        public animation : Animation
    ) {}
}

//
// Maps entity names to animation books
//
export class MAnimLoader
{
    // private readonly books = new Dictionary<string, MRootEntityAnimationBook>();

    // getAnimationBookUnsafe(entityName : string) : MRootEntityAnimationBook  { return <MRootEntityAnimationBook> this.books.getValue(entityName); }

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

    // addToBookWithSkeletons(entityName : string, loadedSkeletons : Skeleton[], actions : MActionSpec[]) : void
    // {
    //     let book = this.books.getValue(entityName);
    //     if(book === undefined) {
    //         book = new MRootEntityAnimationBook();
    //         this.books.setValue(entityName, book);
    //     }

    //     MAnimLoader.AddToBook(book, loadedSkeletons, actions);
    // }
    
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
                            book.addToAction(actions[k].actionName, bone.name, slice);
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
    private readonly actions = new Dictionary<string, MBoneNameAnimPair[]>();

    addToAction(actionName : string, boneName : string, animation : Animation) : void
    {
        let pairs = this.actions.getValue(actionName);
        if(pairs === undefined) {
            pairs = new Array<MBoneNameAnimPair>();
            this.actions.setValue(actionName, pairs);
        }

        if(!animation) { console.warn(`undefined anim for boneName: ${boneName}, actionName: ${actionName}`);}

        pairs.push(new MBoneNameAnimPair(boneName, animation));
    }

    getActionNames() : string[] { return this.actions.keys(); }

    forEach(actionName : string, callback : (boneName : string, anim : Animation) => void) : void 
    {
        let pairs = this.actions.getValue(actionName);
        if(pairs === undefined) { return; }

        for(let i=0; i<pairs.length; ++i) {
            callback(pairs[i].boneName, pairs[i].animation);
        }
    }
}

export class MSkeletonAnimator
{
    // 
    // One skeleton per MAnimator. multiple bones
    // Perhaps we want a method that adds an animation group
    // given a list of ['bone name', animations].
    // thus separating this class's constructor from a particular .bab file.
    // then, as long as separate bab files have the same bone hierarchy,
    // we could handle multiple bab files that should apply to one object 
    // in the game. (This might add some sanity to the blender export process?)
    // 

    //
    // Nonetheless, we also want a way to split the monolithic anim that the blender to bab script
    // produces into separate anims; we want to be able to design all anims for a mesh in one blender file
    // 

    //
    // Want a separate class that stores ['bone name', animations]. Only needs to be one copy of this. (but then would 
    //  animations restart when called by another player? just clone them actually)
    // Then, one MAnimator per mesh instance (e.g. per player / enemy). This class already exists: Bone (or Node)?

    private _actionGroups = new Dictionary<string, AnimationGroup>();

    constructor(
        public readonly scene : Scene,
        public readonly skeleton : Skeleton, 
    ) 
    {
    }
    
    addActionsFromBook(entityAnimationBook : MRootEntityAnimationBook) : void 
    {
        let actionNames = entityAnimationBook.getActionNames();
        let bones = this.skeleton.bones; 

        // Create an animation group for each action name.
        // for each action name
        for(let i=0; i < actionNames.length; ++i)
        {
            // create an animation group
            let ag = new AnimationGroup(actionNames[i], this.scene);

            // get a list of [bone, animation] pairs for this action name. add them to the animation group
            entityAnimationBook.forEach(actionNames[i], (boneName, anim) => {
                let bI = this.skeleton.getBoneIndexByName(boneName);
                if(bI >= 0) {
                    console.log(`anim has keys? ${anim.getKeys().length}`); // if no keys. babjs will throw an error (accessing getKeys()[0])

                    // TODO: verify that we need to clone (we are assuming that multiple AnimGroups referencing the same anim is bad)
                    ag.addTargetedAnimation(anim.clone(), bones[bI]); // clone! 
                }
                else 
                    throw new Error(`bone mismatch. skeleton ${this.skeleton.name} doesn't have bone ${boneName} in animation ${anim.name}. action: ${actionNames[i]}`);   
            });
    
            this._actionGroups.setValue(actionNames[i], ag);
        }
    }

    getAnimationGroup(actionName : string) : AnimationGroup
    {
        return <AnimationGroup> this._actionGroups.getValue(actionName);
    }

    play(actionName : string, loop ? : boolean) : void 
    {
        let grp = this.getAnimationGroup(actionName);
        if(grp === undefined) {
            return;
        }
        this.getAnimationGroup(actionName).play(loop);
    }

    stop(actionName : string) : void 
    {
        let grp = this.getAnimationGroup(actionName);
        if(grp === undefined) {return; }
        grp.stop();
    }

    togglePlay(actionName : string, loop ? : boolean) : void 
    {
        let grp = this.getAnimationGroup(actionName);
        if(grp === undefined) {
            return;
        }
        console.log(`grp undef ? ${grp === undefined}`)
        if(grp.isPlaying) { grp.stop(); }
        else { grp.play(loop); }
    }

    addEndActionCallback(actionName : string, callback : (ag : AnimationGroup, eventState : EventState) => void) : void 
    {
        this.getAnimationGroup(actionName).onAnimationGroupEndObservable.add(callback);
    }
    
    // TODO if we end up needing it: method to add AnimationEvents for a given action.
    // at a given keyframe. AnimationEvents are added to Animations (not Groups).
    // so need a way to choose which anim to add the event to. 
    // tempting to have an option to specify a bone, since that seems like something we'll care about in a callback


}

} // end namespace MAnimator