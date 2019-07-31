
export class DebugHud
{
    container : HTMLElement;

    constructor(divID : string)
    {
        let _container = <HTMLElement | null> document.getElementById(divID);
        if(_container == null)
        {
            _container = document.createElement("div");
            _container.id = divID;
        } 
        this.container = _container;
    }

    show(str : string) { this.container.innerText = str; }
    append(str : string) { this.container.innerText = `${this.container.innerText} ${str}`; }

}