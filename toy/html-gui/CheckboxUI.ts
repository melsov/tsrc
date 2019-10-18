import { GUIUtil } from "./GUIUtil";

export class CheckboxUI
{
    protected checkbox : HTMLInputElement;
    private force : boolean | undefined;

    constructor(name : string, defaultVal ? : boolean, force ? : boolean)
    {
        GUIUtil
        this.checkbox = <HTMLInputElement> document.getElementById(name);
        if(defaultVal !== undefined)
        {
            this.checkbox.checked = defaultVal;
        }

        if(force !== undefined) 
        {
            this.checkbox.checked = force;
            this.checkbox.disabled = true;
        }
        
        this.force = force;
    }

    get checked() : boolean { 
        return this.force ? this.force : this.checkbox.checked; 
    }

    set checked(isChecked : boolean) { 
        this.checkbox.checked = isChecked; 
    }

}