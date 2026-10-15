export interface PoseBoneOption {
    value: string
    label: string
    pickBones: readonly string[]
    hitRadius: number
}

type HandSide = 'L' | 'R'
type FingerName = 'thumb' | 'index' | 'middle' | 'ring' | 'pinky'

const FINGERS: readonly FingerName[] = [
    'thumb',
    'index',
    'middle',
    'ring',
    'pinky',
]

const JOINT_LABELS = [
    'base',
    'middle',
    'tip',
] as const

function fingerPoseOptions(
    side: HandSide,
    sideLabel: string,
): PoseBoneOption[] {
    const result: PoseBoneOption[] = []

    for (let fingerIndex = 0; fingerIndex < FINGERS.length; ++fingerIndex) {
        const fingerNumber = fingerIndex + 1
        const finger = FINGERS[fingerIndex]

        for (let joint = 1; joint <= 3; ++joint) {
            const boneName =
                `finger${fingerNumber}-${joint}.${side}`

            result.push({
                value: boneName,
                label:
                    `${sideLabel} ${finger} ` +
                    JOINT_LABELS[joint - 1],
                pickBones: [boneName],
                hitRadius: finger === 'thumb' ? 24 : 20,
            })
        }
    }

    return result
}

export const POSE_BONE_OPTIONS: readonly PoseBoneOption[] = [
    { value: 'none', label: 'None', pickBones: [], hitRadius: 0 },

    { value: 'root', label: 'Whole body', pickBones: ['root'], hitRadius: 45 },
    { value: 'spine01', label: 'Hips / lower torso', pickBones: ['pelvis.L', 'pelvis.R', 'spine01', 'spine02'], hitRadius: 60 },
    { value: 'spine03', label: 'Chest', pickBones: ['spine03', 'spine04', 'spine05'], hitRadius: 65 },
    { value: 'neck01', label: 'Neck', pickBones: ['neck01', 'neck02', 'neck03'], hitRadius: 34 },
    { value: 'head', label: 'Head', pickBones: ['head'], hitRadius: 50 },

    { value: 'clavicle.L', label: 'Left shoulder', pickBones: ['clavicle.L', 'shoulder01.L'], hitRadius: 38 },
    { value: 'upperarm01.L', label: 'Left upper arm', pickBones: ['upperarm01.L', 'upperarm02.L'], hitRadius: 34 },
    { value: 'lowerarm01.L', label: 'Left forearm', pickBones: ['lowerarm01.L', 'lowerarm02.L'], hitRadius: 32 },
    { value: 'wrist.L', label: 'Left wrist', pickBones: ['wrist.L'], hitRadius: 30 },

    ...fingerPoseOptions('L', 'Left'),

    { value: 'clavicle.R', label: 'Right shoulder', pickBones: ['clavicle.R', 'shoulder01.R'], hitRadius: 38 },
    { value: 'upperarm01.R', label: 'Right upper arm', pickBones: ['upperarm01.R', 'upperarm02.R'], hitRadius: 34 },
    { value: 'lowerarm01.R', label: 'Right forearm', pickBones: ['lowerarm01.R', 'lowerarm02.R'], hitRadius: 32 },
    { value: 'wrist.R', label: 'Right wrist', pickBones: ['wrist.R'], hitRadius: 30 },

    ...fingerPoseOptions('R', 'Right'),

    { value: 'upperleg01.L', label: 'Left thigh', pickBones: ['upperleg01.L', 'upperleg02.L'], hitRadius: 42 },
    { value: 'lowerleg01.L', label: 'Left shin', pickBones: ['lowerleg01.L', 'lowerleg02.L'], hitRadius: 38 },
    { value: 'foot.L', label: 'Left foot', pickBones: ['foot.L'], hitRadius: 38 },

    { value: 'upperleg01.R', label: 'Right thigh', pickBones: ['upperleg01.R', 'upperleg02.R'], hitRadius: 42 },
    { value: 'lowerleg01.R', label: 'Right shin', pickBones: ['lowerleg01.R', 'lowerleg02.R'], hitRadius: 38 },
    { value: 'foot.R', label: 'Right foot', pickBones: ['foot.R'], hitRadius: 38 },
]

export const POSE_BONES: ReadonlyArray<[string, string]> =
    POSE_BONE_OPTIONS.map(({ value, label }) => [value, label])

export function getPoseBoneOption(value: string): PoseBoneOption | undefined {
    return POSE_BONE_OPTIONS.find((option) => option.value === value)
}
