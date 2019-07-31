
import * as firebase from 'firebase/app';
import 'firebase/database'
import  *  as initScript from './init';

var firebaseConfig = {
    apiKey: "AIzaSyCR2r5RKhmfc9Lo3gKyUx4Ngy8l1S4rpts",
    authDomain: "webrtcrelay2.firebaseapp.com",
    databaseURL: "https://webrtcrelay2.firebaseio.com",
    projectId: "webrtcrelay2",
    storageBucket: "webrtcrelay2.appspot.com",
    messagingSenderId: "263544194252",
    appId: "1:263544194252:web:c82a1e4fb4adce60"
  };
// Initialize Firebase
firebase.initializeApp(firebaseConfig);



initScript.init();
