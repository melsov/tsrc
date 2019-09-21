import { Dictionary } from "typescript-collections";
import { AssetsManager, MeshAssetTask, AbstractAssetTask, Nullable, Engine, Scene, BinaryFileAssetTask } from "babylonjs";
import { TypeOfGame, g_render_canvas_server_id, g_render_canvas_client_id_b, g_render_canvas_client_id_a } from "../GameMain";
import { MAnimator } from "../loading/MAnimator";
import { MEntiyBabListLookup, MEnityBabFileList, MBabFile } from "../loading/MBabFileList";
import { MUtils } from "../Util/MUtils";



export namespace MLoader
{

    const LoaderSpecPath = "./models/specification/LoaderSpec.json";

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

        getKey() : string { 
            // if .babylon file, remove the '.babylon'
            if(this.fileName.indexOf(".babylon") > 0) { 
                return this.fileName.substr(0, this.fileName.length - (".babylon").length);
            }
            return this.fileName; 
        }
    }

    const folderModels : string = "models";
    const folderWeapons : string = `${folderModels}/weapons`;

    export class MeshFiles 
    {
        private static _instance : Nullable<MeshFiles> = null;
        static get Instance() : MeshFiles {
            if (!this._instance) { this._instance = new  MeshFiles(); }
            return this._instance;
        }

        // readonly map : Loadable = new Loadable(folderModels, "relevant.babylon"); // want
        readonly shotgun : Loadable = new Loadable(folderWeapons, "shotgun.babylon");
        readonly player : Loadable = new Loadable(`${folderModels}`, "golf.babylon");
        readonly pillarDebug : Loadable = new Loadable(`${folderModels}`, "pillar.babylon");
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

    // TODO: mechanism for loading assets per scene
    function GetLoadablesFrom(mapID : MapID, files : object) : Loadable[]
    {
        let keys = Object.keys(files);
        return keys.map(key => Reflect.get(files, key));
    }

    // TODO: apropos of nothing: learn to use async/await/promise/then/

    export class LoadedMeshData
    {
        public animationBook : Nullable< MAnimator.MRootEntityAnimationBook> = null;
        constructor(
            public task : MeshAssetTask,
            animationBook ? : MAnimator.MRootEntityAnimationBook
        ){
            if(animationBook) {
                this.animationBook = animationBook;
            }
        }
    }
    
    export class AssetBook
    {
        private readonly am : AssetsManager;

        private readonly loadedMeshes : Dictionary<string, LoadedMeshData> = new Dictionary<string, LoadedMeshData>();
        getMeshTask(key : string) : (LoadedMeshData | undefined) { return this.loadedMeshes.getValue(key); }

        private readonly loadedAudio : Dictionary<string, BinaryFileAssetTask> = new Dictionary<string, BinaryFileAssetTask>();
        getAudioTask(key : string) : (BinaryFileAssetTask | undefined) {return this.loadedAudio.getValue(key);}

        constructor(
            private readonly scene : Scene
        ){
            this.am = new AssetsManager(scene);
        }

        private DebugGetLoadableMeshKeys(mapId : MapID) : string[]
        {
            let mls = GetLoadablesFrom(mapId, new MeshFiles());
            return mls.map((loadable) =>  loadable.getKey() );
        }

        // first load the animation file specs json file (use a separate assetmanager)
        // The file spec file... 
        // describes each entities .bab files (1 or possibly more .bab files though having only 1 is probably better for one's sanity)
        // and for each of these .bab files provides a list of animations/actions.

        // From the file specs file create an MEntityBabListLookup (organizer for these specifications)
        // for each entity name (key) in the lookup
        // add the associated mesh task...
        // 
        // This (at the moment) steps on the toes of meshLoadables.
        // For now...any enity in the MEntityBabListLookup must also have a key in the mesh loadables list 
        // (in other words, the file spec file's entity names must be a subset of the loadable mesh keys.)
        // Why duplicate this list of entities? Because we like having the MeshFiles as a singleton class 
        // (purely for avoiding typos, maybe we're going to far to avoid typos, but really its not so bad to list the entity names twice)
        // 
        // Require that loadable meshes that need skel animations have an entity description 
        // in the json file.
        // Only load the loadable if we didn't already load a mesh for it from the file specs json
        //
        // WHen an skeleton animatable entity needs to come into existence, (in MPlayerAvatar e.g.), make a new MSkeletonAnimator,
        // lookup its anim/bone data from MEnityBabListLookup. add that data to the skeleton animator (addWithBook() or whatever we called it)
        // OKAAAYYYYYY....
        private loadMeshesFromBabList(debugMapId : MapID, onFinished : () => void) : void 
        {
            let debugLoadableKeys = this.DebugGetLoadableMeshKeys(debugMapId);

            MEntiyBabListLookup.CreateFromSpecPath(LoaderSpecPath, this.scene, (specLookup : MEntiyBabListLookup) => {

                // for each files list per entity
                specLookup.lookup.forEach((entityName : string, babList : MEnityBabFileList) => {

                    // the 'main' file is the authority on the entity's mesh. other files might 
                    // use a different mesh (but not a different skeleton).
                    // for the main file: make a new entry in loadedMeshes, including an animationBook.
                    // for each file add a task. onSuccess populate the animation book with animations 
                    // by calling MAnimLoader.AddToBook() 
                    // (this actually slices up the one animation from the .bab file into one animation each per action)
                    babList.iterateMainFirst((babFile : MBabFile, counter : number) => {

                        let meshTask = MBabFile.AddTask(this.am, babFile);
                        if(counter === 0) 
                        {
                            MUtils.Assert(MUtils.StringArrayContains(debugLoadableKeys, entityName), `no entity name: ${entityName} in loadables ${JSON.stringify(debugLoadableKeys)}`);
                            this.loadedMeshes.setValue(entityName, new LoadedMeshData(meshTask, new MAnimator.MRootEntityAnimationBook()));
                        }
                        meshTask.onSuccess = (mTask : MeshAssetTask) => {
                            let meshData = <LoadedMeshData> this.loadedMeshes.getValue(entityName);
                            if(!meshData.animationBook) throw new Error(`wut? no way!`);
                            MAnimator.MAnimLoader.AddToBook(meshData.animationBook, mTask.loadedSkeletons, babFile.actionSpecs);

                        };
                        meshTask.onError = (task : MeshAssetTask, msg ? : string, exception ? : any) => {
                            throw new Error(`error loading ${task.name}. ${msg ? msg : ''} : ${exception ? exception : ''}`);
                        };
                        
                    });
                });

                onFinished();
            });
        }

        LoadAll(mapID : MapID, callback : () => void) : void
        {
            
        

            if(this.loadedMeshes.keys().length > 0) {
                console.warn("why call load assets more than once? nothing re-loaded.");
                callback();
                return;
            }

            this.loadMeshesFromBabList(mapID, () => { 

                let meshLoadables = GetLoadablesFrom(mapID, new MeshFiles());
                meshLoadables.forEach((loadable : Loadable) => {
                    // possibly there are some non animated meshes
                    // not listed in the animation spec LoaderSpec.json 
                    // make sure we load the meshes from the spec file first
                    if(!this.loadedMeshes.getValue(loadable.getKey())) 
                    {
                        console.log(`WILL add a task for loadable key: ${loadable.getKey()}, fileName: ${loadable.fileName}`);
                        let task = this.am.addMeshTask(`task-${loadable.fileName}`, "", `${loadable.folder}/`, loadable.fileName);
                        this.loadedMeshes.setValue(loadable.getKey(), new LoadedMeshData(task) );
                    }
                    else {
                        console.log(`won't add a task for loadable key: ${loadable.getKey()}, fileName: ${loadable.fileName}`);
                    }
                });

                let audioLoadables = GetLoadablesFrom(mapID, new AudioFiles());
                audioLoadables.forEach((loadable: Loadable) => {
                    let task = this.am.addBinaryFileTask(`task-${loadable.fileName}`, `${loadable.folder}/${loadable.fileName}`);
                    this.loadedAudio.setValue(loadable.getKey(), task);
                });
                
                // TODO: load any textures, binaries, etc.
    
                this.am.onProgress = (remaining : number, total : number, task : AbstractAssetTask) => {
                    console.log(`percent done: ${remaining/total}. current: ${task.name}`);
                }
    
                this.am.onFinish = (tasks : AbstractAssetTask[]) => {
                    this.debugTestPlayPillar();
                    callback();
                }
    
                this.am.load();
            });

        }

        private debugTestPlayPillar() : void 
        {
            let pillarData = this.loadedMeshes.getValue(MLoader.MeshFiles.Instance.pillarDebug.getKey());
            MUtils.Assert(pillarData !== undefined, `that's odd`);
            if(pillarData)
            {
                let skelAnimator = new MAnimator.MSkeletonAnimator(this.scene, pillarData.task.loadedSkeletons[0]);
                if(pillarData.animationBook)
                    skelAnimator.addActionsFromBook(pillarData.animationBook);

                skelAnimator.play("Twist", true);
            }
        }

        
    }

}