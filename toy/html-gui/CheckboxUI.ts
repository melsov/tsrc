
export class CheckboxUI
{
    protected checkbox : HTMLInputElement;

    constructor(name : string, defaultVal ? : boolean)
    {
        this.checkbox = <HTMLInputElement> document.getElementById(name);
        if(defaultVal != undefined)
        {
            this.checkbox.checked = defaultVal;
        }
        
    }

    get checked() : boolean { return this.checkbox.checked; }
    set checked(isChecked : boolean) { this.checkbox.checked = isChecked; }

}