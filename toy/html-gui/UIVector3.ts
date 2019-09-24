import { Vector3 } from "babylonjs";

export class UIVector3
{
    readonly container : HTMLElement;
    readonly inputs : HTMLInputElement[];

    doInputChanged : (v : Vector3) => void = (v : Vector3) => {};

    constructor(
        public readonly containerId : string
        // public handleInputChanged : (v : Vector3) => void
    ) 
    {
        let container = document.getElementById(containerId);
        if(!container) {
            container = document.createElement("div");
            container.id = containerId;
            let parDiv = <HTMLDivElement> document.getElementById("buttons");
            parDiv.appendChild(container);
        }
        this.container = container;

        this.inputs =  [];

        for(let i=0; i < 3; ++i) 
        {
            let inp = document.createElement("input");
            this.inputs.push(inp);
            inp.addEventListener("change", () => {
                this.onEdit();
            });
            this.container.appendChild(inp);
        }
    }

    private getValueAt(i : number) : number {
        return parseFloat(this.inputs[i].value);
    }

    private setValueAt(i : number, val : number) : void 
    {
        this.inputs[i].value = `${val}`;
    }

    setValues(v : Vector3) : void 
    {
        this.setValueAt(0, v.x);
        this.setValueAt(1, v.y);
        this.setValueAt(2, v.z);
    }


    get Val() : Vector3 { 
        let v  : number[] = [];
        for(let i=0; i<3; ++i){
            v.push(this.getValueAt(i));
        }
        return new Vector3(v[0], v[1], v[2]);
    }

    private onEdit() : void {
        let next = this.Val;
        this.doInputChanged(next);
        // this.handleInputChanged(this.Val);
    }
}