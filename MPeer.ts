import { ListenServerRoomAgent } from './ListenServerRoomAgent';
import { tfirebase, RemotePlayer } from './MPlayer';
import { Nullable } from 'babylonjs';
import { MClient } from './toy/MClient';
import { MServer } from './toy/MServer';

//
// MLocalPeer glues together a ListenServerRoomAgent
// and an MClient or an MServer
// TODO: be both (i.e. a true listen server)
//
export class MLocalPeer
{

    public readonly lsRoomAgent : ListenServerRoomAgent;
    private client : Nullable<MClient> = null;
    private server : Nullable<MServer> = null;

    constructor(
        room : string,
        user : tfirebase.User,
    )
    {
        this.lsRoomAgent = new ListenServerRoomAgent(room, user, (isServer : boolean) => {
            this.handleOnIsServer(isServer);
        })

        this.lsRoomAgent.init();
    }

    private handleOnIsServer(isServer : boolean)
    {
        console.log(`MPeer handle isServer: ${isServer}`);
        // make a cli or a server.
        // wire up roomAgent callbacks
        // CONSIDER: re-design for less spaghetti?
        if (isServer) 
        {
            this.server = new MServer();

            this.lsRoomAgent.onChannelOpened = (rP : RemotePlayer) => {
                console.log(`MPeer is server inside onCHanOpen callback server null? ${this.server == null} `);
                if(this.server != null)
                    this.server.connect(rP);
            }
            this.lsRoomAgent.onChannelClosed = (rP : RemotePlayer) => {
                if(this.server != null) 
                    this.server.disconnect(rP.user);
            }

            this.server.begin();
            
        } else 
        {
            // set up client
            // TODO: NOT ELSE (unless they want to be a dedicated server)
            //        : actual msg compression / decompression

            console.log(`MPeer is CLIENT inside onCHanOpen callback CLI null? ${this.client == null} `);

            this.lsRoomAgent.onChannelOpened = (serverPeerRP : RemotePlayer) => {
                this.client = new MClient(this.lsRoomAgent.user, (msg : string) => {
                    serverPeerRP.peer.send(msg);
                });

                serverPeerRP.peer.recExtraCallback = (uid : string, e : MessageEvent) => {
                    if(this.client != null)
                        this.client.handleServerMessage(e.data);
                }

                this.client.init();
            }
            this.lsRoomAgent.onChannelClosed = (serverPeerRP : RemotePlayer) => {
                if(this.client != null){
                    this.client.teardown();
                }
            }
           
        }

    }

    public onClose() : void 
    {
        this.lsRoomAgent.onDisconnect();
    }
}
