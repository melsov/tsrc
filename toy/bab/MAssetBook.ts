import { Dictionary } from "typescript-collections";
import { AssetsManager, MeshAssetTask, AbstractAssetTask, Nullable, Engine, Scene, BinaryFileAssetTask } from "babylonjs";
import { TypeOfGame, g_render_canvas_server_id, g_render_canvas_client_id_b, g_render_canvas_client_id_a } from "../GameMain";


export namespace MLoader
{

    export enum MapID
    {
        TheOnlyMap
    }

    export function GetCanvas(typeOfTestGame : TypeOfGame)
    {
        return <HTMLCanvasElement> document.getElementById( typeOfTestGame == TypeOfGame.Server ? g_render_canvas_server_id : 
            (typeOfTestGame == TypeOfGame.ClientA ? g_render_canvas_client_id_a : g_render_canvas_client_id_b));
    }

    export class MapPackage
    {
        public readonly scene : Scene;
        public readonly engine : Engine;
        public readonly canvas : HTMLCanvasElement;
        public readonly assetBook : AssetBook;

        constructor(
            public mapID : MapID,
            public readonly typeOfGame : TypeOfGame, 
        )
        {
            this.canvas = GetCanvas(typeOfGame);
            this.engine = new Engine(this.canvas);
            this.scene = new Scene(this.engine);

            this.assetBook = new AssetBook(this.scene);
        }

        LoadAll(callback : (mapPackage : MapPackage) => void) : void 
        {
            this.assetBook.LoadAll(this.mapID, () => {
                callback(this);
            });
        }
    }

    export class Loadable
    {
        constructor(
            public readonly folder : string,
            public readonly fileName : string
        ) {}

        getKey() : string { return this.fileName; }
    }

    const folderModels : string = "models";
    const folderWeapons : string = `${folderModels}/weapons`;
    export class MeshFiles 
    {
        readonly map : Loadable = new Loadable(folderModels, "relevant.babylon");
        readonly handgun : Loadable = new Loadable(folderWeapons, "handgun.babylon");
    }
    
    export class AudioFiles
    {
        private static _instance : Nullable<AudioFiles> = null;
        static get Instance() : AudioFiles {
            if(!this._instance) { this._instance = new AudioFiles(); }
            return this._instance;
        }

        private static folderAudio : string = "audio";
        readonly dink : Loadable = new Loadable(AudioFiles.folderAudio, "dink.wav");
    }

    function _getLoadablesFrom(mapID : MapID, files : object) : Loadable[]
    {
        let keys = Object.keys(files);
        return keys.map(key => Reflect.get(files, key));
    }
    
    // TODO: mechanism for loading assets per scene
    function Loadables(mapID : MapID) : Loadable[] 
    {
        let result = _getLoadablesFrom(mapID, new MeshFiles());
        result.concat(_getLoadablesFrom(mapID, new AudioFiles()));
        return result;
    } 
    
    export class AssetBook
    {


        static TestAssetManager(scene : Scene, callback : (task : MeshAssetTask) => void) : void
        {
            let am = new AssetsManager(scene);
            let task = am.addMeshTask('test-task', "", "./models/weapons/", "handgun.babylon");

            task.onSuccess = (task : MeshAssetTask) => {
                callback(task);
            }

            am.onFinish = (task : AbstractAssetTask[]) => {
                console.log(`ON FINISH CB`);
            }

            am.load();
        }

        private readonly am : AssetsManager;

        private readonly loadedMeshes : Dictionary<string, MeshAssetTask> = new Dictionary<string, MeshAssetTask>();
        getMeshTask(key : string) : (MeshAssetTask | undefined) { return this.loadedMeshes.getValue(key); }

        private readonly loadedAudio : Dictionary<string, BinaryFileAssetTask> = new Dictionary<string, BinaryFileAssetTask>();
        getAudioTask(key : string) : (BinaryFileAssetTask | undefined) {return this.loadedAudio.getValue(key);}

        constructor(
            private readonly scene : Scene
        ){
            this.am = new AssetsManager(scene);
        }

        LoadAll(mapID : MapID, callback : () => void) : void
        {
            if(this.loadedMeshes.keys().length > 0) {
                console.warn("why call load assets more than once? nothing re-loaded.");
                callback();
                return;
            }

            let meshLoadables = _getLoadablesFrom(mapID, new MeshFiles());
            meshLoadables.forEach((loadable : Loadable) => {
                let task = this.am.addMeshTask(`task-${loadable.fileName}`, "", `${loadable.folder}/`, loadable.fileName);
                this.loadedMeshes.setValue(loadable.getKey(), task);
            });

            let audioLoadables = _getLoadablesFrom(mapID, new AudioFiles());
            audioLoadables.forEach((loadable: Loadable) => {
                let task = this.am.addBinaryFileTask(`task-${loadable.fileName}`, `${loadable.folder}/${loadable.fileName}`);
                this.loadedAudio.setValue(loadable.getKey(), task);
            });

            // TODO: load any textures or other binaries, etc.

            this.am.onProgress = (remaining : number, total : number, task : AbstractAssetTask) => {
                console.log(`percent done: ${remaining/total}. current: ${task.name}`);
            }

            this.am.onFinish = (tasks : AbstractAssetTask[]) => {
                callback();
            }

            this.am.load();
        }

        
    }

}