import { UniversalCamera, Vector3, TransformNode } from "babylonjs";

export class FPSCam
{

    public zoomedOutFOVRadians : number = 1.2;
    public zoomedInFOVRadians : number = .3;
    public offset : Vector3 = Vector3.Zero();

    constructor(
        public readonly cam : UniversalCamera,
        public followTarget : TransformNode
    ){

        this.cam.setTarget(this.cam.position.add(this.followTarget.forward.scale(5)));
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
        this.cam.position = Vector3.Lerp(this.cam.position, this.targetPosition, .5);
    }

    snapToTarget() : void
    {
        this.cam.position = this.targetPosition;
    }

    toggleFOV(shouldZoom : boolean) : void
    {
        this.cam.fov = shouldZoom ?  this.zoomedInFOVRadians : this.zoomedOutFOVRadians;
    }

}