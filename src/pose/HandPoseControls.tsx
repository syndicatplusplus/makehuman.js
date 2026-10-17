import { Application } from 'Application'
import { euler2matrix, matrix2euler } from 'gl/algorithms/euler'
import { deg2rad } from 'gl/algorithms/deg2rad'
import { rad2deg } from 'gl/algorithms/rad2deg'
import { mat4, vec4 } from 'gl-matrix'
import { NumberModel } from 'toad.js/appkit/NumberModel'
import { OptionModel } from 'toad.js/appkit/OptionModel'
import { Button } from 'toad.js/viewkit/Button'
import { Select } from 'toad.js/viewkit/Select'
import { Slider } from 'toad.js/viewkit/Slider'
import { TextField } from 'toad.js/viewkit/TextField'
import {
    announcePoseChanged,
    POSE_CHANGED_EVENT,
} from './PoseEvents'

type HandSide = 'L' | 'R'
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
    ['L', 'Left hand'],
    ['R', 'Right hand'],
]

const FINGER_NUMBER: Record<FingerKey, number> = {
    thumb: 1,
    index: 2,
    middle: 3,
    ring: 4,
    pinky: 5,
}

// Curl amounts in degrees at the three finger joints when the slider is 100%.
const CURL_MAX: Record<FingerKey, [number, number, number]> = {
    thumb: [55, 70, 60],
    index: [65, 95, 90],
    middle: [70, 100, 95],
    ring: [72, 102, 98],
    pinky: [75, 105, 100],
}

// Spread is applied only at the first phalanx.
const SPREAD_WEIGHT: Partial<Record<FingerKey, number>> = {
    index: -1.0,
    middle: -0.25,
    ring: 0.45,
    pinky: 1.0,
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

function refreshPose(app: Application) {
    app.skeleton.update()
    app.humanMesh.calculateVertexRigged()

    if (app.glview?.renderList) {
        app.glview.renderList.update()
    }

    app.glview?.invalidate()
}

function fingerBoneName(
    side: HandSide,
    finger: FingerKey,
    joint: number,
): string {
    return `finger${FINGER_NUMBER[finger]}-${joint}.${side}`
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
    side: HandSide,
    selectBone: (boneName: string) => void,
) {
    const wristName = `wrist.${side}`
    selectBone(wristName)

    app.skeleton.update()
    const wrist = app.skeleton.getBone(wristName)
    const transform = wrist.matPoseGlobal ?? wrist.matRestGlobal
    if (transform === undefined) {
        return
    }

    const target = vec4.transformMat4(
        vec4.create(),
        vec4.fromValues(0, 0, 0, 1),
        transform,
    )

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

export function HandPoseControls(props: {
    app: Application
    selectBone: (boneName: string) => void
    afterPoseChanged?: () => void
}) {
    const app = props.app

    const sideModel = new OptionModel<HandSide>('L', HAND_SIDE_OPTIONS)

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
        L: freshState(),
        R: freshState(),
    }

    let syncing = false

    const finishHandChange = () => {
        refreshPose(app)
        announcePoseChanged()
        props.afterPoseChanged?.()
    }

    const applyFingerCurl = (
        side: HandSide,
        finger: FingerKey,
    ) => {
        const hand = state[side]
        const curl = hand[finger] / 100
        const curlMax = CURL_MAX[finger]

        for (let joint = 1; joint <= 3; ++joint) {
            const boneName = fingerBoneName(side, finger, joint)
            if (!app.skeleton.hasBone(boneName)) {
                continue
            }

            const bone = app.skeleton.getBone(boneName)
            const existing = matrix2euler(bone.matUserPoseRelative)

            bone.matUserPoseGlobal = undefined
            bone.matUserPoseRelative = euler2matrix(
                deg2rad(curlMax[joint - 1] * curl),
                existing.y,
                existing.z,
            )
        }
    }

    const applyAllCurls = (side: HandSide) => {
        for (const finger of Object.keys(fingerModels) as FingerKey[]) {
            applyFingerCurl(side, finger)
        }
    }

    const applySpread = (side: HandSide) => {
        const hand = state[side]
        const sideSign = side === 'L' ? 1 : -1

        for (const finger of Object.keys(SPREAD_WEIGHT) as FingerKey[]) {
            const weight = SPREAD_WEIGHT[finger] ?? 0
            if (weight === 0) {
                continue
            }

            const boneName = fingerBoneName(side, finger, 1)
            if (!app.skeleton.hasBone(boneName)) {
                continue
            }

            const bone = app.skeleton.getBone(boneName)
            const existing = matrix2euler(bone.matUserPoseRelative)
            const spreadDegrees =
                hand.spread * weight * sideSign

            bone.matUserPoseGlobal = undefined
            bone.matUserPoseRelative = euler2matrix(
                existing.x,
                existing.y,
                deg2rad(spreadDegrees),
            )
        }
    }

    const resetHandBones = (side: HandSide) => {
        for (const finger of Object.keys(fingerModels) as FingerKey[]) {
            for (let joint = 1; joint <= 3; ++joint) {
                const boneName = fingerBoneName(side, finger, joint)
                if (!app.skeleton.hasBone(boneName)) {
                    continue
                }

                const bone = app.skeleton.getBone(boneName)
                bone.matUserPoseGlobal = undefined
                mat4.identity(bone.matUserPoseRelative)
            }
        }
    }

    const syncSideFromSkeleton = (side: HandSide) => {
        const hand = state[side]
        const sideSign = side === 'L' ? 1 : -1

        for (const finger of Object.keys(fingerModels) as FingerKey[]) {
            const ratios: number[] = []

            for (let joint = 1; joint <= 3; ++joint) {
                const boneName = fingerBoneName(side, finger, joint)
                if (!app.skeleton.hasBone(boneName)) {
                    continue
                }

                const bone = app.skeleton.getBone(boneName)
                const rotation = matrix2euler(bone.matUserPoseRelative)
                const maxDegrees = CURL_MAX[finger][joint - 1]

                if (maxDegrees !== 0) {
                    ratios.push(
                        rad2deg(rotation.x) / maxDegrees,
                    )
                }
            }

            const ratio =
                ratios.length > 0
                    ? ratios.reduce(
                        (sum, value) => sum + value,
                        0,
                    ) / ratios.length
                    : 0

            hand[finger] = clamp(ratio * 100, 0, 100)
        }

        const spreadSamples: number[] = []

        for (const finger of Object.keys(SPREAD_WEIGHT) as FingerKey[]) {
            const weight = SPREAD_WEIGHT[finger] ?? 0
            if (weight === 0) {
                continue
            }

            const boneName = fingerBoneName(side, finger, 1)
            if (!app.skeleton.hasBone(boneName)) {
                continue
            }

            const rotation = matrix2euler(
                app.skeleton.getBone(boneName).matUserPoseRelative,
            )

            spreadSamples.push(
                rad2deg(rotation.z) / (weight * sideSign),
            )
        }

        hand.spread =
            spreadSamples.length > 0
                ? clamp(
                    spreadSamples.reduce(
                        (sum, value) => sum + value,
                        0,
                    ) / spreadSamples.length,
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

    const syncControlsFromSkeleton = () => {
        syncSideFromSkeleton('L')
        syncSideFromSkeleton('R')
        loadSide(sideModel.value)
    }

    sideModel.signal.add(() => {
        syncSideFromSkeleton(sideModel.value)
        loadSide(sideModel.value)
    })

    allModel.signal.add(() => {
        if (syncing) return

        const side = sideModel.value
        const hand = state[side]
        hand.all = allModel.value

        syncing = true
        for (const finger of Object.keys(fingerModels) as FingerKey[]) {
            hand[finger] = allModel.value
            fingerModels[finger].value = allModel.value
        }
        syncing = false

        applyAllCurls(side)
        finishHandChange()
    })

    for (const finger of Object.keys(fingerModels) as FingerKey[]) {
        fingerModels[finger].signal.add(() => {
            if (syncing) return

            const side = sideModel.value
            const hand = state[side]
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

            /*
             * Only this one finger's curl axis is changed. Other fingers,
             * spread, and non-curl gizmo fine-tuning stay intact.
             */
            applyFingerCurl(side, finger)
            finishHandChange()
        })
    }

    spreadModel.signal.add(() => {
        if (syncing) return

        const side = sideModel.value
        state[side].spread = spreadModel.value

        applySpread(side)
        finishHandChange()
    })

    const relaxHand = () => {
        const side = sideModel.value

        resetHandBones(side)
        state[side] = freshState()
        loadSide(side)
        finishHandChange()
    }

    const makeFist = () => {
        const side = sideModel.value

        /*
         * Make fist is intentionally canonical. Clear manual phalanx twists,
         * then apply the coordinated fist recipe.
         */
        resetHandBones(side)

        const hand = state[side]
        hand.all = 100
        hand.thumb = 100
        hand.index = 100
        hand.middle = 100
        hand.ring = 100
        hand.pinky = 100
        hand.spread = 0

        loadSide(side)
        applyAllCurls(side)
        applySpread(side)
        finishHandChange()
    }

    const bodyView = () => {
        app.glview.ctx.camera = app.bodyCamera()
        app.glview.invalidate()
    }

    window.addEventListener(
        POSE_CHANGED_EVENT,
        syncControlsFromSkeleton,
    )

    syncControlsFromSkeleton()

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
                digit. Fine-tune individual phalanges with the gizmo.
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
                        focusHand(app, sideModel.value, props.selectBone)
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
                Gizmo edits update these sliders. An individual curl slider
                changes only that finger; All curl, Relax hand, and Make fist
                intentionally affect the whole hand.
            </p>
        </div>
    )
}
