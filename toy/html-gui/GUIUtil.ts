
const AppendDefualtDivId = "buttons";

export namespace GUIUtil
{

    export function FindOrCreateDiv(id : string, container ? : Node) : HTMLDivElement
    {
        let result = document.getElementById(id);
        if(result) return <HTMLDivElement>result;
        return CreateDivAppendTo(container, id);
    }

    export function CreateDivAppendToDefault(newDivID ? : string) : HTMLDivElement
    {
        let container = <HTMLDivElement> document.getElementById(AppendDefualtDivId);
        return CreateDivAppendTo(container, newDivID);
    }

    export function CreateDivAppendTo(container ? : Node, newDivID ? : string) : HTMLDivElement
    {
        let div = document.createElement("div");
        if(newDivID) { div.id = newDivID; }
        if(!container) { 
            container = <HTMLDivElement> document.getElementById(AppendDefualtDivId);
        }
        container.appendChild(div);
        return div;
    }
}