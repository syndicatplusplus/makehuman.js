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
type TouchMode = 'orbit' | 'panzoom'

const MIN_ZOOM_DISTANCE = 1.5
const MAX_ZOOM_DISTANCE = 80
const WHEEL_ZOOM_SPEED = 0.0015
const TOUCH_ORBIT_THRESHOLD = 8
const TOUCH_ORBIT_DEGREES_PER_PIXEL = 0.35

function distance(a: Point, b: Point): number {
    return Math.hypot(b.x - a.x, b.y - a.y)
}

function midpoint(a: Point, b: Point): Point {
    return {
        x: (a.x + b.x) / 2,
        y: (a.y + b.y) / 2,
    }
}

export class BasicMode extends InputHandler {
    private _view: GLView

    // Mouse navigation.
    private _down: Point | undefined
    private _camera: mat4 | undefined
    private _center: vec3 | undefined
    private _dragMode: DragMode = 'orbit'

    // Touch navigation.
    private _touches = new Map<number, Point>()
    private _touchMode: TouchMode | undefined
    private _touchCamera: mat4 | undefined
    private _touchCenter: vec3 | undefined
    private _touchStartPoint: Point | undefined
    private _touchStartMidpoint: Point | undefined
    private _touchStartDistance = 0

    private _wheel = (ev: WheelEvent) => {
        ev.preventDefault()

        const camera = this._view.ctx.camera
        const currentZ = camera[14]

        const factor = Math.exp(ev.deltaY * WHEEL_ZOOM_SPEED)
        const sign = currentZ <= 0 ? -1 : 1
        const zoomDistance = Math.max(
            MIN_ZOOM_DISTANCE,
            Math.min(MAX_ZOOM_DISTANCE, Math.abs(currentZ) * factor),
        )

        camera[14] = sign * zoomDistance
        this._view.invalidate()
    }

    constructor(view: GLView) {
        super()
        this._view = view

        this._view.canvas.addEventListener('wheel', this._wheel, {
            passive: false,
        })

        // Safari/iPad should leave canvas gestures to us rather than turning
        // them into page scrolling or browser zoom.
        this._view.canvas.style.touchAction = 'none'
    }

    override destructor(): void {
        this._view.canvas.removeEventListener('wheel', this._wheel)
        this.resetTouchState()
        this.resetMouseState()
    }

    override info() {
        return 'Viewport: drag orbit; two-finger drag pan; pinch zoom'
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

    private resetMouseState() {
        this._down = undefined
        this._camera = undefined
        this._center = undefined
        this._dragMode = 'orbit'
    }

    private resetTouchState() {
        this._touches.clear()
        this._touchMode = undefined
        this._touchCamera = undefined
        this._touchCenter = undefined
        this._touchStartPoint = undefined
        this._touchStartMidpoint = undefined
        this._touchStartDistance = 0
    }

    private restartTouchGestureAfterPointerEnds() {
        if (this._touches.size >= 2) {
            this.beginTwoFingerTouch()
            return
        }

        if (this._touches.size === 1) {
            const remaining =
                this._touches.values().next().value as Point
            this.beginSingleTouch(remaining)
            return
        }

        this.resetTouchState()
    }

    private releasePointerCapture(pointerId: number) {
        if (this._view.canvas.hasPointerCapture(pointerId)) {
            this._view.canvas.releasePointerCapture(pointerId)
        }
    }

    private applyOrbit(
        startCamera: mat4,
        center: vec3,
        xDegrees: number,
        yDegrees: number,
    ) {
        const cameraRotation = mat4.clone(startCamera)
        cameraRotation[12] = cameraRotation[13] = cameraRotation[14] = 0

        const invCameraRotation = mat4.invert(
            mat4.create(),
            cameraRotation,
        )!

        const moveToRotationCenter = mat4.create()
        mat4.translate(
            moveToRotationCenter,
            moveToRotationCenter,
            center,
        )

        const backFromRotationCenter = mat4.invert(
            mat4.create(),
            moveToRotationCenter,
        )!

        const m = mat4.create()
        mat4.mul(m, m, moveToRotationCenter)
        mat4.mul(m, m, invCameraRotation)
        mat4.rotateX(m, m, deg2rad(yDegrees))
        mat4.mul(m, m, cameraRotation)
        mat4.rotateY(m, m, deg2rad(xDegrees))
        mat4.mul(m, m, backFromRotationCenter)

        mat4.mul(this._view.ctx.camera, startCamera, m)
        this._view.invalidate()
    }

    private beginSingleTouch(point: Point) {
        this._touchMode = 'orbit'
        this._touchStartPoint = { ...point }
        this._touchCamera = mat4.clone(this._view.ctx.camera)
        this._touchCenter = this._view.selectionCenter()
        this._touchStartMidpoint = undefined
        this._touchStartDistance = 0
    }

    private beginTwoFingerTouch() {
        const points = Array.from(this._touches.values())
        if (points.length < 2) {
            return
        }

        const a = points[0]!
        const b = points[1]!

        this._touchMode = 'panzoom'
        this._touchCamera = mat4.clone(this._view.ctx.camera)
        this._touchStartMidpoint = midpoint(a, b)
        this._touchStartDistance = Math.max(1, distance(a, b))
        this._touchStartPoint = undefined
        this._touchCenter = undefined
    }

    override pointerdown(ev: PointerEvent): void {
        if (ev.pointerType === 'touch') {
            const point = { x: ev.clientX, y: ev.clientY }

            this._view.canvas.setPointerCapture(ev.pointerId)
            this._touches.set(ev.pointerId, point)

            if (this._touches.size >= 2) {
                this.beginTwoFingerTouch()
            } else {
                this.beginSingleTouch(point)
            }

            ev.preventDefault()
            return
        }

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
        if (
            ev.pointerType === 'touch' &&
            this._touches.has(ev.pointerId)
        ) {
            this._touches.set(ev.pointerId, {
                x: ev.clientX,
                y: ev.clientY,
            })

            if (
                this._touches.size >= 2 &&
                this._touchCamera !== undefined &&
                this._touchStartMidpoint !== undefined
            ) {
                const points = Array.from(this._touches.values())
                const a = points[0]!
                const b = points[1]!
                const currentMidpoint = midpoint(a, b)
                const currentDistance = Math.max(1, distance(a, b))

                const dx =
                    currentMidpoint.x - this._touchStartMidpoint.x
                const dy =
                    currentMidpoint.y - this._touchStartMidpoint.y

                const startCamera = this._touchCamera
                const viewDistance = Math.max(
                    MIN_ZOOM_DISTANCE,
                    Math.abs(startCamera[14]),
                )
                const height = Math.max(
                    300,
                    this._view.canvas.clientHeight,
                )
                const panScale = (viewDistance / height) * 1.35

                mat4.copy(this._view.ctx.camera, startCamera)
                this._view.ctx.camera[12] =
                    startCamera[12] + dx * panScale
                this._view.ctx.camera[13] =
                    startCamera[13] - dy * panScale

                const factor =
                    this._touchStartDistance / currentDistance
                const sign = startCamera[14] <= 0 ? -1 : 1
                const zoomDistance = Math.max(
                    MIN_ZOOM_DISTANCE,
                    Math.min(
                        MAX_ZOOM_DISTANCE,
                        Math.abs(startCamera[14]) * factor,
                    ),
                )

                this._view.ctx.camera[14] = sign * zoomDistance
                this._view.invalidate()

                ev.preventDefault()
                return
            }

            if (
                this._touches.size === 1 &&
                this._touchMode === 'orbit' &&
                this._touchCamera !== undefined &&
                this._touchCenter !== undefined &&
                this._touchStartPoint !== undefined
            ) {
                const point = this._touches.values().next().value as Point
                const dx = point.x - this._touchStartPoint.x
                const dy = point.y - this._touchStartPoint.y

                if (Math.hypot(dx, dy) >= TOUCH_ORBIT_THRESHOLD) {
                    this.applyOrbit(
                        this._touchCamera,
                        this._touchCenter,
                        dx * TOUCH_ORBIT_DEGREES_PER_PIXEL,
                        dy * TOUCH_ORBIT_DEGREES_PER_PIXEL,
                    )
                }

                ev.preventDefault()
                return
            }

            return
        }

        if (this._down === undefined || this._camera === undefined) {
            return
        }

        ev.preventDefault()

        const x = ev.x - this._down.x
        const y = ev.y - this._down.y

        if (this._dragMode === 'pan') {
            const viewDistance = Math.max(
                MIN_ZOOM_DISTANCE,
                Math.abs(this._camera[14]),
            )
            const height = Math.max(300, this._view.canvas.clientHeight)
            const scale = (viewDistance / height) * 1.35

            mat4.copy(this._view.ctx.camera, this._camera)
            this._view.ctx.camera[12] = this._camera[12] + x * scale
            this._view.ctx.camera[13] = this._camera[13] - y * scale

            this._view.invalidate()
            return
        }

        this.applyOrbit(
            this._camera,
            this._center!,
            x,
            y,
        )
    }

    override pointerup(ev: PointerEvent): void {
        if (
            ev.pointerType === 'touch' &&
            this._touches.has(ev.pointerId)
        ) {
            this._touches.delete(ev.pointerId)
            this.releasePointerCapture(ev.pointerId)
            this.restartTouchGestureAfterPointerEnds()

            ev.preventDefault()
            return
        }

        if (this._down === undefined) {
            return
        }

        this.releasePointerCapture(ev.pointerId)
        this.resetMouseState()
        ev.preventDefault()
    }

    override pointercancel(ev: PointerEvent): void {
        if (ev.pointerType === 'touch') {
            // iPadOS may cancel a finger pointer while the input source
            // changes. Remove it immediately so it cannot remain as a
            // ghost second finger and force later gestures into pan mode.
            this._touches.delete(ev.pointerId)
            this.restartTouchGestureAfterPointerEnds()
            return
        }

        this.resetMouseState()
    }
}
