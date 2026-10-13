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

const XBOT_POSE_BONES: ReadonlyArray<[string, string]> = [
    ['none', 'None'],

    ['mixamorig:Hips', 'Hips / lower torso'],
    ['mixamorig:Spine2', 'Chest'],
    ['mixamorig:Neck', 'Neck'],
    ['mixamorig:Head', 'Head'],

    ['mixamorig:LeftShoulder', 'Left shoulder'],
    ['mixamorig:LeftArm', 'Left upper arm'],
    ['mixamorig:LeftForeArm', 'Left forearm'],
    ['mixamorig:LeftHand', 'Left wrist'],

    ['mixamorig:RightShoulder', 'Right shoulder'],
    ['mixamorig:RightArm', 'Right upper arm'],
    ['mixamorig:RightForeArm', 'Right forearm'],
    ['mixamorig:RightHand', 'Right wrist'],

    ['mixamorig:LeftUpLeg', 'Left thigh'],
    ['mixamorig:LeftLeg', 'Left shin'],
    ['mixamorig:LeftFoot', 'Left foot'],

    ['mixamorig:RightUpLeg', 'Right thigh'],
    ['mixamorig:RightLeg', 'Right shin'],
    ['mixamorig:RightFoot', 'Right foot'],
]

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

    const setAxisControlsEnabled = (enabled: boolean) => {
        xModel.enabled = enabled
        yModel.enabled = enabled
        zModel.enabled = enabled
    }

    const loadSelectedBone = () => {
        if (boneModel.value === 'none') {
            syncingControls = true
            xModel.value = 0
            yModel.value = 0
            zModel.value = 0
            syncingControls = false
            setAxisControlsEnabled(false)
            return
        }

        setAxisControlsEnabled(true)

        const rotation = renderer.getBoneRotation(boneModel.value)

        syncingControls = true
        xModel.value = rotation.x
        yModel.value = rotation.y
        zModel.value = rotation.z
        syncingControls = false
    }

    const applySelectedBone = () => {
        if (syncingControls || boneModel.value === 'none') {
            return
        }

        renderer.setBoneRotation(
            boneModel.value,
            xModel.value,
            yModel.value,
            zModel.value,
        )
    }

    const resetSelectedBone = () => {
        if (boneModel.value === 'none') {
            return
        }

        renderer.resetBone(boneModel.value)
        loadSelectedBone()
    }

    const resetWholePose = () => {
        renderer.resetPose()
        loadSelectedBone()
    }

    loadSelectedBone()

    boneModel.signal.add(() => loadSelectedBone())
    xModel.signal.add(() => applySelectedBone())
    yModel.signal.add(() => applySelectedBone())
    zModel.signal.add(() => applySelectedBone())

    return (
        <Tab
            label="Pose"
            value={TAB.POSE}
            visibilityChange={setRenderer(app, renderer)}
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
                    First X Bot posing pass. Choose a major joint, then rotate
                    it around its imported local X, Y and Z axes.
                </p>

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
                    For this checkpoint, X Bot is controlled from the dropdown
                    and sliders only. Direct body-part selection, the floating
                    gizmo, hand controls, and pose files come next.
                </p>
            </div>
        </Tab>
    )
}
