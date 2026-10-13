import { Application, setRenderer } from 'Application'
import { TAB } from 'HistoryManager'
import { RenderXBot } from 'render/RenderXBot'
import { Tab } from 'toad.js/viewkit/Tab'
import { Select } from 'toad.js/viewkit/Select'
import { Slider } from 'toad.js/viewkit/Slider'
import { TextField } from 'toad.js/viewkit/TextField'
import { Button } from 'toad.js/viewkit/Button'
import { OptionModel } from 'toad.js/appkit/OptionModel'
import { NumberModel } from 'toad.js/appkit/NumberModel'
import { XBOT_POSE_BONES } from './XBotPoseBones'
import { XBotPoseSelectMode } from './XBotPoseSelectMode'
import {
    XBotHandPoseControls,
    XBOT_HAND_SYNC_EVENT,
} from './XBotHandPoseControls'
import { XBotPoseFileControls } from './XBotPoseFileControls'

function PoseAxis(props: {
    label: string
    model: NumberModel
}) {
    return (
        <div style={{ marginBottom: '18px' }}>
            <div
                class="pose-axis-row"
                style={{
                    display: 'grid',
                    gridTemplateColumns: '28px 72px 1fr',
                    gap: '10px',
                    alignItems: 'center',
                }}
            >
                <strong>{props.label}</strong>
                <TextField model={props.model} />
                <Slider model={props.model} />
            </div>
        </div>
    )
}

export function XBotPoseTab(props: {
    app: Application
    renderer: RenderXBot
}) {
    const { app, renderer } = props

    const boneModel = new OptionModel<string>('none', XBOT_POSE_BONES)
    const xModel = new NumberModel(0, { min: -180, max: 180, step: 1 })
    const yModel = new NumberModel(0, { min: -180, max: 180, step: 1 })
    const zModel = new NumberModel(0, { min: -180, max: 180, step: 1 })

    let syncingControls = false
    let poseSelectMode: XBotPoseSelectMode | undefined
    let controlsBone = 'none'

    const setAxisControlsEnabled = (enabled: boolean) => {
        xModel.enabled = enabled
        yModel.enabled = enabled
        zModel.enabled = enabled
    }

    const commitControlsToBone = (boneName: string) => {
        if (boneName === 'none') {
            return
        }

        renderer.setBoneRotation(
            boneName,
            xModel.value,
            yModel.value,
            zModel.value,
        )
    }

    const loadSelectedBone = () => {
        const selectedBone = boneModel.value

        if (selectedBone === 'none') {
            syncingControls = true
            xModel.value = 0
            yModel.value = 0
            zModel.value = 0
            syncingControls = false

            controlsBone = 'none'
            setAxisControlsEnabled(false)
            app.glview?.invalidate()
            return
        }

        setAxisControlsEnabled(true)

        const rotation = renderer.getBoneRotation(selectedBone)

        syncingControls = true
        xModel.value = rotation.x
        yModel.value = rotation.y
        zModel.value = rotation.z
        syncingControls = false

        controlsBone = selectedBone
        app.glview?.invalidate()
    }

    const applySelectedBone = () => {
        if (syncingControls || controlsBone === 'none') {
            return
        }

        commitControlsToBone(controlsBone)
    }

    const syncAllPoseControls = () => {
        loadSelectedBone()
        window.dispatchEvent(new Event(XBOT_HAND_SYNC_EVENT))
        app.glview?.invalidate()
    }

    const resetSelectedBone = () => {
        const selectedBone = boneModel.value
        if (selectedBone === 'none') {
            return
        }

        renderer.resetBone(selectedBone)
        syncAllPoseControls()
    }

    const resetWholePose = () => {
        renderer.resetPose()
        syncAllPoseControls()
    }

    const rendererVisibility = setRenderer(app, renderer)

    const poseVisibility = (state: 'visible' | 'hidden') => {
        rendererVisibility(state)

        if (state === 'visible') {
            if (poseSelectMode === undefined) {
                poseSelectMode = new XBotPoseSelectMode(
                    app,
                    renderer,
                    boneModel,
                    xModel,
                    yModel,
                    zModel,
                )
                app.glview.pushInputHandler(poseSelectMode)
            }

            app.glview.invalidate()
        } else if (poseSelectMode !== undefined) {
            commitControlsToBone(controlsBone)

            app.glview.popInputHandler()
            poseSelectMode = undefined
        }
    }

    loadSelectedBone()

    boneModel.signal.add(() => {
        commitControlsToBone(controlsBone)
        loadSelectedBone()
    })

    xModel.signal.add(() => applySelectedBone())
    yModel.signal.add(() => applySelectedBone())
    zModel.signal.add(() => applySelectedBone())

    return (
        <Tab
            label="Pose"
            value={TAB.POSE}
            visibilityChange={poseVisibility}
        >
            <div
                class="pose-scroll-panel"
                style={{
                    height: '100%',
                    overflow: 'auto',
                    boxSizing: 'border-box',
                    WebkitOverflowScrolling: 'touch',
                }}
            >
                <h2 style={{ marginTop: 0 }}>X Bot Pose</h2>

                <p style={{ lineHeight: '1.5' }}>
                    Tap or click a body part to select it. Drag a colored
                    rotation ring to rotate that joint around its imported
                    local X, Y or Z axis, or use the sliders for precise
                    adjustment.
                </p>

                <XBotPoseFileControls
                    renderer={renderer}
                    beforeSave={() => {
                        commitControlsToBone(controlsBone)
                    }}
                    afterPoseChanged={syncAllPoseControls}
                />

                <div style={{ margin: '20px 0 26px 0' }}>
                    <div style={{ marginBottom: '8px' }}>
                        <strong>Body part</strong>
                    </div>
                    <Select
                        model={boneModel}
                        style={{ width: '100%' }}
                    />
                </div>

                <PoseAxis label="X" model={xModel} />
                <PoseAxis label="Y" model={yModel} />
                <PoseAxis label="Z" model={zModel} />

                <div
                    style={{
                        display: 'flex',
                        gap: '10px',
                        flexWrap: 'wrap',
                        marginTop: '26px',
                    }}
                >
                    <Button action={resetSelectedBone}>
                        Reset selected
                    </Button>

                    <Button action={resetWholePose}>
                        Reset whole pose
                    </Button>
                </div>

                <p
                    style={{
                        marginTop: '28px',
                        opacity: 0.7,
                        lineHeight: '1.45',
                    }}
                >
                    Tap/click empty space or press Escape to clear the
                    selection. Touch dragging still orbits the camera, while
                    two-finger gestures continue to pan and zoom.
                </p>

                <XBotHandPoseControls
                    app={app}
                    renderer={renderer}
                    selectBone={(boneName) => {
                        boneModel.value = boneName
                    }}
                />
            </div>
        </Tab>
    )
}
