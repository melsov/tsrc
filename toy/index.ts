// // credit: gabriel gambetta listen server design patter

// //
// // NO LONGER THE REAL INDEX!!!
// //

// import * as MServer from './MServer';
// import * as MClient from './MClient';
// // import { Fakebase } from './Fakebase';
// import { MakeLaggyPair } from './LagNetwork';
// import { GameMain } from './GameMain';
// import { tfirebase } from '../MPlayer';


// var _gameMains : Array<GameMain> = new Array<GameMain>();

// var g_mserv = new MServer.MServer();
// g_mserv.begin();

// _gameMains.push(g_mserv.getGameMain());

// function FunUserID() : string
// {
//     let names = ['bob', 'qiyana', 'shaq', 'bubbles', 'terrence', 'jill', 'jelly'];
//     let rand = Math.floor(Math.random() * 10000);
//     let name = names[Math.floor(Math.random() * names.length)];
//     return name + rand;
// }

// function AddAClient()
// {
//     let laggyPair = MakeLaggyPair();
    
//     let fakeUser = new tfirebase.User(FunUserID(), `fake-display-name`, 0); // Fakebase.User(FunUserID());
//     console.log("fakeUser: " + fakeUser.UID);

//     var cli = new MClient.MClient(laggyPair[0], fakeUser);
//     g_mserv.connect(fakeUser, laggyPair[1]);

//     _gameMains.push(cli.game);
//     cli.init();
// }

// AddAClient();
// AddAClient();

// window.addEventListener('keydown', (ev: KeyboardEvent) => {
//     switch(ev.key)
//     {
//         case 'q':
//             _gameMains.forEach((game : GameMain, i : number) => {
//                 game.togglePaused();
//             });
//     }
// });