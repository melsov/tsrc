import { UniversalCamera, Vector3, TransformNode, Color3 } from "babylonjs";
import { MUtils } from "../Util/MUtils";

export class FPSCam
{

    public zoomedOutFOVRadians : number = 1.2;
    public zoomedInFOVRadians : number = .3;
    public offset : Vector3 = Vector3.Zero();
    public root : TransformNode;

    constructor(
        public readonly cam : UniversalCamera,
        public followTarget : TransformNode,
        offset ? : Vector3
    ){

        this.cam.setTarget(this.cam.position.add(this.followTarget.forward.scale(5)));
        this.root = new TransformNode("cam-root", this.followTarget.getScene());
        this.root.position.copyFrom(this.cam.position);
        this.root.parent = this.cam;
        if(offset) { this.offset = offset; }
    }

    forward() : Vector3
    {
        return this.cam.getForwardRay().direction;
    }

    rightAlongGround() : Vector3
    {
        return Vector3.Cross(Vector3.Up(), this.forward());
    }

    private get targetPosition() : Vector3 { return this.followTarget.position.add(this.offset); }

    renderTick() : void
    {
        // this.root.position = Vector3.Lerp(this.root.position, this.targetPosition, .5);
        this.cam.position = Vector3.Lerp(this.cam.position, this.targetPosition, .5);
    }

    snapToTarget() : void
    {
        // this.root.position = this.targetPosition;
        this.cam.position = this.targetPosition;
    }

    toggleFOV(shouldZoom : boolean) : void
    {
        this.cam.fov = shouldZoom ?  this.zoomedInFOVRadians : this.zoomedOutFOVRadians;
    }

}