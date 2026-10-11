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
import { POSE_BONES } from './PoseBones'
import { PoseSelectMode } from './PoseSelectMode'

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
    let poseSelectMode: PoseSelectMode | undefined

    const loadSelectedBone = () => {
        const bone = app.skeleton.getBone(boneModel.value)
        const rotation = matrix2euler(bone.matUserPoseRelative)

        syncingControls = true
        xModel.value = roundedDegrees(rotation.x)
        yModel.value = roundedDegrees(rotation.y)
        zModel.value = roundedDegrees(rotation.z)
        syncingControls = false

        app.glview?.invalidate()
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

    const rendererVisibility = setRenderer(app, new RenderHuman())

    const poseVisibility = (state: 'visible' | 'hidden') => {
        rendererVisibility(state)

        if (state === 'visible') {
            if (poseSelectMode === undefined) {
                poseSelectMode = new PoseSelectMode(app, boneModel)
                app.glview.pushInputHandler(poseSelectMode)
            }
            app.glview.invalidate()
        } else if (poseSelectMode !== undefined) {
            app.glview.popInputHandler()
            poseSelectMode = undefined
        }
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
            visibilityChange={poseVisibility}
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
                    Click a body part directly on the mannequin, or choose it from the list.
                    Then use X, Y and Z to rotate the selected joint.
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
                    Left-click selects. Move the pointer over the mannequin to preview
                    selectable regions. Middle-drag still orbits around the selected body part.
                </p>
            </div>
        </Tab>
    )
}
