import { Application } from 'Application'
import { mat4, vec4 } from 'gl-matrix'
import { Button } from 'toad.js/viewkit/Button'

const PAN_STEP = 0.75
const ZOOM_IN_FACTOR = 0.82
const ZOOM_OUT_FACTOR = 1.22
const MIN_ZOOM_DISTANCE = 1.5
const MAX_ZOOM_DISTANCE = 80

function invalidate(app: Application) {
    app.glview.invalidate()
}

function pan(app: Application, x: number, y: number) {
    const camera = app.glview.ctx.camera
    const distance = Math.max(1.5, Math.abs(camera[14]))
    const step = PAN_STEP * Math.max(0.3, distance / 25)

    camera[12] += x * step
    camera[13] += y * step
    invalidate(app)
}

function zoom(app: Application, factor: number) {
    const camera = app.glview.ctx.camera
    const sign = camera[14] <= 0 ? -1 : 1
    const distance = Math.max(
        MIN_ZOOM_DISTANCE,
        Math.min(MAX_ZOOM_DISTANCE, Math.abs(camera[14]) * factor),
    )

    camera[14] = sign * distance
    invalidate(app)
}

function resetView(app: Application) {
    app.glview.ctx.camera = app.bodyCamera()
    invalidate(app)
}

function centerSelected(app: Application) {
    const target = app.glview.selectionCenter()

    // Keep the current view angle and distance, but move the selected point
    // onto the center of the screen.
    const current = app.glview.ctx.camera
    const distance = Math.max(2, Math.abs(current[14]))

    const camera = mat4.clone(current)
    camera[12] = 0
    camera[13] = 0
    camera[14] = 0

    const transformed = vec4.transformMat4(
        vec4.create(),
        vec4.fromValues(target[0], target[1], target[2], 1),
        camera,
    )

    camera[12] = -transformed[0]
    camera[13] = -transformed[1]
    camera[14] = -transformed[2] - distance

    app.glview.ctx.camera = camera
    invalidate(app)
}

export function ViewportControls(props: { app: Application }) {
    const app = props.app

    return (
        <div
            style={{
                position: 'absolute',
                right: '14px',
                top: '14px',
                zIndex: 20,
                padding: '8px',
                borderRadius: '8px',
                background: 'rgba(32, 32, 32, 0.78)',
                backdropFilter: 'blur(4px)',
                display: 'grid',
                gap: '6px',
                pointerEvents: 'auto',
                userSelect: 'none',
            }}
        >
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'center',
                    gap: '6px',
                }}
            >
                <Button action={() => pan(app, 0, -1)}>↑</Button>
            </div>

            <div
                style={{
                    display: 'flex',
                    gap: '6px',
                }}
            >
                <Button action={() => pan(app, -1, 0)}>←</Button>
                <Button action={() => pan(app, 0, 1)}>↓</Button>
                <Button action={() => pan(app, 1, 0)}>→</Button>
            </div>

            <div
                style={{
                    display: 'flex',
                    gap: '6px',
                }}
            >
                <Button action={() => zoom(app, ZOOM_IN_FACTOR)}>＋</Button>
                <Button action={() => zoom(app, ZOOM_OUT_FACTOR)}>−</Button>
            </div>

            <Button action={() => centerSelected(app)}>Center</Button>
            <Button action={() => resetView(app)}>Reset view</Button>
        </div>
    )
}
