import { mat4, vec3 } from 'gl-matrix'
import { Projection } from "../Projection"
import { type GLView } from "../GLView"
import { FlyMode } from './FlyMode'
import { InputHandler } from './InputHandler'
import { MouseButton } from './MouseButton'
import { deg2rad } from 'gl/algorithms/deg2rad'

interface Point {
    x: number
    y: number
}

type DragMode = 'orbit' | 'pan'

const MIN_ZOOM_DISTANCE = 1.5
const MAX_ZOOM_DISTANCE = 80
const WHEEL_ZOOM_SPEED = 0.0015

export class BasicMode extends InputHandler {
    private _view: GLView
    private _down: Point | undefined
    private _camera: mat4 | undefined
    private _center: vec3 | undefined
    private _dragMode: DragMode = 'orbit'

    private _wheel = (ev: WheelEvent) => {
        ev.preventDefault()

        const camera = this._view.ctx.camera
        const currentZ = camera[14]

        // Mouse-wheel zoom is exponential so it remains useful both in the
        // full-body view and when zoomed tightly onto a hand.
        const factor = Math.exp(ev.deltaY * WHEEL_ZOOM_SPEED)
        const sign = currentZ <= 0 ? -1 : 1
        const distance = Math.max(
            MIN_ZOOM_DISTANCE,
            Math.min(MAX_ZOOM_DISTANCE, Math.abs(currentZ) * factor),
        )

        camera[14] = sign * distance
        this._view.invalidate()
    }

    constructor(view: GLView) {
        super()
        this._view = view

        // Direct wheel handling keeps this change local to BasicMode rather
        // than requiring a new wheel event throughout the whole input stack.
        this._view.canvas.addEventListener('wheel', this._wheel, {
            passive: false,
        })
    }

    override destructor(): void {
        this._view.canvas.removeEventListener('wheel', this._wheel)
    }

    override info() {
        return "Viewport: middle-drag orbit, Shift+middle-drag pan, wheel zoom"
    }

    override keydown(ev: KeyboardEvent): void {
        const ctx = this._view.ctx
        switch (ev.code) {
            case 'Numpad1':
                if (ev.ctrlKey) {
                    ctx.rotateCameraTo(0, 180, 0)
                } else {
                    ctx.rotateCameraTo(0, 0, 0)
                }
                ctx.projection = Projection.ORTHOGONAL
                this._view.invalidate()
                break
            case 'Numpad7':
                if (ev.ctrlKey) {
                    ctx.rotateCameraTo(-90, 0, 0)
                } else {
                    ctx.rotateCameraTo(90, 0, 0)
                }
                ctx.projection = Projection.ORTHOGONAL
                this._view.invalidate()
                break
            case 'Numpad3':
                if (ev.ctrlKey) {
                    ctx.rotateCameraTo(0, 90, 0)
                } else {
                    ctx.rotateCameraTo(0, -90, 0)
                }
                ctx.projection = Projection.ORTHOGONAL
                this._view.invalidate()
                break
            case 'Numpad4':
                mat4.rotateY(ctx.camera, ctx.camera, deg2rad(11.25))
                this._view.invalidate()
                break
            case 'Numpad6':
                mat4.rotateY(ctx.camera, ctx.camera, deg2rad(-11.25))
                this._view.invalidate()
                break
            case 'Numpad8':
                mat4.rotateX(ctx.camera, ctx.camera, deg2rad(11.25))
                this._view.invalidate()
                break
            case 'Numpad2':
                mat4.rotateX(ctx.camera, ctx.camera, deg2rad(-11.25))
                this._view.invalidate()
                break
            case 'Numpad5':
                ctx.projection =
                    ctx.projection === Projection.ORTHOGONAL
                        ? Projection.PERSPECTIVE
                        : Projection.ORTHOGONAL
                this._view.invalidate()
                break
            case 'Numpad0': {
                const defaultCamera = this._view.ctx.defaultCamera?.()
                if (defaultCamera) {
                    mat4.copy(this._view.ctx.camera, defaultCamera)
                    this._view.invalidate()
                }
                break
            }
            case 'Backquote':
                if (ev.shiftKey) {
                    this._view.pushInputHandler(new FlyMode(this._view))
                }
                break
        }
    }

    override pointerdown(ev: PointerEvent): void {
        if (ev.button !== MouseButton.MIDDLE) {
            return
        }

        this._view.canvas.setPointerCapture(ev.pointerId)
        this._down = { x: ev.x, y: ev.y }
        this._camera = mat4.clone(this._view.ctx.camera)
        this._center = this._view.selectionCenter()
        this._dragMode = ev.shiftKey ? 'pan' : 'orbit'
        ev.preventDefault()
    }

    override pointermove(ev: PointerEvent): void {
        if (this._down === undefined || this._camera === undefined) {
            return
        }
        ev.preventDefault()

        const x = ev.x - this._down.x
        const y = ev.y - this._down.y

        if (this._dragMode === 'pan') {
            // Pan directly in camera/screen X/Y. Scale it with viewing
            // distance so panning feels similar at body and hand zoom levels.
            const distance = Math.max(
                MIN_ZOOM_DISTANCE,
                Math.abs(this._camera[14]),
            )
            const height = Math.max(300, this._view.canvas.clientHeight)
            const scale = (distance / height) * 1.35

            mat4.copy(this._view.ctx.camera, this._camera)
            this._view.ctx.camera[12] = this._camera[12] + x * scale
            this._view.ctx.camera[13] = this._camera[13] - y * scale

            this._view.invalidate()
            return
        }

        const cameraRotation = mat4.clone(this._camera)
        cameraRotation[12] = cameraRotation[13] = cameraRotation[14] = 0
        const invCameraRotation = mat4.invert(
            mat4.create(),
            cameraRotation,
        )!

        const moveToRotationCenter = mat4.create()
        mat4.translate(
            moveToRotationCenter,
            moveToRotationCenter,
            this._center!,
        )

        const backFromRotationCenter = mat4.invert(
            mat4.create(),
            moveToRotationCenter,
        )!

        const m = mat4.create()
        mat4.mul(m, m, moveToRotationCenter)
        mat4.mul(m, m, invCameraRotation)
        mat4.rotateX(m, m, deg2rad(y))
        mat4.mul(m, m, cameraRotation)
        mat4.rotateY(m, m, deg2rad(x))
        mat4.mul(m, m, backFromRotationCenter)

        mat4.mul(this._view.ctx.camera, this._camera, m)
        this._view.invalidate()
    }

    override pointerup(ev: PointerEvent): void {
        if (this._down === undefined) {
            return
        }

        ev.preventDefault()
        this._down = undefined
        this._camera = undefined
        this._center = undefined
    }
}
