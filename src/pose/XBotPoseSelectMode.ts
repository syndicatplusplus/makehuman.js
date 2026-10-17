import { Application } from 'Application'
import { deg2rad } from 'gl/algorithms/deg2rad'
import { InputHandler } from 'gl/input/InputHandler'
import { MouseButton } from 'gl/input/MouseButton'
import { mat4, vec3, vec4 } from 'gl-matrix'
import { RenderXBot } from 'render/RenderXBot'
import { NumberModel } from 'toad.js/appkit/NumberModel'
import { OptionModel } from 'toad.js/appkit/OptionModel'
import {
    XBOT_POSE_BONE_OPTIONS,
    getXBotPoseBoneOption,
} from './XBotPoseBones'
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

interface PointerPoint {
    x: number
    y: number
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

export class XBotPoseSelectMode extends InputHandler {
    private app: Application
    private renderer: RenderXBot
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

    /*
     * Pointer events can arrive faster than the display can paint, especially
     * from a mouse, Pencil, or high-refresh touch screen. Queue only the most
     * recent gizmo position and apply it once per animation frame. This avoids
     * recalculating the skinned X Bot mesh for pointer events the user could
     * never actually see.
     */
    private pendingGizmoPoint?: PointerPoint
    private gizmoAnimationFrame?: number

    constructor(
        app: Application,
        renderer: RenderXBot,
        boneModel: OptionModel<string>,
        xModel: NumberModel,
        yModel: NumberModel,
        zModel: NumberModel,
    ) {
        super()
        this.app = app
        this.renderer = renderer
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
        return 'X Bot Pose: tap/click body parts to select; drag X/Y/Z rings to rotate; Pencil drag to orbit'
    }

    override destructor(): void {
        if (this.gizmoDrag !== undefined) {
            endPoseHistoryGesture('xbot')
        }

        this.cancelPendingGizmoFrame()
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

        const option = getXBotPoseBoneOption(this.boneModel.value)
        if (option === undefined) {
            return undefined
        }

        const center = vec3.create()
        let count = 0

        for (const boneName of option.pickBones) {
            const frame = this.renderer.getBoneFrame(boneName)
            if (frame === undefined) {
                continue
            }

            vec3.add(center, center, frame.head)
            vec3.add(center, center, frame.tail)
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

        const axis = this.pickGizmo(ev)
        if (axis !== undefined) {
            const placement = this.getGizmoPlacement()
            if (placement !== undefined) {
                const rect = this.app.glview.canvas.getBoundingClientRect()
                beginPoseHistoryGesture('xbot')
                this.gizmoDrag = {
                    axis,
                    lastX: ev.clientX - rect.left,
                    lastY: ev.clientY - rect.top,
                }

                this.pendingGizmoPoint = undefined
                this.hoverAxis = axis
                this.app.glview.canvas.setPointerCapture(ev.pointerId)
                this.app.glview.canvas.style.cursor = 'grabbing'
                this.app.glview.invalidate()
                ev.preventDefault()
                return
            }
        }

        // Finger and Pencil taps select, while their drags are reserved for
        // viewport navigation. Delay selection until pointer-up so a Pencil
        // can naturally become an orbit gesture without changing selection.
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

            this.pendingGizmoPoint = {
                x: ev.clientX - rect.left,
                y: ev.clientY - rect.top,
            }

            this.scheduleGizmoFrame()
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

                // BasicMode gets the same event and performs one-finger or
                // Pencil orbit, or the existing two-finger pan/pinch gesture.
                return
            }
        }

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

                // Do not preventDefault here. BasicMode must also see this
                // pointer-up so it can clean up touch/Pencil navigation state.
                return
            }
        }

        if (this.gizmoDrag === undefined) {
            return
        }

        /*
         * Apply the last queued pointer position before ending the drag so a
         * quick release cannot drop the final few pixels of movement.
         */
        this.flushPendingGizmoDrag()
        this.cancelPendingGizmoFrame()
        endPoseHistoryGesture('xbot')
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
                // If iPadOS interrupts a touch gesture, any remaining touch
                // candidates should not later be treated as clean taps.
                for (const candidate of this.pickCandidates.values()) {
                    if (candidate.pointerType === 'touch') {
                        candidate.moved = true
                    }
                }
            }
        }

        if (this.gizmoDrag !== undefined) {
            this.cancelPendingGizmoFrame()
            endPoseHistoryGesture('xbot')
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

    private scheduleGizmoFrame(): void {
        if (this.gizmoAnimationFrame !== undefined) {
            return
        }

        this.gizmoAnimationFrame = requestAnimationFrame(() => {
            this.gizmoAnimationFrame = undefined
            this.flushPendingGizmoDrag()
        })
    }

    private cancelPendingGizmoFrame(): void {
        if (this.gizmoAnimationFrame !== undefined) {
            cancelAnimationFrame(this.gizmoAnimationFrame)
            this.gizmoAnimationFrame = undefined
        }

        this.pendingGizmoPoint = undefined
    }

    private flushPendingGizmoDrag(): void {
        if (
            this.gizmoDrag === undefined ||
            this.pendingGizmoPoint === undefined
        ) {
            return
        }

        const point = this.pendingGizmoPoint
        this.pendingGizmoPoint = undefined

        const rings = this.getGizmoRings()
        const ring = rings.find(
            (candidate) => candidate.axis === this.gizmoDrag!.axis,
        )

        if (ring !== undefined) {
            const tangent = nearestPolylineTangent(
                this.gizmoDrag.lastX,
                this.gizmoDrag.lastY,
                ring.points,
            )

            if (tangent !== undefined) {
                const dx = point.x - this.gizmoDrag.lastX
                const dy = point.y - this.gizmoDrag.lastY
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

        this.gizmoDrag.lastX = point.x
        this.gizmoDrag.lastY = point.y
    }

    private clearSelection(): void {
        if (this.gizmoDrag !== undefined) {
            this.flushPendingGizmoDrag()
            endPoseHistoryGesture('xbot')
        }

        this.cancelPendingGizmoFrame()
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

        for (const option of XBOT_POSE_BONE_OPTIONS) {
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
                    (
                        Math.abs(score - best.score) <= 0.02 &&
                        depth < best.depth
                    )
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
            if (distance <= pickDistance && distance < bestDistance) {
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

        const option = getXBotPoseBoneOption(value)
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

        const { joint, center } = placement

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
                active
                    ? '#ffd166'
                    : hovered
                        ? '#ffffff'
                        : GIZMO_COLORS[ring.axis],
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
        const boneName = this.boneModel.value
        if (boneName === 'none') {
            return []
        }

        const placement = this.getGizmoPlacement()
        const frame = this.renderer.getBoneFrame(boneName)
        if (placement === undefined || frame === undefined) {
            return []
        }

        const jointProjected = this.projectWorldPoint(frame.head)
        if (jointProjected === undefined) {
            return []
        }

        const projectedAxis = (
            point: vec3,
        ): { x: number, y: number } | undefined => {
            const projected = this.projectWorldPoint(point)
            if (projected === undefined) {
                return undefined
            }

            return {
                x: projected.x - jointProjected.x,
                y: projected.y - jointProjected.y,
            }
        }

        const localX = projectedAxis(frame.axisX)
        const localY = projectedAxis(frame.axisY)
        const localZ = projectedAxis(frame.axisZ)

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
                    x:
                        placement.center.x +
                        (u.x * cos + v.x * sin) * scale,
                    y:
                        placement.center.y +
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

            rings.push({ axis, points, label })
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

        const candidateA: ScreenPoint = {
            x: joint.x + perpX * GIZMO_OFFSET,
            y: joint.y + perpY * GIZMO_OFFSET,
            depth: joint.depth,
        }
        const candidateB: ScreenPoint = {
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

            return (
                (inside ? 10000 : 0) +
                Math.hypot(candidate.x - centerX, candidate.y - centerY)
            )
        }

        const preferred =
            score(candidateA) >= score(candidateB)
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
        const frame = this.renderer.getBoneFrame(this.boneModel.value)
        if (frame === undefined) {
            return undefined
        }
        return this.projectWorldPoint(frame.head)
    }

    private projectBone(
        boneName: string,
    ): { head: ScreenPoint, tail: ScreenPoint } | undefined {
        const frame = this.renderer.getBoneFrame(boneName)
        if (frame === undefined) {
            return undefined
        }

        const head = this.projectWorldPoint(frame.head)
        const tail = this.projectWorldPoint(frame.tail)
        if (head === undefined || tail === undefined) {
            return undefined
        }

        return { head, tail }
    }

    private projectWorldPoint(world: vec3): ScreenPoint | undefined {
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
            vec4.fromValues(world[0], world[1], world[2], 1),
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
