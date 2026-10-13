import { Application } from 'Application'
import { mat4, vec4 } from 'gl-matrix'
import { RenderXBot } from 'render/RenderXBot'
import { NumberModel } from 'toad.js/appkit/NumberModel'
import { OptionModel } from 'toad.js/appkit/OptionModel'
import { Button } from 'toad.js/viewkit/Button'
import { Select } from 'toad.js/viewkit/Select'
import { Slider } from 'toad.js/viewkit/Slider'
import { TextField } from 'toad.js/viewkit/TextField'

export const XBOT_HAND_SYNC_EVENT = 'nyanposer-xbot-hand-sync'

type HandSide = 'Left' | 'Right'
type FingerKey = 'thumb' | 'index' | 'middle' | 'ring' | 'pinky'

interface HandState {
    all: number
    thumb: number
    index: number
    middle: number
    ring: number
    pinky: number
    spread: number
}

const HAND_SIDE_OPTIONS: ReadonlyArray<[HandSide, string]> = [
    ['Left', 'Left hand'],
    ['Right', 'Right hand'],
]

const FINGER_NAME: Record<FingerKey, string> = {
    thumb: 'Thumb',
    index: 'Index',
    middle: 'Middle',
    ring: 'Ring',
    pinky: 'Pinky',
}

// X Bot / Mixamo finger bones use local X as their useful flexion axis.
// These are intentionally a little softer than a mathematically maxed-out
// fist so the mannequin remains useful as an art-reference figure.
const CURL_MAX: Record<FingerKey, [number, number, number]> = {
    thumb: [48, 58, 48],
    index: [62, 82, 72],
    middle: [66, 88, 76],
    ring: [68, 90, 78],
    pinky: [70, 92, 80],
}

// Spread uses local Z on the first phalanx.
// The right hand is mirrored in applyHand().
const SPREAD_WEIGHT: Partial<Record<FingerKey, number>> = {
    index: 1.0,
    middle: 0.25,
    ring: -0.45,
    pinky: -1.0,
}

function freshState(): HandState {
    return {
        all: 0,
        thumb: 0,
        index: 0,
        middle: 0,
        ring: 0,
        pinky: 0,
        spread: 0,
    }
}

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value))
}

function boneName(
    side: HandSide,
    finger: FingerKey,
    joint: number,
): string {
    return `mixamorig:${side}Hand${FINGER_NAME[finger]}${joint}`
}

function wristName(side: HandSide): string {
    return `mixamorig:${side}Hand`
}

function HandSlider(props: {
    label: string
    model: NumberModel
}) {
    return (
        <div
            class="hand-slider-row"
            style={{
                display: 'grid',
                gridTemplateColumns: '92px 72px 1fr',
                gap: '10px',
                alignItems: 'center',
                marginBottom: '12px',
            }}
        >
            <span>{props.label}</span>
            <TextField model={props.model} />
            <Slider model={props.model} />
        </div>
    )
}

function focusHand(
    app: Application,
    renderer: RenderXBot,
    side: HandSide,
    selectBone: (boneName: string) => void,
) {
    const wrist = wristName(side)
    selectBone(wrist)

    const frame = renderer.getBoneFrame(wrist)
    if (frame === undefined) {
        return
    }

    const target = vec4.fromValues(
        frame.head[0],
        frame.head[1],
        frame.head[2],
        1,
    )

    // Preserve the current viewing angle, center the wrist, then zoom in.
    const camera = mat4.clone(app.glview.ctx.camera)
    camera[12] = 0
    camera[13] = 0
    camera[14] = 0

    const rotatedTarget = vec4.transformMat4(
        vec4.create(),
        target,
        camera,
    )

    camera[12] = -rotatedTarget[0]
    camera[13] = -rotatedTarget[1]
    camera[14] = -rotatedTarget[2] - 4.25

    app.glview.ctx.camera = camera
    app.glview.invalidate()
}

export function XBotHandPoseControls(props: {
    app: Application
    renderer: RenderXBot
    selectBone: (boneName: string) => void
}) {
    const { app, renderer } = props

    const sideModel = new OptionModel<HandSide>('Left', HAND_SIDE_OPTIONS)

    const allModel = new NumberModel(0, { min: 0, max: 100, step: 1 })
    const thumbModel = new NumberModel(0, { min: 0, max: 100, step: 1 })
    const indexModel = new NumberModel(0, { min: 0, max: 100, step: 1 })
    const middleModel = new NumberModel(0, { min: 0, max: 100, step: 1 })
    const ringModel = new NumberModel(0, { min: 0, max: 100, step: 1 })
    const pinkyModel = new NumberModel(0, { min: 0, max: 100, step: 1 })
    const spreadModel = new NumberModel(0, { min: -30, max: 30, step: 1 })

    const fingerModels: Record<FingerKey, NumberModel> = {
        thumb: thumbModel,
        index: indexModel,
        middle: middleModel,
        ring: ringModel,
        pinky: pinkyModel,
    }

    const state: Record<HandSide, HandState> = {
        Left: freshState(),
        Right: freshState(),
    }

    let syncing = false

    const applyHand = (side: HandSide) => {
        const hand = state[side]
        const spreadMirror = side === 'Left' ? 1 : -1

        for (const finger of Object.keys(fingerModels) as FingerKey[]) {
            const curl = hand[finger] / 100
            const curlMax = CURL_MAX[finger]
            const spreadWeight = SPREAD_WEIGHT[finger] ?? 0

            for (let joint = 1; joint <= 3; ++joint) {
                const name = boneName(side, finger, joint)
                if (!renderer.hasBone(name)) {
                    continue
                }

                const existing = renderer.getBoneRotation(name)

                const curlDegrees = curlMax[joint - 1] * curl
                const spreadDegrees =
                    joint === 1
                        ? hand.spread * spreadWeight * spreadMirror
                        : 0

                renderer.setBoneRotation(
                    name,
                    curlDegrees,
                    existing.y,
                    spreadDegrees,
                )
            }
        }
    }

    const syncSideFromRenderer = (side: HandSide) => {
        const hand = state[side]
        const spreadMirror = side === 'Left' ? 1 : -1

        for (const finger of Object.keys(fingerModels) as FingerKey[]) {
            const ratios: number[] = []

            for (let joint = 1; joint <= 3; ++joint) {
                const name = boneName(side, finger, joint)
                if (!renderer.hasBone(name)) {
                    continue
                }

                const rotation = renderer.getBoneRotation(name)
                const maxDegrees = CURL_MAX[finger][joint - 1]

                if (maxDegrees !== 0) {
                    ratios.push(rotation.x / maxDegrees)
                }
            }

            const ratio =
                ratios.length > 0
                    ? ratios.reduce((sum, value) => sum + value, 0) /
                        ratios.length
                    : 0

            hand[finger] = clamp(ratio * 100, 0, 100)
        }

        const spreadSamples: number[] = []

        for (const finger of Object.keys(SPREAD_WEIGHT) as FingerKey[]) {
            const weight = SPREAD_WEIGHT[finger] ?? 0
            if (weight === 0) {
                continue
            }

            const name = boneName(side, finger, 1)
            if (!renderer.hasBone(name)) {
                continue
            }

            const rotation = renderer.getBoneRotation(name)
            spreadSamples.push(
                rotation.z / (weight * spreadMirror),
            )
        }

        hand.spread =
            spreadSamples.length > 0
                ? clamp(
                    spreadSamples.reduce((sum, value) => sum + value, 0) /
                        spreadSamples.length,
                    -30,
                    30,
                )
                : 0

        hand.all =
            (
                hand.thumb +
                hand.index +
                hand.middle +
                hand.ring +
                hand.pinky
            ) / 5
    }

    const loadSide = (side: HandSide) => {
        const hand = state[side]

        syncing = true
        allModel.value = hand.all
        thumbModel.value = hand.thumb
        indexModel.value = hand.index
        middleModel.value = hand.middle
        ringModel.value = hand.ring
        pinkyModel.value = hand.pinky
        spreadModel.value = hand.spread
        syncing = false
    }

    const syncControlsFromRenderer = () => {
        syncSideFromRenderer('Left')
        syncSideFromRenderer('Right')
        loadSide(sideModel.value)
    }

    sideModel.signal.add(() => {
        syncSideFromRenderer(sideModel.value)
        loadSide(sideModel.value)
    })

    allModel.signal.add(() => {
        if (syncing) return

        const hand = state[sideModel.value]
        hand.all = allModel.value

        syncing = true
        for (const finger of Object.keys(fingerModels) as FingerKey[]) {
            hand[finger] = allModel.value
            fingerModels[finger].value = allModel.value
        }
        syncing = false

        applyHand(sideModel.value)
    })

    for (const finger of Object.keys(fingerModels) as FingerKey[]) {
        fingerModels[finger].signal.add(() => {
            if (syncing) return

            const hand = state[sideModel.value]
            hand[finger] = fingerModels[finger].value

            hand.all =
                (
                    hand.thumb +
                    hand.index +
                    hand.middle +
                    hand.ring +
                    hand.pinky
                ) / 5

            syncing = true
            allModel.value = hand.all
            syncing = false

            applyHand(sideModel.value)
        })
    }

    spreadModel.signal.add(() => {
        if (syncing) return

        state[sideModel.value].spread = spreadModel.value
        applyHand(sideModel.value)
    })

    const relaxHand = () => {
        state[sideModel.value] = freshState()
        loadSide(sideModel.value)
        applyHand(sideModel.value)
    }

    const makeFist = () => {
        const hand = state[sideModel.value]
        hand.all = 100
        hand.thumb = 100
        hand.index = 100
        hand.middle = 100
        hand.ring = 100
        hand.pinky = 100
        hand.spread = 0

        loadSide(sideModel.value)
        applyHand(sideModel.value)
    }

    const bodyView = () => {
        app.glview.ctx.camera = app.bodyCamera()
        app.glview.invalidate()
    }

    window.addEventListener(
        XBOT_HAND_SYNC_EVENT,
        syncControlsFromRenderer,
    )

    // The JSON may still be loading when this component is created. A second
    // sync on the first animation frame catches the normal fast-load case,
    // while changing a hand or using any control also re-reads the renderer.
    syncControlsFromRenderer()
    requestAnimationFrame(syncControlsFromRenderer)

    return (
        <div
            style={{
                marginTop: '34px',
                paddingTop: '22px',
                borderTop: '1px solid var(--tx-gray-60)',
            }}
        >
            <h3 style={{ margin: '0 0 8px 0' }}>Hand posing</h3>

            <p
                style={{
                    marginTop: 0,
                    opacity: 0.75,
                    lineHeight: '1.45',
                }}
            >
                Focus on one hand, then curl the whole hand or adjust each
                finger. Spread fans the four fingers apart.
            </p>

            <div style={{ marginBottom: '14px' }}>
                <Select model={sideModel} style={{ width: '100%' }} />
            </div>

            <div
                style={{
                    display: 'flex',
                    gap: '8px',
                    flexWrap: 'wrap',
                    marginBottom: '20px',
                }}
            >
                <Button
                    action={() =>
                        focusHand(
                            app,
                            renderer,
                            sideModel.value,
                            props.selectBone,
                        )
                    }
                >
                    Focus hand
                </Button>

                <Button action={bodyView}>Body view</Button>
                <Button action={relaxHand}>Relax hand</Button>
                <Button action={makeFist}>Make fist</Button>
            </div>

            <HandSlider label="All curl" model={allModel} />
            <HandSlider label="Thumb" model={thumbModel} />
            <HandSlider label="Index" model={indexModel} />
            <HandSlider label="Middle" model={middleModel} />
            <HandSlider label="Ring" model={ringModel} />
            <HandSlider label="Pinky" model={pinkyModel} />
            <HandSlider label="Spread" model={spreadModel} />

            <p
                style={{
                    marginTop: '16px',
                    opacity: 0.65,
                    lineHeight: '1.4',
                }}
            >
                Curl drives the three weighted Mixamo finger joints together,
                so one slider bends a complete finger instead of making you
                rotate each phalanx separately.
            </p>
        </div>
    )
}
