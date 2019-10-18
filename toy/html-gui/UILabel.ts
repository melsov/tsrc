import { GUIUtil } from "./GUIUtil";

export class UILabel
{
    readonly labelDiv : HTMLDivElement;
    prefixText : string = '';

    constructor(
        divId : string,
        color ? : string,
        container ? : string | Node,
        prefixText ? : string, 
        fontSize ? : string
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
        if(fontSize) { this.labelDiv.style.fontSize = fontSize; }
        if(prefixText) { 
            this.prefixText = prefixText; 
            this.text = "";
        }
    }

    set color(c : string) {
        this.labelDiv.style.color = c;
    }    

    get text() : string {
        return this.labelDiv.innerText.substr(this.prefixText.length);
    }

    set text(t : string) {
        this.labelDiv.innerText = `${this.prefixText}${t}`;
    } 

    set visible(b : boolean) {
        this.labelDiv.style.display = b ? "initial" : "none";
    }

}