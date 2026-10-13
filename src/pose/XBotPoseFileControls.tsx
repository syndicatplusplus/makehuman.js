import { RenderXBot } from 'render/RenderXBot'
import { Button } from 'toad.js/viewkit/Button'

function poseFilename(): string {
    const now = new Date()
    const pad = (value: number) => `${value}`.padStart(2, '0')

    return [
        'xbot-pose',
        now.getFullYear(),
        pad(now.getMonth() + 1),
        pad(now.getDate()),
        `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`,
    ].join('-') + '.nyanpose.json'
}

function savePose(
    renderer: RenderXBot,
    beforeSave: () => void,
) {
    beforeSave()

    const pose = renderer.exportPose()
    const content = JSON.stringify(pose, null, 2)
    const blob = new Blob([content], {
        type: 'application/json;charset=utf-8',
    })

    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = poseFilename()
    anchor.style.display = 'none'

    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()

    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function loadPose(
    renderer: RenderXBot,
    afterPoseChanged: () => void,
) {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.nyanpose,.json,application/json'
    input.style.display = 'none'

    input.onchange = async () => {
        try {
            const file = input.files?.[0]
            if (file === undefined) {
                return
            }

            const text = await file.text()

            let pose: unknown
            try {
                pose = JSON.parse(text)
            } catch {
                throw new Error('That file is not valid JSON.')
            }

            renderer.importPose(pose)
            afterPoseChanged()
        } catch (error) {
            console.error(error)

            const message =
                error instanceof Error
                    ? error.message
                    : 'Unable to load that pose.'

            alert(`Could not load X Bot pose: ${message}`)
        } finally {
            input.remove()
        }
    }

    document.body.appendChild(input)
    input.click()
}

function resetPose(
    renderer: RenderXBot,
    afterPoseChanged: () => void,
) {
    renderer.resetPose()
    afterPoseChanged()
}

export function XBotPoseFileControls(props: {
    renderer: RenderXBot
    beforeSave: () => void
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
                <Button
                    action={() =>
                        savePose(
                            props.renderer,
                            props.beforeSave,
                        )
                    }
                >
                    Save pose
                </Button>

                <Button
                    action={() =>
                        loadPose(
                            props.renderer,
                            props.afterPoseChanged,
                        )
                    }
                >
                    Load pose
                </Button>

                <Button
                    action={() =>
                        resetPose(
                            props.renderer,
                            props.afterPoseChanged,
                        )
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
                Saves the complete X Bot skeleton pose, including hands and
                fingers. Body model and camera position are not changed by
                pose files.
            </p>
        </div>
    )
}
