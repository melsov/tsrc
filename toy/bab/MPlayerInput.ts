import { Axis, Vector3, Scene, PickingInfo, PointerEventTypes, Nullable } from "babylonjs";
import { MToggle } from "../helpers/MToggle";
import { MLoadOut } from "./MPuppetMaster";
import { InterpData } from "./NetworkEntity/MNetworkEntity";

export namespace KeyMoves
{
    export enum DownUpHold
    {
        Down = 1, Hold = 2, WentUp = 3, StillUp = 4
    }

    export function IsDown(duh : DownUpHold) : boolean
    {
        return duh <= DownUpHold.Hold;
    }

    export function TransitionWithInput(current : DownUpHold, next : boolean) : DownUpHold
    {
        let result = next ? 
        (current <= DownUpHold.Hold ? DownUpHold.Hold : DownUpHold.Down) : 
        (current <= DownUpHold.Hold ? DownUpHold.WentUp : DownUpHold.StillUp);
        
        if(current <= DownUpHold.WentUp) {
            console.log(`curr: ${current} isDown: ${next} result ${result}`);
        }

        return result;
    }

    export function Transition(current : DownUpHold) : DownUpHold
    {
        return current <= DownUpHold.Hold ? DownUpHold.Hold : DownUpHold.StillUp;
    }
}

export class CliCommand
{
    horizontal : number = 0;
    vertical : number = 0;
    forward : Vector3 = Vector3.Forward();
    rotation : Vector3 = Vector3.Zero();
    claimY : number = 0;
    fire : KeyMoves.DownUpHold = KeyMoves.DownUpHold.StillUp;
    jump : boolean = false;
    debugTriggerKey : boolean = false; 
    
    inputSequenceNumber : number = 0;
    
    lastWorldStateAckPiggyBack : number = 0;
    
    debugPosRoAfterCommand : InterpData = new InterpData();
    
    timestamp : number = 0;

    confirmHashes : Array<number> = new Array<number>();

    loadOutRequest : Nullable<MLoadOut> = null;
    
    get hasAMove() : boolean { return this.horizontal * this.horizontal > 0 || this.vertical * this.vertical > 0 || this.fire > KeyMoves.DownUpHold.WentUp; } 
}
 
class InputKeys
{
    fwd : boolean = false;
    back : boolean = false;
    right : boolean = false;
    left : boolean = false;
    fire : KeyMoves.DownUpHold = KeyMoves.DownUpHold.StillUp;
    jump : boolean = false;

    debugGoWrongPlace : boolean = false;

    get hasAMove() : boolean { return this.fwd || this.back || this.right || this.left; }

    reset()
    {
        this.fwd = this.back = this.right = this.left = this.jump = false;
        //this.fire = KeyMoves.DownUpHold.StillUp;
    }

    get debugLeftRightOrNothing() : string { return this.left ? "left " : (this.right ? "right" : ""); }
}

const KB_EVENT_TIMEOUT_MILLIS : number = 1500;

const DEBUG_TRIGGER_FIRE_RATE : number = 1000; 

class KeySet
{
    fwd : string = 'w';
    left : string = 'a';
    back : string = 's';
    right : string = 'd';
    fire : string = 'x';

    togglePauseDebug : string = 'q';
    debugGoWrongPlace : string = 'e';

    static MakeAltKeySet() : KeySet
    {
        let ks = new KeySet();
        ks.fwd = 't';
        ks.left = 'f';
        ks.back = 'g';
        ks.right = 'h';
        ks.fire = 'b';
        ks.togglePauseDebug = 'r';
        return ks;
    }
}

export class MPlayerInput
{
    
    private _inputKeys : InputKeys = new InputKeys();
    
    // get commands() : CliCommand { return this._commands; }
    private lastGetAxesTime : (number | undefined) = undefined;
    private lastKeyboardEventTime : number = 0;

    private keySet : KeySet;
    public getKeySet() : KeySet { return this.keySet; }

    private debugTriggerReady : boolean = true;
    private isPointerLocked : boolean = false;

    public readonly rightMouseToggle : MToggle = new MToggle(false);

    constructor(useAltKeySet : boolean)
    {
        if(useAltKeySet) this.keySet = KeySet.MakeAltKeySet();
        else this.keySet = new KeySet();
    }

    init(inputFocusElem : Window)
    {
        inputFocusElem.addEventListener('keydown', (kev : KeyboardEvent) => {
            this.handleKeyboardEvent(kev, true);
        });

        inputFocusElem.addEventListener('keyup', (kev : KeyboardEvent) => {
            this.handleKeyboardEvent(kev, false);
        });
    }

    useScene(canvas : HTMLCanvasElement, scene : Scene) : void 
    {
        this.setupPointer(canvas, scene);
    }

    public exitPointerLock(canvas : HTMLCanvasElement, scene : Scene) : void
    {
        scene.onPointerDown = () => {};
        scene.onPointerUp = () => {};

        if(document.exitPointerLock)
            document.exitPointerLock();
    }

    public enterPointerLock(canvas : HTMLCanvasElement, scene : Scene) : void
    {
        scene.onPointerDown = (ev : PointerEvent, pickInfo : PickingInfo, type : PointerEventTypes) => {
            if(!this.isPointerLocked) 
            {
                canvas.requestPointerLock = canvas.requestPointerLock || canvas.msRequestPointerLock || canvas.mozRequestPointerLock || canvas.webkitRequestPointerLock;
                if(canvas.requestPointerLock) {
                    canvas.requestPointerLock();
                }
            } 
            else // if pointer not locked don't fire etc.
            {
                this.handlePointer(true, ev, pickInfo, type);
            }

        };

        scene.onPointerUp = (ev : PointerEvent, pickInfo :  Nullable<PickingInfo>, type : PointerEventTypes) => {
            if(this.isPointerLocked)
                this.handlePointer(false, ev, pickInfo, type);
        }
    }
    
    private setupPointer(canvas : HTMLCanvasElement, scene : Scene) : void 
    {
        
       // this.enterPointerLock(canvas, scene);

        let pointerLockChanged = () => {
            let doc : any = document;
            let controlEnabled = doc.mozPointerLockElement || doc.webkitPointerLockElement || doc.msPointerLockElement || document.pointerLockElement || null;
		
            // If the user is already locked
            if (!controlEnabled) {
                //camera.detachControl(canvas);
                this.isPointerLocked = false;
            } else {
                //camera.attachControl(canvas);
                this.isPointerLocked = true;
            }
        }

        // Attach events to the document
        document.addEventListener("pointerlockchange", pointerLockChanged, false);
        document.addEventListener("mspointerlockchange", pointerLockChanged, false);
        document.addEventListener("mozpointerlockchange", pointerLockChanged, false);
        document.addEventListener("webkitpointerlockchange", pointerLockChanged, false);
    }

    // public next Axes Command ()
    // return a (cloned) object representing time keys held down (axis scalars)
    // plus a sequence number
    
    // it is these that should be applied by the MNetEntity on server or during interpolation
    nextInputAxes() : CliCommand
    {
        // calc time since last call to this func
        let now : number = +new Date();
        let last : number = (this.lastGetAxesTime == undefined) ? now : this.lastGetAxesTime;
        let dt : number = now - last;
        this.lastGetAxesTime = now;

        let cc = new CliCommand();

        // when debugging with multiple canvases
        // we sometimes (seem to) miss key events
        // when canvases loses focus
        if(now - this.lastKeyboardEventTime > KB_EVENT_TIMEOUT_MILLIS) {
            this._inputKeys.reset();
        }

        cc.horizontal = (this._inputKeys.left ? -1 : (this._inputKeys.right ? 1 : 0)) * dt;
        cc.vertical = (this._inputKeys.back ? -1 : (this._inputKeys.fwd ? 1 : 0)) * dt;
        
        cc.fire = this._inputKeys.fire;
        this._inputKeys.fire = KeyMoves.Transition(this._inputKeys.fire); // move to next key state

        cc.debugTriggerKey = this.debugTriggerReady && this._inputKeys.debugGoWrongPlace;

        if(cc.fire || cc.debugTriggerKey)
        {
            this.debugTriggerReady = false;
            window.setTimeout(()=> {
                this.debugTriggerReady = true;
            }, DEBUG_TRIGGER_FIRE_RATE); 
        }

        cc.jump = this._inputKeys.jump;

        cc.timestamp = now;
        return cc;
    }

    private handlePointer(isDown : boolean, ev : PointerEvent, pinfo : Nullable<PickingInfo>, types : PointerEventTypes)
    {

        switch(ev.button)
        {
            case 0: // lmb
                this._inputKeys.fire = KeyMoves.TransitionWithInput(this._inputKeys.fire, isDown); // types === PointerEventTypes.POINTERDOWN);
                // WANT
                // if(types === PointerEventTypes.POINTERDOWN)
                // {
                //     this._inputKeys.fire = true;
                // } // WANT
                break;
            // case 1: // mmb (scroll wheel as a button)
            case 2: // rmb
                if(types === PointerEventTypes.POINTERDOWN)
                    this.rightMouseToggle.value = true;
                else if(types === PointerEventTypes.POINTERUP)
                    this.rightMouseToggle.value = false;
                break;
            default:
                break;
        }
       
    }

    private handleKeyboardEvent(kev : KeyboardEvent, isDownEvent : boolean)
    {
        this.lastKeyboardEventTime = +new Date();
        if(kev.keyCode === 32) 
        {
            this._inputKeys.jump = isDownEvent;
        }
        else {
            switch(kev.key)
            {
                case this.keySet.fwd:
                    this._inputKeys.fwd = isDownEvent;
                    break;
                case this.keySet.left:
                    this._inputKeys.left = isDownEvent;
                    break;
                case this.keySet.back:
                    this._inputKeys.back = isDownEvent;
                    break;
                case this.keySet.right:
                    this._inputKeys.right = isDownEvent;
                    break;
                // case this.keySet.fire:
                //     // if(!kev.repeat) // || !isDownEvent)
                //     this._inputKeys.fire = KeyMoves.Transition(this._inputKeys.fire, isDownEvent);
                //     break;
                case this.keySet.debugGoWrongPlace:
                    if(!kev.repeat || !isDownEvent)
                        this._inputKeys.debugGoWrongPlace = isDownEvent;
                    break;
            }
        }

    }

}