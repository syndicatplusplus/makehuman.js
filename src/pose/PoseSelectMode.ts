import { Application } from 'Application'
import { deg2rad } from 'gl/algorithms/deg2rad'
import { InputHandler } from 'gl/input/InputHandler'
import { MouseButton } from 'gl/input/MouseButton'
import { mat4, vec3, vec4 } from 'gl-matrix'
import { NumberModel } from 'toad.js/appkit/NumberModel'
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

type GizmoAxis = 'x' | 'y' | 'z'

interface GizmoDrag {
    axis: GizmoAxis
    lastAngle: number
}

const SVG_NS = 'http://www.w3.org/2000/svg'

const GIZMO_RADII: Record<GizmoAxis, number> = {
    x: 38,
    y: 50,
    z: 62,
}

const GIZMO_COLORS: Record<GizmoAxis, string> = {
    x: '#ff5f56',
    y: '#5bd66f',
    z: '#4da3ff',
}

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

function angleAround(cx: number, cy: number, x: number, y: number): number {
    return Math.atan2(y - cy, x - cx) * 180 / Math.PI
}

function normalizeAngleDelta(delta: number): number {
    while (delta > 180) delta -= 360
    while (delta < -180) delta += 360
    return delta
}

export class PoseSelectMode extends InputHandler {
    private app: Application
    private boneModel: OptionModel<string>
    private axisModels: Record<GizmoAxis, NumberModel>

    private overlayGroup: SVGGElement
    private selectedGroup: SVGGElement
    private hoverGroup: SVGGElement
    private gizmoGroup: SVGGElement

    private hoverValue?: string
    private hoverAxis?: GizmoAxis
    private gizmoDrag?: GizmoDrag

    constructor(
        app: Application,
        boneModel: OptionModel<string>,
        xModel: NumberModel,
        yModel: NumberModel,
        zModel: NumberModel,
    ) {
        super()
        this.app = app
        this.boneModel = boneModel
        this.axisModels = {
            x: xModel,
            y: yModel,
            z: zModel,
        }

        this.overlayGroup = document.createElementNS(SVG_NS, 'g')
        this.hoverGroup = document.createElementNS(SVG_NS, 'g')
        this.selectedGroup = document.createElementNS(SVG_NS, 'g')
        this.gizmoGroup = document.createElementNS(SVG_NS, 'g')

        this.overlayGroup.append(
            this.hoverGroup,
            this.selectedGroup,
            this.gizmoGroup,
        )
        this.app.glview.overlaySVG.appendChild(this.overlayGroup)
    }

    override info(): string {
        return 'Pose: left-click body parts to select; drag X/Y/Z rings to rotate; middle-drag to orbit'
    }

    override destructor(): void {
        this.overlayGroup.remove()
        this.app.glview.canvas.style.cursor = ''
    }

    override keydown(ev: KeyboardEvent): void {
        if (ev.code === 'Escape') {
            this.clearSelection()
            ev.preventDefault()
        }
    }

    override selectionCenter(): vec3 | undefined {
        if (this.boneModel.value === 'none') {
            return undefined
        }

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

        // The gizmo gets first chance at the click.
        const axis = this.pickGizmo(ev)
        if (axis !== undefined) {
            const center = this.projectSelectedJoint()
            if (center !== undefined) {
                this.gizmoDrag = {
                    axis,
                    lastAngle: angleAround(
                        center.x,
                        center.y,
                        ev.clientX - this.app.glview.canvas.getBoundingClientRect().left,
                        ev.clientY - this.app.glview.canvas.getBoundingClientRect().top,
                    ),
                }

                this.hoverAxis = axis
                this.app.glview.canvas.setPointerCapture(ev.pointerId)
                this.app.glview.canvas.style.cursor = 'grabbing'
                this.app.glview.invalidate()
                ev.preventDefault()
                return
            }
        }

        // Otherwise treat the click as body-part selection.
        const hit = this.pickBody(ev)
        if (hit === undefined) {
            this.clearSelection()
            ev.preventDefault()
            return
        }

        this.boneModel.value = hit.value
        this.hoverValue = undefined
        this.hoverAxis = undefined
        this.app.glview.canvas.style.cursor = 'pointer'
        this.app.glview.invalidate()
        ev.preventDefault()
    }

    override pointermove(ev: PointerEvent): void {
        if (this.gizmoDrag !== undefined) {
            const center = this.projectSelectedJoint()
            if (center === undefined) {
                return
            }

            const rect = this.app.glview.canvas.getBoundingClientRect()
            const x = ev.clientX - rect.left
            const y = ev.clientY - rect.top
            const angle = angleAround(center.x, center.y, x, y)
            const delta = normalizeAngleDelta(angle - this.gizmoDrag.lastAngle)

            if (Math.abs(delta) > 0.01) {
                const model = this.axisModels[this.gizmoDrag.axis]
                model.value = model.value + delta
                this.gizmoDrag.lastAngle = angle
            }

            this.app.glview.canvas.style.cursor = 'grabbing'
            ev.preventDefault()
            return
        }

        // Don't interfere with BasicMode while the user is orbiting.
        if (ev.buttons !== 0) {
            return
        }

        const nextAxis = this.pickGizmo(ev)
        if (nextAxis !== undefined) {
            if (nextAxis !== this.hoverAxis || this.hoverValue !== undefined) {
                this.hoverAxis = nextAxis
                this.hoverValue = undefined
                this.app.glview.canvas.style.cursor = 'grab'
                this.app.glview.invalidate()
            }
            return
        }

        const hit = this.pickBody(ev)
        const nextHover = hit?.value

        if (nextHover !== this.hoverValue || this.hoverAxis !== undefined) {
            this.hoverAxis = undefined
            this.hoverValue = nextHover
            this.app.glview.canvas.style.cursor = nextHover ? 'pointer' : ''
            this.app.glview.invalidate()
        }
    }

    override pointerup(ev: PointerEvent): void {
        if (this.gizmoDrag === undefined) {
            return
        }

        this.gizmoDrag = undefined

        if (this.app.glview.canvas.hasPointerCapture(ev.pointerId)) {
            this.app.glview.canvas.releasePointerCapture(ev.pointerId)
        }

        this.app.glview.canvas.style.cursor = this.hoverAxis ? 'grab' : ''
        this.app.glview.invalidate()
        ev.preventDefault()
    }

    override paint(): void {
        this.drawOption(this.hoverGroup, this.hoverValue, false)
        this.drawOption(this.selectedGroup, this.boneModel.value, true)
        this.drawGizmo()
    }

    private clearSelection(): void {
        this.boneModel.value = 'none'
        this.hoverValue = undefined
        this.hoverAxis = undefined
        this.gizmoDrag = undefined
        this.app.glview.canvas.style.cursor = ''
        this.app.glview.invalidate()
    }

    private pickBody(ev: PointerEvent): PickResult | undefined {
        const rect = this.app.glview.canvas.getBoundingClientRect()
        const px = ev.clientX - rect.left
        const py = ev.clientY - rect.top

        let best: PickResult | undefined

        for (const option of POSE_BONE_OPTIONS) {
            if (option.value === 'none') {
                continue
            }
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

    private pickGizmo(ev: PointerEvent): GizmoAxis | undefined {
        if (this.boneModel.value === 'none') {
            return undefined
        }

        const center = this.projectSelectedJoint()
        if (center === undefined) {
            return undefined
        }

        const rect = this.app.glview.canvas.getBoundingClientRect()
        const px = ev.clientX - rect.left
        const py = ev.clientY - rect.top
        const distance = Math.hypot(px - center.x, py - center.y)

        let bestAxis: GizmoAxis | undefined
        let bestDistance = Number.POSITIVE_INFINITY

        for (const axis of ['x', 'y', 'z'] as const) {
            const ringDistance = Math.abs(distance - GIZMO_RADII[axis])
            if (ringDistance <= 8 && ringDistance < bestDistance) {
                bestAxis = axis
                bestDistance = ringDistance
            }
        }

        return bestAxis
    }

    private drawOption(
        group: SVGGElement,
        value: string | undefined,
        selected: boolean,
    ): void {
        group.replaceChildren()

        if (value === undefined || value === 'none') {
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

    private drawGizmo(): void {
        this.gizmoGroup.replaceChildren()

        if (this.boneModel.value === 'none') {
            return
        }

        const center = this.projectSelectedJoint()
        if (center === undefined) {
            return
        }

        // A small pivot marker makes it clear which exact joint is rotating.
        const pivot = document.createElementNS(SVG_NS, 'circle')
        pivot.setAttribute('cx', `${center.x}`)
        pivot.setAttribute('cy', `${center.y}`)
        pivot.setAttribute('r', '4')
        pivot.setAttribute('fill', '#ffd166')
        pivot.setAttribute('stroke', '#202020')
        pivot.setAttribute('stroke-width', '2')
        this.gizmoGroup.appendChild(pivot)

        for (const axis of ['x', 'y', 'z'] as const) {
            const active = this.gizmoDrag?.axis === axis
            const hovered = this.hoverAxis === axis

            const ring = document.createElementNS(SVG_NS, 'circle')
            ring.setAttribute('cx', `${center.x}`)
            ring.setAttribute('cy', `${center.y}`)
            ring.setAttribute('r', `${GIZMO_RADII[axis]}`)
            ring.setAttribute(
                'stroke',
                active ? '#ffd166' : hovered ? '#ffffff' : GIZMO_COLORS[axis],
            )
            ring.setAttribute('stroke-width', active ? '5' : hovered ? '4' : '2')
            ring.setAttribute('fill', 'none')
            ring.setAttribute('opacity', active || hovered ? '0.95' : '0.52')
            this.gizmoGroup.appendChild(ring)

            if (active || hovered) {
                const label = document.createElementNS(SVG_NS, 'text')
                label.textContent = axis.toUpperCase()
                label.setAttribute('x', `${center.x + GIZMO_RADII[axis] + 7}`)
                label.setAttribute('y', `${center.y + 5}`)
                label.setAttribute('fill', active ? '#ffd166' : '#ffffff')
                label.setAttribute('font-size', '13')
                label.setAttribute('font-weight', '700')
                label.setAttribute('font-family', 'sans-serif')
                label.setAttribute('paint-order', 'stroke')
                label.setAttribute('stroke', '#202020')
                label.setAttribute('stroke-width', '3')
                this.gizmoGroup.appendChild(label)
            }
        }
    }

    private projectSelectedJoint(): ScreenPoint | undefined {
        const boneName = this.boneModel.value
        if (boneName === 'none' || !this.app.skeleton.hasBone(boneName)) {
            return undefined
        }

        const bone = this.app.skeleton.getBone(boneName)
        const transform = bone.matPoseGlobal ?? bone.matRestGlobal
        if (transform === undefined) {
            return undefined
        }

        const headWorld = vec4.transformMat4(
            vec4.create(),
            vec4.fromValues(0, 0, 0, 1),
            transform,
        )

        return this.projectWorldPoint(headWorld)
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
