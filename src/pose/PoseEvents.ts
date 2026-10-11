export const POSE_CHANGED_EVENT = 'makehuman-pose-changed'

export function announcePoseChanged() {
    window.dispatchEvent(new Event(POSE_CHANGED_EVENT))
}
