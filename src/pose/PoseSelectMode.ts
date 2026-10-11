import { Application } from 'Application'
import { deg2rad } from 'gl/algorithms/deg2rad'
import { InputHandler } from 'gl/input/InputHandler'
import { MouseButton } from 'gl/input/MouseButton'
import { mat4, vec3, vec4 } from 'gl-matrix'
import { OptionModel } from 'toad.js/appkit/OptionModel'
import { POSE_BONE_OPTIONS, getPoseBoneOption } from './PoseBones'

interface ScreenPoint {
    x: number
    y: number
    depth: number
}

interface PickResult {
    value: string
    score: number
    depth: number
}

const SVG_NS = 'http://www.w3.org/2000/svg'

function pointSegmentDistance(
    px: number,
    py: number,
    ax: number,
    ay: number,
    bx: number,
    by: number,
): number {
    const abx = bx - ax
    const aby = by - ay
    const apx = px - ax
    const apy = py - ay
    const lengthSquared = abx * abx + aby * aby

    if (lengthSquared === 0) {
        return Math.hypot(px - ax, py - ay)
    }

    let t = (apx * abx + apy * aby) / lengthSquared
    t = Math.max(0, Math.min(1, t))

    const x = ax + abx * t
    const y = ay + aby * t
    return Math.hypot(px - x, py - y)
}

export class PoseSelectMode extends InputHandler {
    private app: Application
    private boneModel: OptionModel<string>
    private overlayGroup: SVGGElement
    private selectedGroup: SVGGElement
    private hoverGroup: SVGGElement
    private hoverValue?: string

    constructor(app: Application, boneModel: OptionModel<string>) {
        super()
        this.app = app
        this.boneModel = boneModel

        this.overlayGroup = document.createElementNS(SVG_NS, 'g')
        this.selectedGroup = document.createElementNS(SVG_NS, 'g')
        this.hoverGroup = document.createElementNS(SVG_NS, 'g')

        this.overlayGroup.append(this.hoverGroup, this.selectedGroup)
        this.app.glview.overlaySVG.appendChild(this.overlayGroup)
    }

    override info(): string {
        return 'Pose: left-click a body part to select it; middle-drag to orbit'
    }

    override destructor(): void {
        this.overlayGroup.remove()
        this.app.glview.canvas.style.cursor = ''
    }

    override selectionCenter(): vec3 | undefined {
        const option = getPoseBoneOption(this.boneModel.value)
        if (option === undefined) {
            return undefined
        }

        const center = vec3.create()
        let count = 0

        for (const boneName of option.pickBones) {
            if (!this.app.skeleton.hasBone(boneName)) {
                continue
            }

            const bone = this.app.skeleton.getBone(boneName)
            const transform = bone.matPoseGlobal ?? bone.matRestGlobal
            if (transform === undefined || bone.yvector4 === undefined) {
                continue
            }

            const head = vec4.transformMat4(
                vec4.create(),
                vec4.fromValues(0, 0, 0, 1),
                transform,
            )
            const tail = vec4.transformMat4(
                vec4.create(),
                bone.yvector4,
                transform,
            )

            center[0] += head[0] + tail[0]
            center[1] += head[1] + tail[1]
            center[2] += head[2] + tail[2]
            count += 2
        }

        if (count === 0) {
            return undefined
        }

        vec3.scale(center, center, 1 / count)
        return center
    }

    override pointerdown(ev: PointerEvent): void {
        if (ev.button !== MouseButton.LEFT) {
            return
        }

        const hit = this.pick(ev)
        if (hit === undefined) {
            return
        }

        this.boneModel.value = hit.value
        this.hoverValue = undefined
        this.app.glview.canvas.style.cursor = 'pointer'
        this.app.glview.invalidate()
        ev.preventDefault()
    }

    override pointermove(ev: PointerEvent): void {
        if (ev.buttons !== 0) {
            return
        }

        const hit = this.pick(ev)
        const nextHover = hit?.value

        if (nextHover !== this.hoverValue) {
            this.hoverValue = nextHover
            this.app.glview.canvas.style.cursor = nextHover ? 'pointer' : ''
            this.app.glview.invalidate()
        }
    }

    override paint(): void {
        this.drawOption(this.hoverGroup, this.hoverValue, false)
        this.drawOption(this.selectedGroup, this.boneModel.value, true)
    }

    private pick(ev: PointerEvent): PickResult | undefined {
        const rect = this.app.glview.canvas.getBoundingClientRect()
        const px = ev.clientX - rect.left
        const py = ev.clientY - rect.top

        let best: PickResult | undefined

        for (const option of POSE_BONE_OPTIONS) {
            for (const boneName of option.pickBones) {
                const segment = this.projectBone(boneName)
                if (segment === undefined) {
                    continue
                }

                const distance = pointSegmentDistance(
                    px,
                    py,
                    segment.head.x,
                    segment.head.y,
                    segment.tail.x,
                    segment.tail.y,
                )

                if (distance > option.hitRadius) {
                    continue
                }

                const score = distance / option.hitRadius
                const depth = Math.min(segment.head.depth, segment.tail.depth)

                if (
                    best === undefined ||
                    score < best.score - 0.02 ||
                    (Math.abs(score - best.score) <= 0.02 && depth < best.depth)
                ) {
                    best = { value: option.value, score, depth }
                }
            }
        }

        return best
    }

    private drawOption(group: SVGGElement, value: string | undefined, selected: boolean): void {
        group.replaceChildren()

        if (value === undefined) {
            return
        }

        const option = getPoseBoneOption(value)
        if (option === undefined) {
            return
        }

        for (const boneName of option.pickBones) {
            const segment = this.projectBone(boneName)
            if (segment === undefined) {
                continue
            }

            const line = document.createElementNS(SVG_NS, 'line')
            line.setAttribute('x1', `${segment.head.x}`)
            line.setAttribute('y1', `${segment.head.y}`)
            line.setAttribute('x2', `${segment.tail.x}`)
            line.setAttribute('y2', `${segment.tail.y}`)
            line.setAttribute('stroke', selected ? '#ffd166' : '#ffffff')
            line.setAttribute('stroke-width', selected ? '7' : '5')
            line.setAttribute('stroke-linecap', 'round')
            line.setAttribute('opacity', selected ? '0.95' : '0.45')
            group.appendChild(line)
        }
    }

    private projectBone(
        boneName: string,
    ): { head: ScreenPoint, tail: ScreenPoint } | undefined {
        if (!this.app.skeleton.hasBone(boneName)) {
            return undefined
        }

        const bone = this.app.skeleton.getBone(boneName)
        const transform = bone.matPoseGlobal ?? bone.matRestGlobal
        if (transform === undefined || bone.yvector4 === undefined) {
            return undefined
        }

        const headWorld = vec4.transformMat4(
            vec4.create(),
            vec4.fromValues(0, 0, 0, 1),
            transform,
        )
        const tailWorld = vec4.transformMat4(
            vec4.create(),
            bone.yvector4,
            transform,
        )

        const head = this.projectWorldPoint(headWorld)
        const tail = this.projectWorldPoint(tailWorld)

        if (head === undefined || tail === undefined) {
            return undefined
        }

        return { head, tail }
    }

    private projectWorldPoint(world: vec4): ScreenPoint | undefined {
        const view = this.app.glview
        const canvas = view.canvas
        const width = canvas.clientWidth
        const height = canvas.clientHeight

        if (width <= 0 || height <= 0) {
            return undefined
        }

        const projection = mat4.perspective(
            mat4.create(),
            deg2rad(45),
            width / height,
            0.1,
            100,
        )

        const cameraPoint = vec4.transformMat4(
            vec4.create(),
            world,
            view.ctx.camera,
        )
        const clip = vec4.transformMat4(
            vec4.create(),
            cameraPoint,
            projection,
        )

        if (clip[3] <= 0) {
            return undefined
        }

        const ndcX = clip[0] / clip[3]
        const ndcY = clip[1] / clip[3]
        const ndcZ = clip[2] / clip[3]

        return {
            x: (ndcX * 0.5 + 0.5) * width,
            y: (1 - (ndcY * 0.5 + 0.5)) * height,
            depth: ndcZ,
        }
    }
}
