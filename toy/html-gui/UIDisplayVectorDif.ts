import { Vector3 } from "babylonjs";
import { GUIUtil } from "./GUIUtil";

export namespace UIDisplayDif
{

    export class UIVec3Display
    {

        public label : string;
        constructor(
            private container : HTMLDivElement, 
           label ? : string
        ) 
        {
            this.label = label ? label : "";
        }

        setWith(v : Vector3) : void
        {
            this.container.innerText = `${this.label}(${v.x}, ${v.y}, ${v.z})`;
        }
    }

    export class UIDisplayVectorDif
    {
        private container : HTMLDivElement;

        private a : UIVec3Display;
        private b : UIVec3Display;
        private difDisplay : UIVec3Display;

        constructor(
            containerID : string, 
            title ? : string,
            labelA ? : string,
            labelB ? : string
        ) 
        {
            this.container = GUIUtil.FindOrCreateDiv(containerID);

            if(!title) title = containerID;

            let titleDiv = GUIUtil.CreateDivAppendTo(this.container);
            titleDiv.innerText = title;

            let adiv = GUIUtil.CreateDivAppendTo(this.container);
            let bdiv = GUIUtil.CreateDivAppendTo(this.container);
            let vdiv = GUIUtil.CreateDivAppendTo(this.container);

            this.a = new UIVec3Display(adiv, labelA);
            this.b = new UIVec3Display(bdiv, labelB);
            this.difDisplay = new UIVec3Display(vdiv, "dif");
        }

        update(_a : Vector3, _b : Vector3) : void 
        {
            this.a.setWith(_a);
            this.b.setWith(_b);
            this.difDisplay.setWith(_b.subtract(_a));
        }

    }
}