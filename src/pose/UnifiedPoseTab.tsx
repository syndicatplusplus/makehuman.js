import { Application } from 'Application'
import { deg2rad } from 'gl/algorithms/deg2rad'
import { euler2matrix, matrix2euler } from 'gl/algorithms/euler'
import { rad2deg } from 'gl/algorithms/rad2deg'
import { TAB } from 'HistoryManager'
import { mat4 } from 'gl-matrix'
import { RenderHuman } from 'render/RenderHuman'
import { RenderXBot } from 'render/RenderXBot'
import {
    MANNEQUIN_XBOT,
    MannequinControls,
} from 'ui/MannequinControls'
import { NumberModel } from 'toad.js/appkit/NumberModel'
import { OptionModel } from 'toad.js/appkit/OptionModel'
import { Button } from 'toad.js/viewkit/Button'
import { Select } from 'toad.js/viewkit/Select'
import { Slider } from 'toad.js/viewkit/Slider'
import { Tab } from 'toad.js/viewkit/Tab'
import { TextField } from 'toad.js/viewkit/TextField'
import { HandPoseControls } from './HandPoseControls'
import { POSE_BONES } from './PoseBones'
import { PoseFileControls } from './PoseFileControls'
import {
    announcePoseChanged,
    POSE_CHANGED_EVENT,
} from './PoseEvents'
import { PoseSelectMode } from './PoseSelectMode'
import {
    mirrorHumanPose,
    mirrorXBotPose,
    PoseMirrorAction,
} from './PoseMirror'
import {
    commitPoseHistory,
    queuePoseHistoryRecord,
    registerPoseHistoryAdapter,
    setActivePoseHistoryMode,
} from './PoseHistory'
import {
    XBotHandPoseControls,
    XBOT_HAND_SYNC_EVENT,
} from './XBotHandPoseControls'
import { XBOT_POSE_BONES } from './XBotPoseBones'
import { XBotPoseFileControls } from './XBotPoseFileControls'
import { XBotPoseSelectMode } from './XBotPoseSelectMode'

type PoseMode = 'human' | 'xbot'

function isHumanFingerBone(name: string): boolean {
    return /^finger[1-5]-[1-3]\.[LR]$/.test(name)
}

function isXBotFingerBone(name: string): boolean {
    return /^mixamorig:(Left|Right)Hand(Thumb|Index|Middle|Ring|Pinky)[123]$/.test(name)
}

function roundedDegrees(radians: number): number {
    return Math.round(rad2deg(radians) * 10) / 10
}

function refreshHumanPose(app: Application) {
    app.skeleton.update()
    app.humanMesh.calculateVertexRigged()

    if (app.glview?.renderList) {
        app.glview.renderList.update()
    }

    app.glview?.invalidate()
}

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

function PoseSymmetryControls(props: {
    apply: (action: PoseMirrorAction) => void
}) {
    return (
        <div
            style={{
                margin: '18px 0 24px 0',
                padding: '14px',
                border: '1px solid var(--tx-gray-60)',
                borderRadius: '8px',
            }}
        >
            <div
                style={{
                    fontWeight: '700',
                    marginBottom: '10px',
                }}
            >
                Pose symmetry
            </div>

            <div
                style={{
                    display: 'flex',
                    gap: '8px',
                    flexWrap: 'wrap',
                }}
            >
                <Button action={() => props.apply('mirror')}>
                    Mirror pose
                </Button>
                <Button action={() => props.apply('left-to-right')}>
                    Left → Right
                </Button>
                <Button action={() => props.apply('right-to-left')}>
                    Right → Left
                </Button>
            </div>

            <p
                style={{
                    margin: '10px 0 0 0',
                    opacity: 0.65,
                    lineHeight: '1.4',
                }}
            >
                Mirror swaps the complete left/right pose. Copy buttons leave
                the source side unchanged and replace only the opposite side.
                Each operation is one undoable history step.
            </p>
        </div>
    )
}

export function UnifiedPoseTab(props: {
    app: Application
    humanRenderer: RenderHuman
    xbotRenderer: RenderXBot
    mannequinModel: OptionModel<string>
}) {
    const {
        app,
        humanRenderer,
        xbotRenderer,
        mannequinModel,
    } = props

    /*
     * MakeHuman pose controls.
     *
     * Keep the bone represented by the XYZ controls separate from the newly
     * selected bone. Toad model signals can fire while selection is changing,
     * so using humanBoneModel.value directly can apply the newly loaded
     * zeroes to the bone that was just selected. This mirrors the state-sync
     * fix already used by X Bot.
     */
    const humanBoneModel = new OptionModel<string>('none', POSE_BONES)
    const humanXModel = new NumberModel(0, { min: -180, max: 180, step: 1 })
    const humanYModel = new NumberModel(0, { min: -180, max: 180, step: 1 })
    const humanZModel = new NumberModel(0, { min: -180, max: 180, step: 1 })

    let syncingHumanControls = false
    let humanControlsBone = 'none'

    const setHumanAxisControlsEnabled = (enabled: boolean) => {
        humanXModel.enabled = enabled
        humanYModel.enabled = enabled
        humanZModel.enabled = enabled
    }

    const commitHumanControlsToBone = (boneName: string) => {
        if (
            boneName === 'none' ||
            !app.skeleton.hasBone(boneName)
        ) {
            return
        }

        const bone = app.skeleton.getBone(boneName)
        bone.matUserPoseGlobal = undefined
        bone.matUserPoseRelative = euler2matrix(
            deg2rad(humanXModel.value),
            deg2rad(humanYModel.value),
            deg2rad(humanZModel.value),
        )

        refreshHumanPose(app)
    }

    const loadHumanSelectedBone = () => {
        const selectedBone = humanBoneModel.value

        if (selectedBone === 'none') {
            syncingHumanControls = true
            humanXModel.value = 0
            humanYModel.value = 0
            humanZModel.value = 0
            syncingHumanControls = false

            humanControlsBone = 'none'
            setHumanAxisControlsEnabled(false)
            app.glview?.invalidate()
            return
        }

        setHumanAxisControlsEnabled(true)

        const bone = app.skeleton.getBone(selectedBone)
        const rotation = matrix2euler(bone.matUserPoseRelative)

        syncingHumanControls = true
        humanXModel.value = roundedDegrees(rotation.x)
        humanYModel.value = roundedDegrees(rotation.y)
        humanZModel.value = roundedDegrees(rotation.z)
        syncingHumanControls = false

        humanControlsBone = selectedBone
        app.glview?.invalidate()
    }

    const applyHumanSelectedBone = () => {
        if (
            syncingHumanControls ||
            humanControlsBone === 'none'
        ) {
            return
        }

        commitHumanControlsToBone(humanControlsBone)

        // Keep the coarse hand sliders synchronized when an individual
        // MakeHuman phalanx is adjusted with the gizmo or XYZ controls.
        if (isHumanFingerBone(humanControlsBone)) {
            announcePoseChanged()
        }

        queuePoseHistoryRecord('human')
    }

    const resetHumanSelectedBone = () => {
        const selectedBone = humanBoneModel.value

        if (selectedBone === 'none') {
            return
        }

        const bone = app.skeleton.getBone(selectedBone)
        bone.matUserPoseGlobal = undefined
        mat4.identity(bone.matUserPoseRelative)

        loadHumanSelectedBone()
        refreshHumanPose(app)

        if (isHumanFingerBone(selectedBone)) {
            announcePoseChanged()
        }

        commitPoseHistory('human')
    }

    const syncHumanBoneControlsFromHand = () => {
        if (isHumanFingerBone(humanBoneModel.value)) {
            loadHumanSelectedBone()
        }
    }

    window.addEventListener(
        POSE_CHANGED_EVENT,
        syncHumanBoneControlsFromHand,
    )

    humanBoneModel.signal.add(() => {
        commitHumanControlsToBone(humanControlsBone)
        loadHumanSelectedBone()
    })

    humanXModel.signal.add(applyHumanSelectedBone)
    humanYModel.signal.add(applyHumanSelectedBone)
    humanZModel.signal.add(applyHumanSelectedBone)

    loadHumanSelectedBone()

    /*
     * X Bot pose controls.
     */
    const xbotBoneModel = new OptionModel<string>(
        'none',
        XBOT_POSE_BONES,
    )
    const xbotXModel = new NumberModel(0, { min: -180, max: 180, step: 1 })
    const xbotYModel = new NumberModel(0, { min: -180, max: 180, step: 1 })
    const xbotZModel = new NumberModel(0, { min: -180, max: 180, step: 1 })

    let syncingXBotControls = false
    let xbotControlsBone = 'none'

    const setXBotAxisControlsEnabled = (enabled: boolean) => {
        xbotXModel.enabled = enabled
        xbotYModel.enabled = enabled
        xbotZModel.enabled = enabled
    }

    const commitXBotControlsToBone = (boneName: string) => {
        if (boneName === 'none') {
            return
        }

        xbotRenderer.setBoneRotation(
            boneName,
            xbotXModel.value,
            xbotYModel.value,
            xbotZModel.value,
        )
    }

    const loadXBotSelectedBone = () => {
        const selectedBone = xbotBoneModel.value

        if (selectedBone === 'none') {
            syncingXBotControls = true
            xbotXModel.value = 0
            xbotYModel.value = 0
            xbotZModel.value = 0
            syncingXBotControls = false

            xbotControlsBone = 'none'
            setXBotAxisControlsEnabled(false)
            app.glview?.invalidate()
            return
        }

        setXBotAxisControlsEnabled(true)

        const rotation = xbotRenderer.getBoneRotation(selectedBone)

        syncingXBotControls = true
        xbotXModel.value = rotation.x
        xbotYModel.value = rotation.y
        xbotZModel.value = rotation.z
        syncingXBotControls = false

        xbotControlsBone = selectedBone
        app.glview?.invalidate()
    }

    const applyXBotSelectedBone = () => {
        if (
            syncingXBotControls ||
            xbotControlsBone === 'none'
        ) {
            return
        }

        commitXBotControlsToBone(xbotControlsBone)

        // Finger gizmo / XYZ edits should immediately update the coarse
        // hand-curl controls too. Body bones do not need this extra work.
        if (isXBotFingerBone(xbotControlsBone)) {
            window.dispatchEvent(new Event(XBOT_HAND_SYNC_EVENT))
        }

        queuePoseHistoryRecord('xbot')
    }

    const syncXBotBoneControlsFromHand = () => {
        loadXBotSelectedBone()
        app.glview?.invalidate()
    }

    window.addEventListener(
        XBOT_HAND_SYNC_EVENT,
        syncXBotBoneControlsFromHand,
    )

    const syncAllXBotPoseControls = () => {
        window.dispatchEvent(new Event(XBOT_HAND_SYNC_EVENT))
        app.glview?.invalidate()
    }

    const resetXBotSelectedBone = () => {
        const selectedBone = xbotBoneModel.value
        if (selectedBone === 'none') {
            return
        }

        xbotRenderer.resetBone(selectedBone)
        syncAllXBotPoseControls()
        commitPoseHistory('xbot')
    }

    const resetXBotWholePose = () => {
        xbotRenderer.resetPose()
        syncAllXBotPoseControls()
        commitPoseHistory('xbot')
    }

    xbotBoneModel.signal.add(() => {
        commitXBotControlsToBone(xbotControlsBone)
        loadXBotSelectedBone()
    })

    xbotXModel.signal.add(applyXBotSelectedBone)
    xbotYModel.signal.add(applyXBotSelectedBone)
    xbotZModel.signal.add(applyXBotSelectedBone)

    loadXBotSelectedBone()

    const applyHumanSymmetry = (action: PoseMirrorAction) => {
        // Finish any pending slider edit first so symmetry is its own undo step.
        commitHumanControlsToBone(humanControlsBone)
        commitPoseHistory('human')

        mirrorHumanPose(app, action)
        announcePoseChanged()
        loadHumanSelectedBone()

        commitPoseHistory('human')
    }

    const applyXBotSymmetry = (action: PoseMirrorAction) => {
        commitXBotControlsToBone(xbotControlsBone)
        commitPoseHistory('xbot')

        mirrorXBotPose(xbotRenderer, action)
        syncAllXBotPoseControls()
        loadXBotSelectedBone()

        commitPoseHistory('xbot')
    }

    /*
     * Pose undo / redo. Each history entry is a complete pose snapshot, so an
     * undo remains correct even when several bones were changed by a hand
     * slider or a loaded pose file.
     */
    registerPoseHistoryAdapter('human', {
        capture: () => app.skeleton.toMHP(),
        restore: (snapshot) => {
            app.skeleton.fromMHP(snapshot)
            refreshHumanPose(app)
            announcePoseChanged()
            loadHumanSelectedBone()
        },
    })

    registerPoseHistoryAdapter('xbot', {
        capture: () => JSON.stringify(xbotRenderer.exportPose()),
        restore: (snapshot) => {
            xbotRenderer.importPose(JSON.parse(snapshot))
            syncAllXBotPoseControls()
            loadXBotSelectedBone()
        },
    })

    /*
     * One Pose tab, two posing systems.
     */
    let poseTabVisible = false
    let activeMode: PoseMode | undefined

    const selectedMode = (): PoseMode =>
        mannequinModel.value === MANNEQUIN_XBOT
            ? 'xbot'
            : 'human'

    const syncPosePanels = () => {
        const xbotSelected = selectedMode() === 'xbot'

        const humanPanel = document.getElementById(
            'human-pose-panel',
        )
        const xbotPanel = document.getElementById(
            'xbot-pose-panel',
        )

        if (humanPanel !== null) {
            humanPanel.style.display =
                xbotSelected
                    ? 'none'
                    : 'block'
        }

        if (xbotPanel !== null) {
            xbotPanel.style.display =
                xbotSelected
                    ? 'block'
                    : 'none'
        }
    }

    const deactivatePoseMode = () => {
        if (activeMode === undefined) {
            return
        }

        if (activeMode === 'xbot') {
            commitXBotControlsToBone(xbotControlsBone)
        } else {
            commitHumanControlsToBone(humanControlsBone)
        }

        app.glview.popInputHandler()
        activeMode = undefined
        setActivePoseHistoryMode(undefined)
    }

    const activatePoseMode = () => {
        if (!poseTabVisible) {
            return
        }

        const nextMode = selectedMode()

        if (activeMode === nextMode) {
            app.setRenderer(
                nextMode === 'xbot'
                    ? xbotRenderer
                    : humanRenderer,
            )
            setActivePoseHistoryMode(nextMode)
            app.glview.invalidate()
            return
        }

        deactivatePoseMode()

        if (nextMode === 'xbot') {
            app.setRenderer(xbotRenderer)

            loadXBotSelectedBone()
            window.dispatchEvent(new Event(XBOT_HAND_SYNC_EVENT))

            app.glview.pushInputHandler(
                new XBotPoseSelectMode(
                    app,
                    xbotRenderer,
                    xbotBoneModel,
                    xbotXModel,
                    xbotYModel,
                    xbotZModel,
                ),
            )
        } else {
            app.setRenderer(humanRenderer)
            loadHumanSelectedBone()

            app.glview.pushInputHandler(
                new PoseSelectMode(
                    app,
                    humanBoneModel,
                    humanXModel,
                    humanYModel,
                    humanZModel,
                ),
            )
        }

        activeMode = nextMode
        setActivePoseHistoryMode(nextMode)
        app.glview.invalidate()
    }

    const syncPoseMode = () => {
        syncPosePanels()

        if (poseTabVisible) {
            activatePoseMode()
        }
    }

    mannequinModel.signal.add(syncPoseMode)
    requestAnimationFrame(syncPosePanels)

    const poseVisibility = (state: 'visible' | 'hidden') => {
        poseTabVisible = state === 'visible'

        if (poseTabVisible) {
            syncPosePanels()
            activatePoseMode()
        } else {
            deactivatePoseMode()
        }
    }

    return (
        <Tab
            label="Pose"
            value={TAB.POSE}
            visibilityChange={poseVisibility}
        >
            <div
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    width: '100%',
                    height: '100%',
                    overflow: 'hidden',
                }}
            >
                <MannequinControls
                    app={app}
                    model={mannequinModel}
                />

                <div
                    style={{
                        position: 'relative',
                        flex: '1 1 auto',
                        minHeight: 0,
                        overflow: 'hidden',
                    }}
                >
                    <div
                        id="human-pose-panel"
                        class="pose-scroll-panel"
                        style={{
                            display: 'block',
                            height: '100%',
                            overflow: 'auto',
                            boxSizing: 'border-box',
                            WebkitOverflowScrolling: 'touch',
                        }}
                    >
                <h2 style={{ marginTop: 0 }}>
                    MakeHuman Pose
                </h2>

                <p style={{ lineHeight: '1.5' }}>
                    Click or tap a body part to select it. Use the floating
                    local-axis rotation gizmo or the X, Y and Z sliders for
                    precise adjustment.
                </p>

                <PoseFileControls
                    app={app}
                    afterPoseChanged={() => {
                        loadHumanSelectedBone()
                        commitPoseHistory('human')
                    }}
                />

                <PoseSymmetryControls
                    apply={applyHumanSymmetry}
                />

                <div style={{ margin: '20px 0 26px 0' }}>
                    <div style={{ marginBottom: '8px' }}>
                        <strong>Body part</strong>
                    </div>
                    <Select
                        model={humanBoneModel}
                        style={{ width: '100%' }}
                    />
                </div>

                <PoseAxis label="X" model={humanXModel} />
                <PoseAxis label="Y" model={humanYModel} />
                <PoseAxis label="Z" model={humanZModel} />

                <div
                    style={{
                        display: 'flex',
                        gap: '10px',
                        flexWrap: 'wrap',
                        marginTop: '26px',
                    }}
                >
                    <Button action={resetHumanSelectedBone}>
                        Reset selected
                    </Button>
                </div>

                <p
                    style={{
                        marginTop: '28px',
                        opacity: 0.7,
                        lineHeight: '1.45',
                    }}
                >
                    Touch: tap selects, one-finger drag orbits, two-finger
                    drag pans, and pinch zooms. Mouse: middle-drag orbits and
                    Shift+middle-drag pans.
                </p>

                <HandPoseControls
                    app={app}
                    selectBone={(boneName) => {
                        humanBoneModel.value = boneName
                    }}
                    afterPoseChanged={() => {
                        queuePoseHistoryRecord('human')
                    }}
                />
            </div>

            <div
                id="xbot-pose-panel"
                class="pose-scroll-panel"
                style={{
                    display: 'none',
                    height: '100%',
                    overflow: 'auto',
                    boxSizing: 'border-box',
                    WebkitOverflowScrolling: 'touch',
                }}
            >
                <h2 style={{ marginTop: 0 }}>
                    X Bot Pose
                </h2>

                <p style={{ lineHeight: '1.5' }}>
                    Tap or click a body part to select it. Drag a colored
                    rotation ring to rotate that joint around its imported
                    local X, Y or Z axis, or use the sliders for precise
                    adjustment.
                </p>

                <XBotPoseFileControls
                    renderer={xbotRenderer}
                    beforeSave={() => {
                        commitXBotControlsToBone(xbotControlsBone)
                    }}
                    afterPoseChanged={() => {
                        syncAllXBotPoseControls()
                        commitPoseHistory('xbot')
                    }}
                />

                <PoseSymmetryControls
                    apply={applyXBotSymmetry}
                />

                <div style={{ margin: '20px 0 26px 0' }}>
                    <div style={{ marginBottom: '8px' }}>
                        <strong>Body part</strong>
                    </div>
                    <Select
                        model={xbotBoneModel}
                        style={{ width: '100%' }}
                    />
                </div>

                <PoseAxis label="X" model={xbotXModel} />
                <PoseAxis label="Y" model={xbotYModel} />
                <PoseAxis label="Z" model={xbotZModel} />

                <div
                    style={{
                        display: 'flex',
                        gap: '10px',
                        flexWrap: 'wrap',
                        marginTop: '26px',
                    }}
                >
                    <Button action={resetXBotSelectedBone}>
                        Reset selected
                    </Button>

                    <Button action={resetXBotWholePose}>
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
                            renderer={xbotRenderer}
                            selectBone={(boneName) => {
                                xbotBoneModel.value = boneName
                            }}
                            afterPoseChanged={() => {
                                queuePoseHistoryRecord('xbot')
                            }}
                        />
                    </div>
                </div>
            </div>
        </Tab>
    )
}
