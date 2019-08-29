
class LagMessage {
    recv_ts : number = 0;
    payload : string = "";
}

export const LAG_MS_FAKE = 100;

export class LagNetwork
{
    private messages : Array<LagMessage> = new Array<LagMessage>();

    public send(lag_ms : number, msg : string) : void {
        this.messages.push({
            recv_ts : +new Date() + lag_ms,
            payload : msg 
        });
    }

    public sendJSON(lag_ms : number, msg : object) : void {
        this.send(lag_ms, JSON.stringify(msg));
    }

    public receive() : (string | null)
    {
        let now = +new Date();
        for(let i = 0; i < this.messages.length; ++i){
            let msg = this.messages[i];
            if(msg.recv_ts <= now) {
                this.messages.splice(i,1);
                return msg.payload;
            }
        }
        return null;
    }
}

export class LaggyReceiveChannel
{
    constructor(
        private lagNet : LagNetwork
    ) {}

    public receive() : (string | null) { return this.lagNet.receive(); }
}

export class LaggySendChannel
{
    constructor(
        private lagNet : LagNetwork
    ) {}

    public send(msg : string) : void { this.lagNet.send(LAG_MS_FAKE, msg); }
}

//
// Fake peer connection
//
export class LaggyPeerConnection
{
    constructor(
        public readonly sendChannel : LaggySendChannel,
        public readonly receiveChannel : LaggyReceiveChannel
    ) {}
}

export function MakeLaggyPair() : [LaggyPeerConnection, LaggyPeerConnection]
{
    let a = new LagNetwork(); 
    let b = new LagNetwork();
    let la = new LaggySendChannel(a);
    let lb = new LaggyReceiveChannel(b);
    let lc = new LaggySendChannel(b);
    let ld = new LaggyReceiveChannel(a);

    return [new LaggyPeerConnection(la, lb), new LaggyPeerConnection(lc, ld)];
}