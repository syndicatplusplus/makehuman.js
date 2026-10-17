export type PoseHistoryMode = 'human' | 'xbot'

export interface PoseHistoryAdapter {
    capture: () => string
    restore: (snapshot: string) => void
}

interface PoseHistoryState {
    adapter?: PoseHistoryAdapter
    past: string[]
    present?: string
    future: string[]
    pendingTimer?: number
    gestureDepth: number
    dirtyDuringGesture: boolean
}

export const POSE_HISTORY_CHANGED_EVENT = 'nyanposer-pose-history-changed'

const MAX_HISTORY = 100
const COALESCE_MS = 275

const states: Record<PoseHistoryMode, PoseHistoryState> = {
    human: {
        past: [],
        future: [],
        gestureDepth: 0,
        dirtyDuringGesture: false,
    },
    xbot: {
        past: [],
        future: [],
        gestureDepth: 0,
        dirtyDuringGesture: false,
    },
}

let activeMode: PoseHistoryMode | undefined
let restoring = false

function announceHistoryChanged() {
    window.dispatchEvent(new Event(POSE_HISTORY_CHANGED_EVENT))
}

function cancelPendingTimer(state: PoseHistoryState) {
    if (state.pendingTimer !== undefined) {
        window.clearTimeout(state.pendingTimer)
        state.pendingTimer = undefined
    }
}

function pushPresentToPast(state: PoseHistoryState) {
    if (state.present === undefined) {
        return
    }

    state.past.push(state.present)

    if (state.past.length > MAX_HISTORY) {
        state.past.splice(0, state.past.length - MAX_HISTORY)
    }
}

export function registerPoseHistoryAdapter(
    mode: PoseHistoryMode,
    adapter: PoseHistoryAdapter,
) {
    const state = states[mode]

    cancelPendingTimer(state)
    state.adapter = adapter
    state.past = []
    state.future = []
    state.gestureDepth = 0
    state.dirtyDuringGesture = false
    state.present = adapter.capture()

    announceHistoryChanged()
}

export function queuePoseHistoryRecord(mode: PoseHistoryMode) {
    if (restoring) {
        return
    }

    const state = states[mode]
    if (state.adapter === undefined) {
        return
    }

    if (state.gestureDepth > 0) {
        state.dirtyDuringGesture = true
        return
    }

    cancelPendingTimer(state)
    state.pendingTimer = window.setTimeout(() => {
        state.pendingTimer = undefined
        commitPoseHistory(mode)
    }, COALESCE_MS)
}

export function commitPoseHistory(mode: PoseHistoryMode) {
    if (restoring) {
        return
    }

    const state = states[mode]
    const adapter = state.adapter
    if (adapter === undefined) {
        return
    }

    cancelPendingTimer(state)
    state.dirtyDuringGesture = false

    const next = adapter.capture()

    if (state.present === undefined) {
        state.present = next
        announceHistoryChanged()
        return
    }

    if (next === state.present) {
        return
    }

    pushPresentToPast(state)
    state.present = next
    state.future = []

    announceHistoryChanged()
}

export function beginPoseHistoryGesture(mode: PoseHistoryMode) {
    const state = states[mode]

    // If another control had a short coalescing window open, finish that edit
    // before beginning the explicit gizmo drag transaction.
    if (state.pendingTimer !== undefined) {
        commitPoseHistory(mode)
    }

    state.gestureDepth += 1
}

export function endPoseHistoryGesture(mode: PoseHistoryMode) {
    const state = states[mode]

    if (state.gestureDepth > 0) {
        state.gestureDepth -= 1
    }

    if (state.gestureDepth === 0 && state.dirtyDuringGesture) {
        commitPoseHistory(mode)
    }
}

function flushPending(mode: PoseHistoryMode) {
    const state = states[mode]

    if (state.pendingTimer !== undefined) {
        commitPoseHistory(mode)
    } else if (
        state.gestureDepth === 0 &&
        state.dirtyDuringGesture
    ) {
        commitPoseHistory(mode)
    }
}

export function setActivePoseHistoryMode(
    mode: PoseHistoryMode | undefined,
) {
    if (activeMode !== undefined && activeMode !== mode) {
        flushPending(activeMode)
    }

    activeMode = mode
    announceHistoryChanged()
}

export function getActivePoseHistoryMode(): PoseHistoryMode | undefined {
    return activeMode
}

export function canUndoPose(mode: PoseHistoryMode): boolean {
    return states[mode].past.length > 0
}

export function canRedoPose(mode: PoseHistoryMode): boolean {
    return states[mode].future.length > 0
}

export function canUndoActivePose(): boolean {
    return activeMode !== undefined && canUndoPose(activeMode)
}

export function canRedoActivePose(): boolean {
    return activeMode !== undefined && canRedoPose(activeMode)
}

export function undoPose(mode: PoseHistoryMode) {
    flushPending(mode)

    const state = states[mode]
    const adapter = state.adapter

    if (
        adapter === undefined ||
        state.present === undefined ||
        state.past.length === 0
    ) {
        return
    }

    const previous = state.past.pop()!
    state.future.push(state.present)
    state.present = previous

    restoring = true
    try {
        adapter.restore(previous)
    } finally {
        restoring = false
    }

    announceHistoryChanged()
}

export function redoPose(mode: PoseHistoryMode) {
    flushPending(mode)

    const state = states[mode]
    const adapter = state.adapter

    if (
        adapter === undefined ||
        state.present === undefined ||
        state.future.length === 0
    ) {
        return
    }

    const next = state.future.pop()!
    pushPresentToPast(state)
    state.present = next

    restoring = true
    try {
        adapter.restore(next)
    } finally {
        restoring = false
    }

    announceHistoryChanged()
}

export function undoActivePose() {
    if (activeMode !== undefined) {
        undoPose(activeMode)
    }
}

export function redoActivePose() {
    if (activeMode !== undefined) {
        redoPose(activeMode)
    }
}
