import { Dictionary } from "typescript-collections";
import { AssetsManager, MeshAssetTask, AbstractAssetTask, Nullable, Engine, Scene, BinaryFileAssetTask, AbstractMesh, Texture, TextureAssetTask, BaseTexture, TextFileAssetTask } from "babylonjs";
import { TypeOfGame, g_render_canvas_server_id, g_render_canvas_client_id_b, g_render_canvas_client_id_a } from "../GameMain";
import { MAnimator } from "../loading/MAnimator";
import { MEntiyBabListLookup, MEnityBabFileList, MBabFile } from "../loading/MBabFileList";
import { MUtils } from "../Util/MUtils";
//import { MSkeletonAnimator } from "./NetworkEntity/MSkeletonAnimator";


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
            if(this.fileName.endsWith(".babylon")) { 
                return this.fileName.substr(0, this.fileName.length - (".babylon").length);
            }
            return this.fileName; 
        }
    }

    const folderModels : string = "models";
    const folderWeapons : string = `${folderModels}/weapons`;

    //
    // Unlike the other loadables classes
    // This class just formalizes (intellisense-izes) key names.
    // (Basically just helps us avoid typos.)
    // Declaring a loadable here doesn't cause anything to load
    export class MeshFiles 
    {
        private static _instance : Nullable<MeshFiles> = null;
        static get Instance() : MeshFiles {
            if (!this._instance) { this._instance = new  MeshFiles(); }
            return this._instance;
        }

        // readonly map : Loadable = new Loadable(folderModels, "relevant.babylon"); // want
        readonly shotgun : Loadable = new Loadable(folderWeapons, "shotgun.babylon");
        readonly player : Loadable = new Loadable(`${folderModels}`, "player.babylon");
        // readonly pillarDebug : Loadable = new Loadable(`${folderModels}`, "pillar.babylon");
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
        readonly camClick : Loadable = new Loadable(AudioFiles.folderAudio, "cam-click.wav");
        readonly shotgunShot : Loadable = new Loadable(AudioFiles.folderAudio, "shotgun-shot.wav");
    }

    export class ConfigFiles
    {
        private static _instance : Nullable<ConfigFiles> = null;
        static get Instance() : ConfigFiles {
            if(!this._instance) { this._instance = new ConfigFiles(); }
            return this._instance;
        }

        private static folderConfig : string = "config";
        readonly particleSystemsConfig : Loadable = new Loadable(`${ConfigFiles.folderConfig}`, "particles.json");
    }

    export class ImageFiles
    {
        private static _instance : Nullable<ImageFiles> = null;
        static get Instance() : ImageFiles {
            if(!this._instance) { this._instance = new ImageFiles(); }
            return this._instance;
        }

        private static imageFolder : string = "images";
        readonly puff : Loadable = new Loadable(ImageFiles.imageFolder, "puff.png"); // not in use at the moment
    }

    export class TextureLoader
    {
        private static ListURL : string = "./images/specification/Texture.json";

        private static TextureFromJSON(jTex : any, scene : Scene) : Texture | undefined
        {
            // console.log(`got tex URL: ${jTex.url}. for name: ${jTex.name}`);
            let tex = new Texture(jTex.url, scene);
            tex.name = jTex.name;
            return tex;
        }
        
        static Load(scene : Scene, mapID : MapID, onFinished : (textures : Texture[]) => void) : void 
        {
            let am = new AssetsManager(scene);
            let task = am.addTextFileTask('load-texture-json-task', this.ListURL);
            task.onSuccess = (_task) => {
                let jsonArray : any = JSON.parse(_task.text);
                let textures : Texture[] = [];
                for(let i=0; i<jsonArray.length; ++i)
                {
                    let tex = this.TextureFromJSON(jsonArray[i], scene);
                    if(tex) {
                        textures.push(tex);
                    }
                }

                onFinished(textures);
            };

            task.onError = (_task, msg, exception) => {
                throw new Error(`failed to load textures from: ${this.ListURL}`);
            }

            am.load();
            
        }
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
        public animationBook : Nullable<MAnimator.MRootEntityAnimationBook> = null;

        constructor(
            public task : MeshAssetTask,
            animationBook ? : MAnimator.MRootEntityAnimationBook
        )
        {
            if(animationBook) {
                this.animationBook = animationBook;
            }
        }
    }
    
    export class AssetBook
    {
        private readonly am : AssetsManager;

        private readonly loadedMeshes = new Dictionary<string, LoadedMeshData>();
        getMeshTask(key : string) : (LoadedMeshData | undefined) { return this.loadedMeshes.getValue(key); }

        private readonly loadedAudio = new Dictionary<string, BinaryFileAssetTask>();
        getAudioTask(key : string) : (BinaryFileAssetTask | undefined) { return this.loadedAudio.getValue(key); }
        
        private readonly loadedImages = new Dictionary<string, TextureAssetTask>();
        getImageTask(key : string) : (TextureAssetTask | undefined) { return this.loadedImages.getValue(key); }

        private readonly loadedConfigs = new Dictionary<string, TextFileAssetTask>();
        getConfigTask(key : string) : (TextFileAssetTask | undefined) { return this.loadedConfigs.getValue(key); }

        private readonly textureBook = new Dictionary<string, Texture>();
        getTexture(key : string) : (Texture | undefined) { 
            let tex = this.textureBook.getValue(key);
            if(!tex) {
                let task = this.loadedImages.getValue(key);
                if(!task) { return undefined; }
                tex = new Texture(task.url, this.scene);
                this.textureBook.setValue(key, tex);
            }
            return tex;
        }

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

        private disableMeshes(meshes : AbstractMesh[]) {
            meshes.forEach((m : AbstractMesh) => { m.setEnabled(false);})
        }


        //
        // first load the animation file specs json file (use a separate assetmanager)
        // The file spec file... 
        // describes each entity's .bab files (one or, if it's convenient for some reason, multiple .bab files)
        // and a list of animations/actions per .bab file.

        // From the file specs file, create an MEntityBabListLookup (organizer for these specifications).
        // for each entity name (key) in the lookup,
        // add the associated mesh task...
        // 
        // ANNOYING SIDE NOTE:
            // This (at the moment) sort of steps on the toes of meshLoadables.
            // For now...any enity in the MEntityBabListLookup must also have a key in the mesh loadables list 
            // (in other words, the file spec file's entity names must be a subset of the loadable mesh keys.)
            // Why duplicate this list of entities? Because we like having the MeshFiles as a singleton class 
            // (purely to intellisense-ize the look up keys. maybe we're going a little too far with this.)
        // 
        // loadable meshes that need skeleton animations should have an entry 
        // in the json file.
        //
        // WHen an animatable entity needs to come into existence, (in MPlayerAvatar e.g.), make a new MSkeletonAnimator,
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

        private LoadLoadables(mapID : MapID, callback : () => void) : void 
        {
            // Don't load from mesh loadables.
            // Just include any meshes in LoaderSpec.json
            // MeshFiles class is just helps us avoid typos
            // let meshLoadables = GetLoadablesFrom(mapID, new MeshFiles());
            // meshLoadables.forEach((loadable : Loadable) => {
            //     // possibly there are some non animated meshes
            //     // not listed in the animation spec LoaderSpec.json 
            //     // make sure we load the meshes from the spec file first
            //     if(!this.loadedMeshes.getValue(loadable.getKey())) 
            //     {
            //         console.log(`WILL add a task for loadable key: ${loadable.getKey()}, fileName: ${loadable.fileName}`);
            //         try {
            //             let task = this.am.addMeshTask(`task-${loadable.fileName}`, "", `${loadable.folder}/`, loadable.fileName);
            //             this.loadedMeshes.setValue(loadable.getKey(), new LoadedMeshData(task) );
            //         } catch(err) {
            //             console.warn(`MMP: error while loading ${loadable.fileName}, folder: ${loadable.folder}`);
            //         }
            //     }
            //     else {
            //         console.log(`won't add a task for loadable key: ${loadable.getKey()}, fileName: ${loadable.fileName}`);
            //     }
            // });

            // audio
            let audioLoadables = GetLoadablesFrom(mapID, new AudioFiles());
            audioLoadables.forEach((loadable: Loadable) => {
                let task = this.am.addBinaryFileTask(`task-${loadable.fileName}`, `${loadable.folder}/${loadable.fileName}`);
                this.loadedAudio.setValue(loadable.getKey(), task);
            });
            
            // images
            let imageLoadables = GetLoadablesFrom(mapID, new ImageFiles());
            //console.log(`***LOADABLE IMAGES: ${JSON.stringify(imageLoadables)}`);
            imageLoadables.forEach((loadable : Loadable) => {
                let task = this.am.addTextureTask(`task-${loadable.fileName}`, `${loadable.folder}/${loadable.fileName}`);
                this.loadedImages.setValue(loadable.getKey(), task);
            })

            //config files
            let configLoadables = GetLoadablesFrom(mapID, new ConfigFiles());
            configLoadables.forEach((loadable : Loadable) => {
                let task = this.am.addTextFileTask(`task-${loadable.fileName}`, `${loadable.folder}/${loadable.fileName}`);
                this.loadedConfigs.setValue(loadable.getKey(), task);
            })

            this.am.onProgress = (remaining : number, total : number, task : AbstractAssetTask) => {
                // console.log(`percent done: ${remaining/total}. current: ${task.name}`);
            }

            this.am.onFinish = (tasks : AbstractAssetTask[]) => {
                // this.debugTestPlayPillar();

                tasks.forEach((task : AbstractAssetTask) => {
                    if(task instanceof MeshAssetTask) {
                        this.disableMeshes(task.loadedMeshes);
                    }
                })
                callback();
            }

            this.am.load();
        }

        LoadAll(mapID : MapID, callback : () => void) : void
        {
            if(this.loadedMeshes.keys().length > 0) {
                console.warn("we don't want to load assets more than once. nothing re-loaded.");
                callback();
                return;
            }

            // ugly nested callbacks!
            // load and process files from the list first
            this.loadMeshesFromBabList(mapID, () => { 

                // then load textures from the texture json file
                TextureLoader.Load(this.scene, mapID, (textures) => {
                    
                    textures.forEach((tex : Texture) => {
                        this.textureBook.setValue(tex.name, tex);
                    });

                    // then, load 'loadables'
                    this.LoadLoadables(mapID, callback);
                });
               
            });

        }


        
    }

}