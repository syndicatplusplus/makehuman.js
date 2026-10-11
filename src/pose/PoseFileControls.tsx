import { Application } from 'Application'
import { Button } from 'toad.js/viewkit/Button'
import { announcePoseChanged } from './PoseEvents'

function refreshPose(app: Application) {
    app.skeleton.update()
    app.humanMesh.calculateVertexRigged()

    if (app.glview?.renderList) {
        app.glview.renderList.update()
    }

    app.glview?.invalidate()
}

function poseFilename(): string {
    const now = new Date()
    const pad = (value: number) => `${value}`.padStart(2, '0')

    return [
        'pose',
        now.getFullYear(),
        pad(now.getMonth() + 1),
        pad(now.getDate()),
        `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`,
    ].join('-') + '.mhp'
}

function savePose(app: Application) {
    const content = app.skeleton.toMHP()
    const blob = new Blob([content], {
        type: 'text/plain;charset=utf-8',
    })

    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = poseFilename()
    anchor.style.display = 'none'

    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()

    // Give the browser time to start the download before releasing the Blob URL.
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function loadPose(
    app: Application,
    afterPoseChanged: () => void,
) {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.mhp,text/plain'
    input.style.display = 'none'

    input.onchange = async () => {
        try {
            const file = input.files?.[0]
            if (file === undefined) {
                return
            }

            const content = await file.text()

            if (
                !content.includes('version ') ||
                !content.split('\n').some((line) => line.startsWith('bone '))
            ) {
                throw new Error('That file does not look like a MakeHuman pose file.')
            }

            app.skeleton.fromMHP(content)
            refreshPose(app)
            announcePoseChanged()
            afterPoseChanged()
        } catch (error) {
            console.error(error)

            const message =
                error instanceof Error
                    ? error.message
                    : 'Unable to load that pose.'

            alert(`Could not load pose: ${message}`)
        } finally {
            input.remove()
        }
    }

    document.body.appendChild(input)
    input.click()
}

function resetPose(
    app: Application,
    afterPoseChanged: () => void,
) {
    app.skeleton.reset()
    refreshPose(app)
    announcePoseChanged()
    afterPoseChanged()
}

export function PoseFileControls(props: {
    app: Application
    afterPoseChanged: () => void
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
                Pose file
            </div>

            <div
                style={{
                    display: 'flex',
                    gap: '8px',
                    flexWrap: 'wrap',
                }}
            >
                <Button action={() => savePose(props.app)}>
                    Save pose
                </Button>

                <Button
                    action={() =>
                        loadPose(props.app, props.afterPoseChanged)
                    }
                >
                    Load pose
                </Button>

                <Button
                    action={() =>
                        resetPose(props.app, props.afterPoseChanged)
                    }
                >
                    Reset pose
                </Button>
            </div>

            <p
                style={{
                    margin: '10px 0 0 0',
                    opacity: 0.65,
                    lineHeight: '1.4',
                }}
            >
                Saves the current skeleton pose, including hands and fingers.
                Body shape and camera position are not changed by pose files.
            </p>
        </div>
    )
}
