import { Axis, Vector3 } from "babylonjs";



export class CliCommand
{
    // fwd : boolean = false;
    // back : boolean = false;
    // right : boolean = false;
    // left : boolean = false;
    // fire : boolean = false;
    horizontal : number = 0;
    vertical : number = 0;
    forward : Vector3 = Vector3.Forward();
    fire : boolean = false;
    debugGoWrongPlace : boolean = false;
    
    inputSequenceNumber : number = 0;
    
    lastWorldStateAckPiggyBack : number = 0;
    
    debugPosAfterCommand : Vector3 = Vector3.Zero();
    
    timestamp : number = 0;
    
    get hasAMove() : boolean { return this.horizontal * this.horizontal > 0 || this.vertical * this.vertical > 0 || this.fire; } 
}

class InputKeys
{
    fwd : boolean = false;
    back : boolean = false;
    right : boolean = false;
    left : boolean = false;
    fire : boolean = false;

    debugGoWrongPlace : boolean = false;

    get hasAMove() : boolean { return this.fwd || this.back || this.right || this.left; }

    reset()
    {
        this.fwd = this.back = this.right = this.left = this.fire = false;
    }

    get debugLeftRightOrNothing() : string { return this.left ? "left " : (this.right ? "right" : ""); }
}

const KB_EVENT_TIMEOUT_MILLIS : number = 1500;

const FIRE_RATE_MILLIS : number = 200;

class KeySet
{
    fwd : string = 'w';
    left : string = 'a';
    back : string = 's';
    right : string = 'd';
    fire : string = 'x';
    togglePauseDebug : string = 'q';
    debugGoWrongPlace : string = 'e';
}

function MakeAltKeySet() : KeySet
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

export class MPlayerInput
{
    
    private _commands : InputKeys = new InputKeys();
    
    // get commands() : CliCommand { return this._commands; }
    private lastGetAxesTime : (number | undefined) = undefined;
    private lastKeyboardEventTime : number = 0;

    private keySet : KeySet;
    public getKeySet() : KeySet { return this.keySet; }

    private fireAvailable : boolean = true;

    constructor(useAltKeySet : boolean)
    {
        if(useAltKeySet) this.keySet = MakeAltKeySet();
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
            this._commands.reset();
        }

        cc.horizontal = (this._commands.left ? -1 : (this._commands.right ? 1 : 0)) * dt;
        cc.vertical = (this._commands.back ? -1 : (this._commands.fwd ? 1 : 0)) * dt;
        
        cc.fire = this.fireAvailable && this._commands.fire;
        cc.debugGoWrongPlace = this.fireAvailable && this._commands.debugGoWrongPlace;

        if(cc.fire || cc.debugGoWrongPlace)
        {
            this.fireAvailable = false;
            window.setTimeout(()=> {
                this.fireAvailable = true;
            }, FIRE_RATE_MILLIS);
        }

        
        cc.timestamp = now;

        return cc;
    }


    private handleKeyboardEvent(kev : KeyboardEvent, isDownEvent : boolean)
    {
        this.lastKeyboardEventTime = +new Date();
        switch(kev.key)
        {
            case this.keySet.fwd:
                this._commands.fwd = isDownEvent;
                break;
            case this.keySet.left:
                this._commands.left = isDownEvent;
                break;
            case this.keySet.back:
                this._commands.back = isDownEvent;
                break;
            case this.keySet.right:
                this._commands.right = isDownEvent;
                break;
            case this.keySet.fire:
                if(!kev.repeat || !isDownEvent)
                    this._commands.fire = isDownEvent;
                break;
            case this.keySet.debugGoWrongPlace:
                if(!kev.repeat || !isDownEvent)
                    this._commands.debugGoWrongPlace = isDownEvent;
                break;
        }

    }

}