import { Application } from 'Application'
import { deg2rad } from 'gl/algorithms/deg2rad'
import { InputHandler } from 'gl/input/InputHandler'
import { MouseButton } from 'gl/input/MouseButton'
import { mat4, vec3, vec4 } from 'gl-matrix'
import { NumberModel } from 'toad.js/appkit/NumberModel'
import { OptionModel } from 'toad.js/appkit/OptionModel'
import { POSE_BONE_OPTIONS, getPoseBoneOption } from './PoseBones'
import { beginPoseHistoryGesture, endPoseHistoryGesture } from './PoseHistory'

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
    lastX: number
    lastY: number
}

interface GizmoPlacement {
    joint: ScreenPoint
    center: ScreenPoint
}

interface GizmoRing {
    axis: GizmoAxis
    points: ScreenPoint[]
    label: ScreenPoint
}

interface PickCandidate {
    pointerId: number
    pointerType: string
    startX: number
    startY: number
    hit?: PickResult
    moved: boolean
}

const SVG_NS = 'http://www.w3.org/2000/svg'

const GIZMO_RADIUS = 58
const GIZMO_OFFSET = 118
const GIZMO_EDGE_MARGIN = 82
const GIZMO_PICK_DISTANCE = 8
const TOUCH_GIZMO_PICK_DISTANCE = 18
const DIRECT_TAP_MOVE_THRESHOLD = 12
const GIZMO_SEGMENTS = 64
const GIZMO_DEGREES_PER_PIXEL = 0.75

const POSE_MIN_DEGREES = -180
const POSE_MAX_DEGREES = 180

const GIZMO_COLORS: Record<GizmoAxis, string> = {
    x: '#ff5f56',
    y: '#5bd66f',
    z: '#4da3ff',
}

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value))
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

function pointPolylineDistance(
    px: number,
    py: number,
    points: ScreenPoint[],
): number {
    let best = Number.POSITIVE_INFINITY

    for (let i = 0; i < points.length - 1; ++i) {
        const a = points[i]!
        const b = points[i + 1]!
        best = Math.min(
            best,
            pointSegmentDistance(px, py, a.x, a.y, b.x, b.y),
        )
    }

    return best
}

function nearestPolylineTangent(
    px: number,
    py: number,
    points: ScreenPoint[],
): { x: number, y: number } | undefined {
    let bestDistance = Number.POSITIVE_INFINITY
    let bestTangent: { x: number, y: number } | undefined

    for (let i = 0; i < points.length - 1; ++i) {
        const a = points[i]!
        const b = points[i + 1]!
        const distance = pointSegmentDistance(px, py, a.x, a.y, b.x, b.y)

        if (distance < bestDistance) {
            const dx = b.x - a.x
            const dy = b.y - a.y
            const length = Math.hypot(dx, dy)

            if (length > 0.0001) {
                bestDistance = distance
                bestTangent = {
                    x: dx / length,
                    y: dy / length,
                }
            }
        }
    }

    return bestTangent
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
    private pickCandidates = new Map<number, PickCandidate>()

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
        return 'Pose: tap/click body parts to select; drag X/Y/Z rings to rotate; Pencil drag to orbit'
    }

    override destructor(): void {
        if (this.gizmoDrag !== undefined) {
            endPoseHistoryGesture('human')
        }

        this.pickCandidates.clear()
        this.gizmoDrag = undefined
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

    private markMultipleTouchesMoved(): void {
        let touchCount = 0

        for (const candidate of this.pickCandidates.values()) {
            if (candidate.pointerType === 'touch') {
                ++touchCount
            }
        }

        if (touchCount <= 1) {
            return
        }

        for (const candidate of this.pickCandidates.values()) {
            if (candidate.pointerType === 'touch') {
                candidate.moved = true
            }
        }
    }

    override pointerdown(ev: PointerEvent): void {
        if (ev.button !== MouseButton.LEFT) {
            return
        }

        // The gizmo gets first chance at the pointer. Pencil on a ring should
        // rotate the joint, not orbit the camera.
        const axis = this.pickGizmo(ev)
        if (axis !== undefined) {
            const placement = this.getGizmoPlacement()
            if (placement !== undefined) {
                const rect = this.app.glview.canvas.getBoundingClientRect()
                beginPoseHistoryGesture('human')
                this.gizmoDrag = {
                    axis,
                    lastX: ev.clientX - rect.left,
                    lastY: ev.clientY - rect.top,
                }

                this.hoverAxis = axis
                this.app.glview.canvas.setPointerCapture(ev.pointerId)
                this.app.glview.canvas.style.cursor = 'grabbing'
                this.app.glview.invalidate()
                ev.preventDefault()
                return
            }
        }

        // Finger and Pencil taps select. Their drags are reserved for viewport
        // navigation, so delay selection until pointer-up. BasicMode receives
        // the same unconsumed events and performs the actual orbit gesture.
        if (
            ev.pointerType === 'touch' ||
            ev.pointerType === 'pen'
        ) {
            this.pickCandidates.set(ev.pointerId, {
                pointerId: ev.pointerId,
                pointerType: ev.pointerType,
                startX: ev.clientX,
                startY: ev.clientY,
                hit: this.pickBody(ev),
                moved: false,
            })

            if (ev.pointerType === 'touch') {
                this.markMultipleTouchesMoved()
            }

            return
        }

        // Mouse click body-part selection.
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
            const rect = this.app.glview.canvas.getBoundingClientRect()
            const x = ev.clientX - rect.left
            const y = ev.clientY - rect.top

            const rings = this.getGizmoRings()
            const ring = rings.find((candidate) =>
                candidate.axis === this.gizmoDrag!.axis
            )

            if (ring !== undefined) {
                const tangent = nearestPolylineTangent(
                    this.gizmoDrag.lastX,
                    this.gizmoDrag.lastY,
                    ring.points,
                )

                if (tangent !== undefined) {
                    const dx = x - this.gizmoDrag.lastX
                    const dy = y - this.gizmoDrag.lastY
                    const pixelsAlongRing = dx * tangent.x + dy * tangent.y
                    const delta = pixelsAlongRing * GIZMO_DEGREES_PER_PIXEL

                    if (Math.abs(delta) > 0.01) {
                        const model = this.axisModels[this.gizmoDrag.axis]
                        const nextValue = clamp(
                            model.value + delta,
                            POSE_MIN_DEGREES,
                            POSE_MAX_DEGREES,
                        )

                        if (nextValue !== model.value) {
                            model.value = nextValue
                        }
                    }
                }
            }

            this.gizmoDrag.lastX = x
            this.gizmoDrag.lastY = y

            this.app.glview.canvas.style.cursor = 'grabbing'
            ev.preventDefault()
            return
        }

        if (
            ev.pointerType === 'touch' ||
            ev.pointerType === 'pen'
        ) {
            const candidate = this.pickCandidates.get(ev.pointerId)
            if (candidate !== undefined) {
                const moved = Math.hypot(
                    ev.clientX - candidate.startX,
                    ev.clientY - candidate.startY,
                )

                if (moved >= DIRECT_TAP_MOVE_THRESHOLD) {
                    candidate.moved = true
                }

                if (ev.pointerType === 'touch') {
                    this.markMultipleTouchesMoved()
                }

                // BasicMode receives the same event and performs one-finger or
                // Pencil orbit, or the existing two-finger pan/pinch gesture.
                return
            }
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
        if (
            ev.pointerType === 'touch' ||
            ev.pointerType === 'pen'
        ) {
            const candidate = this.pickCandidates.get(ev.pointerId)

            if (candidate !== undefined) {
                this.pickCandidates.delete(ev.pointerId)

                if (!candidate.moved) {
                    if (candidate.hit === undefined) {
                        this.clearSelection()
                    } else {
                        this.boneModel.value = candidate.hit.value
                        this.hoverValue = undefined
                        this.hoverAxis = undefined
                        this.app.glview.canvas.style.cursor = ''
                        this.app.glview.invalidate()
                    }
                }

                // Do not preventDefault here. BasicMode must also receive the
                // pointer-up so it can release touch/Pencil capture and state.
                return
            }
        }

        if (this.gizmoDrag === undefined) {
            return
        }

        endPoseHistoryGesture('human')
        this.gizmoDrag = undefined

        if (this.app.glview.canvas.hasPointerCapture(ev.pointerId)) {
            this.app.glview.canvas.releasePointerCapture(ev.pointerId)
        }

        this.app.glview.canvas.style.cursor = this.hoverAxis ? 'grab' : ''
        this.app.glview.invalidate()
        ev.preventDefault()
    }

    override pointercancel(ev: PointerEvent): void {
        if (
            ev.pointerType === 'touch' ||
            ev.pointerType === 'pen'
        ) {
            this.pickCandidates.delete(ev.pointerId)

            if (ev.pointerType === 'touch') {
                // Interrupted multi-touch candidates should never later be
                // mistaken for clean taps.
                for (const candidate of this.pickCandidates.values()) {
                    if (candidate.pointerType === 'touch') {
                        candidate.moved = true
                    }
                }
            }
        }

        if (this.gizmoDrag !== undefined) {
            endPoseHistoryGesture('human')
            this.gizmoDrag = undefined
            this.hoverAxis = undefined
            this.app.glview.canvas.style.cursor = ''
            this.app.glview.invalidate()
        }
    }

    override paint(): void {
        this.drawOption(this.hoverGroup, this.hoverValue, false)
        this.drawOption(this.selectedGroup, this.boneModel.value, true)
        this.drawGizmo()
    }

    private clearSelection(): void {
        if (this.gizmoDrag !== undefined) {
            endPoseHistoryGesture('human')
        }

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

                const hitRadius =
                    ev.pointerType === 'touch'
                        ? option.hitRadius * 1.35
                        : option.hitRadius

                if (distance > hitRadius) {
                    continue
                }

                const score = distance / hitRadius
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

        const rings = this.getGizmoRings()
        if (rings.length === 0) {
            return undefined
        }

        const rect = this.app.glview.canvas.getBoundingClientRect()
        const px = ev.clientX - rect.left
        const py = ev.clientY - rect.top

        let bestAxis: GizmoAxis | undefined
        let bestDistance = Number.POSITIVE_INFINITY

        const pickDistance =
            ev.pointerType === 'touch'
                ? TOUCH_GIZMO_PICK_DISTANCE
                : GIZMO_PICK_DISTANCE

        for (const ring of rings) {
            const distance = pointPolylineDistance(px, py, ring.points)

            if (
                distance <= pickDistance &&
                distance < bestDistance
            ) {
                bestAxis = ring.axis
                bestDistance = distance
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

        const placement = this.getGizmoPlacement()
        if (placement === undefined) {
            return
        }

        const rings = this.getGizmoRings()
        if (rings.length === 0) {
            return
        }

        const joint = placement.joint
        const center = placement.center

        const connector = document.createElementNS(SVG_NS, 'line')
        connector.setAttribute('x1', `${joint.x}`)
        connector.setAttribute('y1', `${joint.y}`)
        connector.setAttribute('x2', `${center.x}`)
        connector.setAttribute('y2', `${center.y}`)
        connector.setAttribute('stroke', '#ffd166')
        connector.setAttribute('stroke-width', '1.5')
        connector.setAttribute('stroke-dasharray', '5 5')
        connector.setAttribute('opacity', '0.42')
        this.gizmoGroup.appendChild(connector)

        const jointMarker = document.createElementNS(SVG_NS, 'circle')
        jointMarker.setAttribute('cx', `${joint.x}`)
        jointMarker.setAttribute('cy', `${joint.y}`)
        jointMarker.setAttribute('r', '4')
        jointMarker.setAttribute('fill', '#ffd166')
        jointMarker.setAttribute('stroke', '#202020')
        jointMarker.setAttribute('stroke-width', '1.5')
        this.gizmoGroup.appendChild(jointMarker)

        const gizmoCenter = document.createElementNS(SVG_NS, 'circle')
        gizmoCenter.setAttribute('cx', `${center.x}`)
        gizmoCenter.setAttribute('cy', `${center.y}`)
        gizmoCenter.setAttribute('r', '3')
        gizmoCenter.setAttribute('fill', '#202020')
        gizmoCenter.setAttribute('stroke', '#ffd166')
        gizmoCenter.setAttribute('stroke-width', '1.5')
        gizmoCenter.setAttribute('opacity', '0.9')
        this.gizmoGroup.appendChild(gizmoCenter)

        for (const ring of rings) {
            const active = this.gizmoDrag?.axis === ring.axis
            const hovered = this.hoverAxis === ring.axis

            const polyline = document.createElementNS(SVG_NS, 'polyline')
            polyline.setAttribute(
                'points',
                ring.points.map((point) => `${point.x},${point.y}`).join(' '),
            )
            polyline.setAttribute(
                'stroke',
                active ? '#ffd166' :
                hovered ? '#ffffff' :
                GIZMO_COLORS[ring.axis],
            )
            polyline.setAttribute(
                'stroke-width',
                active ? '5' : hovered ? '4' : '2.5',
            )
            polyline.setAttribute('fill', 'none')
            polyline.setAttribute('stroke-linejoin', 'round')
            polyline.setAttribute('stroke-linecap', 'round')
            polyline.setAttribute(
                'opacity',
                active || hovered ? '0.98' : '0.68',
            )
            this.gizmoGroup.appendChild(polyline)

            if (active || hovered) {
                const label = document.createElementNS(SVG_NS, 'text')
                label.textContent = ring.axis.toUpperCase()
                label.setAttribute('x', `${ring.label.x + 7}`)
                label.setAttribute('y', `${ring.label.y + 5}`)
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

    private getGizmoRings(): GizmoRing[] {
        if (
            this.boneModel.value === 'none' ||
            !this.app.skeleton.hasBone(this.boneModel.value)
        ) {
            return []
        }

        const placement = this.getGizmoPlacement()
        if (placement === undefined) {
            return []
        }

        const bone = this.app.skeleton.getBone(this.boneModel.value)
        const transform = bone.matPoseGlobal ?? bone.matRestGlobal
        if (transform === undefined) {
            return []
        }

        const jointWorld = vec4.transformMat4(
            vec4.create(),
            vec4.fromValues(0, 0, 0, 1),
            transform,
        )
        const jointProjected = this.projectWorldPoint(jointWorld)
        if (jointProjected === undefined) {
            return []
        }

        const projectLocalAxis = (
            x: number,
            y: number,
            z: number,
        ): { x: number, y: number } | undefined => {
            const world = vec4.transformMat4(
                vec4.create(),
                vec4.fromValues(x, y, z, 1),
                transform,
            )
            const projected = this.projectWorldPoint(world)
            if (projected === undefined) {
                return undefined
            }

            return {
                x: projected.x - jointProjected.x,
                y: projected.y - jointProjected.y,
            }
        }

        const localX = projectLocalAxis(1, 0, 0)
        const localY = projectLocalAxis(0, 1, 0)
        const localZ = projectLocalAxis(0, 0, 1)

        if (
            localX === undefined ||
            localY === undefined ||
            localZ === undefined
        ) {
            return []
        }

        const ringBasis: Record<
            GizmoAxis,
            [{ x: number, y: number }, { x: number, y: number }]
        > = {
            // Positive right-handed rotation directions:
            // X: Y -> Z, Y: Z -> X, Z: X -> Y.
            x: [localY, localZ],
            y: [localZ, localX],
            z: [localX, localY],
        }

        const rings: GizmoRing[] = []

        for (const axis of ['x', 'y', 'z'] as const) {
            const [u, v] = ringBasis[axis]
            const uLength = Math.hypot(u.x, u.y)
            const vLength = Math.hypot(v.x, v.y)
            const maxLength = Math.max(uLength, vLength)

            if (maxLength < 0.001) {
                continue
            }

            const scale = GIZMO_RADIUS / maxLength
            const points: ScreenPoint[] = []

            for (let i = 0; i <= GIZMO_SEGMENTS; ++i) {
                const angle = (i / GIZMO_SEGMENTS) * Math.PI * 2
                const cos = Math.cos(angle)
                const sin = Math.sin(angle)

                points.push({
                    x: placement.center.x +
                        (u.x * cos + v.x * sin) * scale,
                    y: placement.center.y +
                        (u.y * cos + v.y * sin) * scale,
                    depth: placement.center.depth,
                })
            }

            let label = points[0]!
            for (const point of points) {
                if (point.x > label.x) {
                    label = point
                }
            }

            rings.push({
                axis,
                points,
                label,
            })
        }

        return rings
    }

    private getGizmoPlacement(): GizmoPlacement | undefined {
        if (this.boneModel.value === 'none') {
            return undefined
        }

        const joint = this.projectSelectedJoint()
        if (joint === undefined) {
            return undefined
        }

        const canvas = this.app.glview.canvas
        const width = canvas.clientWidth
        const height = canvas.clientHeight
        if (width <= 0 || height <= 0) {
            return undefined
        }

        // Prefer a direction perpendicular to the selected bone. This keeps the
        // controls beside the anatomy instead of sitting directly on top of it.
        let perpX = joint.x < width / 2 ? -1 : 1
        let perpY = 0

        const segment = this.projectBone(this.boneModel.value)
        if (segment !== undefined) {
            const dx = segment.tail.x - segment.head.x
            const dy = segment.tail.y - segment.head.y
            const length = Math.hypot(dx, dy)

            if (length > 1) {
                perpX = -dy / length
                perpY = dx / length
            }
        }

        const candidateA = {
            x: joint.x + perpX * GIZMO_OFFSET,
            y: joint.y + perpY * GIZMO_OFFSET,
            depth: joint.depth,
        }
        const candidateB = {
            x: joint.x - perpX * GIZMO_OFFSET,
            y: joint.y - perpY * GIZMO_OFFSET,
            depth: joint.depth,
        }

        const centerX = width / 2
        const centerY = height / 2

        const score = (candidate: ScreenPoint): number => {
            const inside =
                candidate.x >= GIZMO_EDGE_MARGIN &&
                candidate.x <= width - GIZMO_EDGE_MARGIN &&
                candidate.y >= GIZMO_EDGE_MARGIN &&
                candidate.y <= height - GIZMO_EDGE_MARGIN

            // Prefer the side farther from the middle of the viewport, which is
            // usually also farther from the mannequin's silhouette.
            return (inside ? 10000 : 0) +
                Math.hypot(candidate.x - centerX, candidate.y - centerY)
        }

        const preferred = score(candidateA) >= score(candidateB)
            ? candidateA
            : candidateB

        return {
            joint,
            center: {
                x: Math.max(
                    GIZMO_EDGE_MARGIN,
                    Math.min(width - GIZMO_EDGE_MARGIN, preferred.x),
                ),
                y: Math.max(
                    GIZMO_EDGE_MARGIN,
                    Math.min(height - GIZMO_EDGE_MARGIN, preferred.y),
                ),
                depth: joint.depth,
            },
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
