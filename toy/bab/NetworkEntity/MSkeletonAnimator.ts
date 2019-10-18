import { Animation, AnimationGroup, Scene, Skeleton, Observable, EventState, MeshAssetTask, Nullable, Vector3, TransformNode } from 'babylonjs';
import { Dictionary } from 'typescript-collections';
import { MAnimator } from '../../loading/MAnimator';
import { MTimelineAudio, TimelineAudioSpec } from '../../loading/InternalAnimator';
import { MAudio } from '../../loading/MAudioManager';

export class MAnimAction
{
    public readonly timelineAudios : MTimelineAudio[];
    constructor(
        public animationGroup : AnimationGroup,
        timelineAudios ? : MTimelineAudio[]
    ) {
        this.timelineAudios = timelineAudios ? timelineAudios : [];
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

    private _actionGroups = new Dictionary<string, MAnimAction>(); // AnimationGroup>();

    constructor(
        public readonly scene : Scene,
        public readonly skeleton : Skeleton, 
        public readonly boneRootNode : TransformNode
    ) 
    {
    }
    
    addActionsFromBook(entityAnimationBook : MAnimator.MRootEntityAnimationBook) : void 
    {
        let actionSpecKeys = entityAnimationBook.getActionSpecKeys();
        let bones = this.skeleton.bones; 

        // Create an animation group for each action name.
        // for each action name
        for(let i=0; i < actionSpecKeys.length; ++i)
        {
            // create an animation group
            let ag = new AnimationGroup(actionSpecKeys[i].actionName, this.scene);

            // get a list of [bone, animation] pairs for this action name. add them to the animation group
            entityAnimationBook.forEach(actionSpecKeys[i], (boneName, anim) => {
                let bI = this.skeleton.getBoneIndexByName(boneName);
                if(bI >= 0) {

                    // TODO: verify that we need to clone (we are assuming that multiple AnimGroups referencing the same anim is bad)
                    ag.addTargetedAnimation(anim.clone(), bones[bI]); // clone! 
                }
                else 
                    throw new Error(`bone mismatch. skeleton ${this.skeleton.name} doesn't have bone ${boneName} in animation ${anim.name}. action: ${actionSpecKeys[i]}`);   
            });
    
            this._actionGroups.setValue(actionSpecKeys[i].actionName, new MAnimAction(ag, TimelineAudioSpec.ToTimeLineAudios(actionSpecKeys[i].timelineAudios)));
        }
    } 

    getAnimationGroup(actionName : string) : MAnimAction
    {
        return <MAnimAction> this._actionGroups.getValue(actionName);
    }

    isPlaying(actionName : string) : boolean
    {
        let grp = this.getAnimationGroup(actionName);
        if(grp === undefined) throw new Error(`no anim group for action name: ${actionName}`);
        return grp.animationGroup.isPlaying;
    }

    play(actionName : string, loop ? : boolean) : void 
    {
        let aa = this.getAnimationGroup(actionName);
        if(aa === undefined) {
            return;
        }
        aa.animationGroup.play(loop);

        this.playAudios(aa);
    }

    restart(actionName : string, loop ? : boolean) : void 
    {
        let aa = this.getAnimationGroup(actionName);
        if(!aa) { return; }
        if(aa.animationGroup.isPlaying) { aa.animationGroup.stop(); }
        aa.animationGroup.play();
        this.playAudios(aa);
    }

    playIfNotAlready(actionName : string, loop ? : boolean) : void
    {
        let aa = this.getAnimationGroup(actionName);
        if(aa.animationGroup.isPlaying) { return; }
        aa.animationGroup.play();
        this.playAudios(aa);
    }

    stop(actionName : string) : void 
    {
        let aa = this.getAnimationGroup(actionName);
        if(aa === undefined) {return; }
        aa.animationGroup.stop();
    }

    togglePlay(actionName : string, loop ? : boolean) : void 
    {
        let aa = this.getAnimationGroup(actionName);
        if(aa === undefined) { return; }

        if(aa.animationGroup.isPlaying) { aa.animationGroup.stop(); }
        else { aa.animationGroup.play(loop); }
    }
    
    private playAudios(animAction : MAnimAction) : void 
    {
        //enqueue any audio
        animAction.timelineAudios.forEach((timelineAudio) => {
            // TODO: wait for offset seconds if not zero
             MAudio.MAudioManager.Instance.enqueue(timelineAudio.keyName, this.boneRootNode.position); 
        });
    }

    addEndActionCallback(actionName : string, callback : (ag : AnimationGroup, eventState : EventState) => void) : void 
    {
        this.getAnimationGroup(actionName).animationGroup.onAnimationGroupEndObservable.add(callback);
    }
    
    // TODO if we end up needing it: method to add AnimationEvents for a given action.
    // at a given keyframe. AnimationEvents are added to Animations (not Groups).
    // so need a way to choose which anim to add the event to. 
    // tempting to have an option to specify a bone, since that seems like something we'll care about in a callback


}
