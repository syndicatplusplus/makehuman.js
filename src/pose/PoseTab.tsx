import { Application, setRenderer } from 'Application'
import { TAB } from 'HistoryManager'
import { RenderHuman } from 'render/RenderHuman'
import { Tab } from 'toad.js/viewkit/Tab'
import { Select } from 'toad.js/viewkit/Select'
import { Slider } from 'toad.js/viewkit/Slider'
import { TextField } from 'toad.js/viewkit/TextField'
import { Button } from 'toad.js/viewkit/Button'
import { OptionModel } from 'toad.js/appkit/OptionModel'
import { NumberModel } from 'toad.js/appkit/NumberModel'
import { euler2matrix, matrix2euler } from 'gl/algorithms/euler'
import { deg2rad } from 'gl/algorithms/deg2rad'
import { rad2deg } from 'gl/algorithms/rad2deg'
import { mat4 } from 'gl-matrix'

const POSE_BONES: ReadonlyArray<[string, string]> = [
    ['root', 'Whole body'],
    ['spine01', 'Hips / lower torso'],
    ['spine03', 'Chest'],
    ['neck01', 'Neck'],
    ['head', 'Head'],

    ['clavicle.L', 'Left shoulder'],
    ['upperarm01.L', 'Left upper arm'],
    ['lowerarm01.L', 'Left forearm'],
    ['wrist.L', 'Left wrist'],

    ['clavicle.R', 'Right shoulder'],
    ['upperarm01.R', 'Right upper arm'],
    ['lowerarm01.R', 'Right forearm'],
    ['wrist.R', 'Right wrist'],

    ['upperleg01.L', 'Left thigh'],
    ['lowerleg01.L', 'Left shin'],
    ['foot.L', 'Left foot'],

    ['upperleg01.R', 'Right thigh'],
    ['lowerleg01.R', 'Right shin'],
    ['foot.R', 'Right foot'],
]

function roundedDegrees(radians: number): number {
    return Math.round(rad2deg(radians) * 10) / 10
}

function refreshPose(app: Application) {
    app.skeleton.update()
    app.humanMesh.calculateVertexRigged()

    if (app.glview?.renderList) {
        app.glview.renderList.update()
    }

    app.glview?.invalidate()
}

function PoseAxis(props: { label: string, model: NumberModel }) {
    return (
        <div style={{ marginBottom: '18px' }}>
            <div
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

export function PoseTab(props: { app: Application }) {
    const app = props.app

    const boneModel = new OptionModel<string>('upperarm01.L', POSE_BONES)
    const xModel = new NumberModel(0, { min: -180, max: 180, step: 1 })
    const yModel = new NumberModel(0, { min: -180, max: 180, step: 1 })
    const zModel = new NumberModel(0, { min: -180, max: 180, step: 1 })

    let syncingControls = false

    const loadSelectedBone = () => {
        const bone = app.skeleton.getBone(boneModel.value)
        const rotation = matrix2euler(bone.matUserPoseRelative)

        syncingControls = true
        xModel.value = roundedDegrees(rotation.x)
        yModel.value = roundedDegrees(rotation.y)
        zModel.value = roundedDegrees(rotation.z)
        syncingControls = false
    }

    const applySelectedBone = () => {
        if (syncingControls) {
            return
        }

        const bone = app.skeleton.getBone(boneModel.value)
        bone.matUserPoseGlobal = undefined
        bone.matUserPoseRelative = euler2matrix(
            deg2rad(xModel.value),
            deg2rad(yModel.value),
            deg2rad(zModel.value),
        )

        refreshPose(app)
    }

    const resetSelectedBone = () => {
        const bone = app.skeleton.getBone(boneModel.value)
        bone.matUserPoseGlobal = undefined
        mat4.identity(bone.matUserPoseRelative)

        loadSelectedBone()
        refreshPose(app)
    }

    const resetWholePose = () => {
        app.skeleton.reset()
        loadSelectedBone()
        refreshPose(app)
    }

    // Load the selected bone's current rotation before wiring up change listeners.
    loadSelectedBone()

    boneModel.signal.add(() => loadSelectedBone())
    xModel.signal.add(() => applySelectedBone())
    yModel.signal.add(() => applySelectedBone())
    zModel.signal.add(() => applySelectedBone())

    return (
        <Tab
            label="Pose"
            value={TAB.POSE}
            visibilityChange={setRenderer(app, new RenderHuman())}
        >
            <div
                style={{
                    padding: '18px',
                    height: '100%',
                    overflow: 'auto',
                    boxSizing: 'border-box',
                }}
            >
                <h2 style={{ marginTop: 0 }}>Pose</h2>

                <p style={{ lineHeight: '1.5' }}>
                    Select a body part, then rotate it around its local X, Y and Z axes.
                    This is the first posing pass; direct click-and-drag gizmos can come next.
                </p>

                <div style={{ margin: '20px 0 26px 0' }}>
                    <div style={{ marginBottom: '8px' }}>
                        <strong>Body part</strong>
                    </div>
                    <Select model={boneModel} style={{ width: '100%' }} />
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
                    <Button action={resetSelectedBone}>Reset selected</Button>
                    <Button action={resetWholePose}>Reset whole pose</Button>
                </div>

                <p
                    style={{
                        marginTop: '28px',
                        opacity: 0.7,
                        lineHeight: '1.45',
                    }}
                >
                    Tip: start with an upper arm or thigh. The axes are local to each bone,
                    so the useful bending axis can differ between body parts.
                </p>
            </div>
        </Tab>
    )
}
