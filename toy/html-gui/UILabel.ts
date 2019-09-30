import { GUIUtil } from "./GUIUtil";

export class UILabel
{
    readonly labelDiv : HTMLDivElement;

    constructor(
        divId : string,
        color ? : string,
        container ? : string | Node
    ) 
    {
        let _container = undefined;
        if(container) {
            if(typeof container === 'string') {
                _container = <HTMLDivElement> document.getElementById(container);
            } else {
                _container = <Node> container;
            }
        }
        this.labelDiv = GUIUtil.FindOrCreateDiv(divId);
        if(color) { this.labelDiv.style.color = color; }
    }

    set color(c : string) {
        this.labelDiv.style.color = c;
    }    

    get text() : string {
        return this.labelDiv.innerText;
    }

    set text(t : string) {
        this.labelDiv.innerText = t;
    } 

}