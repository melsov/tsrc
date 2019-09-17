import { Dictionary } from "typescript-collections";
import { MAnimator } from "./MAnimator";
import { AssetsManager, MeshAssetTask, Scene } from "babylonjs";

export const fileSpecFileSrc : string = "./models/BabLoadList.json";


//
// For each entity
//

//
// There's one main .bab file: read the mesh from this.
// This file and possibly other .bab files
// contain skeletons and their bone animations
// All files (per entity) must describe exactly the same skeleton (matching name / hierarchy)

//
// For any bab files (main or not), there should be a list of MActionSpecs.
// There should be at least one action spec per file (otherwise no reason to read the file)
// 
// Why all this? to allow flexibility with blender importing: 
// separate animations/actions per file, separate files applied to a single entity

export class MEntiyBabListLookup
{
    readonly lookup = new Dictionary<string, MEnityBabFileList>();

    static CreateFromSpecPath(specPath : string, scene : Scene, callback : (lookup : MEntiyBabListLookup) => void) : void 
    {
        this.LoadSpecFile(specPath, scene, (specJsonStr) => {
            let lookup = this.CreateLoader(specJsonStr);
            callback(lookup);
        });
    }

    private static CreateLoader(fileSpecJSON : string) : MEntiyBabListLookup
    {
        let loader = new MEntiyBabListLookup();
        let specs = JSON.parse(fileSpecJSON);
        if(specs.entities === undefined) { throw new Error (`???`); }

        let entities =<any[]> specs.entities;
        for(let i=0; i<entities.length; ++i) 
        {

            console.log(`got entity: ${entities[i].name}`);
            if(!entities[i].name || entities[i].name.length === 0) { continue; }

            if(loader.lookup.getValue(entities[i].name)) { throw new Error(`probably don't want to specify an entity twice`); }

            let babFileList = new MEnityBabFileList();
            loader.lookup.setValue(entities[i].name, babFileList);


            let files =<Array<any>> entities[i].files;
            files.forEach((file) => {
                babFileList.files.push(<MBabFile> file);
            });
            
        }


        return loader;
    }

    private static LoadSpecFile(specFilePath : string, scene : Scene, callback : (specJsonStr : string) => void) : void
    {
        let aman = new AssetsManager(scene);
        let task = aman.addTextFileTask('spec-file-task', specFilePath);
        task.onSuccess =(task) => {
            try {
                callback(task.text);
            } catch (err) {
                console.warn(`there was an err: ${err}`);
            }
        };
        task.onError = (task, msg, error) => {
            throw new Error(`failed to load ${specFilePath} : ${msg}. ${error}`);
        };
        aman.load();
    }

}

export class MEnityBabFileList
{
    readonly files = new Array<MBabFile>();

    getMainFile() : MBabFile
    {
        for(let i=0; i<this.files.length; ++i) { 
            if (this.files[i].isMain) 
                return this.files[i]; 
        }
        return this.files[0];
    }

    private forEachNonMainFile(callback : (babFile : MBabFile) => void) : void 
    {
        if(this.files.length <= 1) return;

        for(let i=0; i<this.files.length; ++i) { 
            if (!this.files[i].isMain) 
                callback(this.files[i]);
        }
    }

    iterateMainFirst(callback : (babFile : MBabFile, counter : number) => void) : void
    {
        let index = 0;
        callback(this.getMainFile(), index++);
        this.forEachNonMainFile((babF) => { callback(babF, index++); });
    }
}

export class MBabFile
{   
    isMain : boolean | undefined = undefined;
    path : string = "";
    name : string = "";
    actionSpecs : MAnimator.MActionSpec[] = new Array<MAnimator.MActionSpec>();

    static AddTask(am : AssetsManager, babFile : MBabFile) : MeshAssetTask
    {
        return am.addMeshTask(`task-${babFile}`, null, `${babFile.path}`, babFile.name);
    }
}
