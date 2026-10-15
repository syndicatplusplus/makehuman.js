import { PoseBoneOption } from './PoseBones'

type HandSide = 'Left' | 'Right'
type FingerName = 'Thumb' | 'Index' | 'Middle' | 'Ring' | 'Pinky'

const FINGERS: readonly FingerName[] = [
    'Thumb',
    'Index',
    'Middle',
    'Ring',
    'Pinky',
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

    for (const finger of FINGERS) {
        for (let joint = 1; joint <= 3; ++joint) {
            const boneName =
                `mixamorig:${side}Hand${finger}${joint}`

            result.push({
                value: boneName,
                label:
                    `${sideLabel} ${finger.toLowerCase()} ` +
                    JOINT_LABELS[joint - 1],
                pickBones: [boneName],
                hitRadius: finger === 'Thumb' ? 24 : 20,
            })
        }
    }

    return result
}

export const XBOT_POSE_BONE_OPTIONS: readonly PoseBoneOption[] = [
    { value: 'none', label: 'None', pickBones: [], hitRadius: 0 },

    /*
     * Torso hierarchy:
     *
     * Hips  -> root/pelvis orientation. Rotating this carries the whole rig.
     * Spine -> waist/lower-spine bend. The upper body follows while the
     *          pelvis and legs remain planted.
     * Spine2 -> upper chest bend.
     */
    {
        value: 'mixamorig:Hips',
        label: 'Whole body / pelvis',
        pickBones: ['mixamorig:Hips'],
        hitRadius: 58,
    },
    {
        value: 'mixamorig:Spine',
        label: 'Waist / lower torso',
        pickBones: ['mixamorig:Spine', 'mixamorig:Spine1'],
        hitRadius: 58,
    },
    {
        value: 'mixamorig:Spine2',
        label: 'Chest',
        pickBones: ['mixamorig:Spine2'],
        hitRadius: 60,
    },

    {
        value: 'mixamorig:Neck',
        label: 'Neck',
        pickBones: ['mixamorig:Neck'],
        hitRadius: 34,
    },
    {
        value: 'mixamorig:Head',
        label: 'Head',
        pickBones: ['mixamorig:Head'],
        hitRadius: 50,
    },

    {
        value: 'mixamorig:LeftShoulder',
        label: 'Left shoulder',
        pickBones: ['mixamorig:LeftShoulder'],
        hitRadius: 38,
    },
    {
        value: 'mixamorig:LeftArm',
        label: 'Left upper arm',
        pickBones: ['mixamorig:LeftArm'],
        hitRadius: 34,
    },
    {
        value: 'mixamorig:LeftForeArm',
        label: 'Left forearm',
        pickBones: ['mixamorig:LeftForeArm'],
        hitRadius: 32,
    },
    {
        value: 'mixamorig:LeftHand',
        label: 'Left wrist',
        pickBones: ['mixamorig:LeftHand'],
        hitRadius: 30,
    },

    ...fingerPoseOptions('Left', 'Left'),

    {
        value: 'mixamorig:RightShoulder',
        label: 'Right shoulder',
        pickBones: ['mixamorig:RightShoulder'],
        hitRadius: 38,
    },
    {
        value: 'mixamorig:RightArm',
        label: 'Right upper arm',
        pickBones: ['mixamorig:RightArm'],
        hitRadius: 34,
    },
    {
        value: 'mixamorig:RightForeArm',
        label: 'Right forearm',
        pickBones: ['mixamorig:RightForeArm'],
        hitRadius: 32,
    },
    {
        value: 'mixamorig:RightHand',
        label: 'Right wrist',
        pickBones: ['mixamorig:RightHand'],
        hitRadius: 30,
    },

    ...fingerPoseOptions('Right', 'Right'),

    {
        value: 'mixamorig:LeftUpLeg',
        label: 'Left thigh',
        pickBones: ['mixamorig:LeftUpLeg'],
        hitRadius: 42,
    },
    {
        value: 'mixamorig:LeftLeg',
        label: 'Left shin',
        pickBones: ['mixamorig:LeftLeg'],
        hitRadius: 38,
    },
    {
        value: 'mixamorig:LeftFoot',
        label: 'Left foot',
        pickBones: [
            'mixamorig:LeftFoot',
            'mixamorig:LeftToeBase',
        ],
        hitRadius: 38,
    },

    {
        value: 'mixamorig:RightUpLeg',
        label: 'Right thigh',
        pickBones: ['mixamorig:RightUpLeg'],
        hitRadius: 42,
    },
    {
        value: 'mixamorig:RightLeg',
        label: 'Right shin',
        pickBones: ['mixamorig:RightLeg'],
        hitRadius: 38,
    },
    {
        value: 'mixamorig:RightFoot',
        label: 'Right foot',
        pickBones: [
            'mixamorig:RightFoot',
            'mixamorig:RightToeBase',
        ],
        hitRadius: 38,
    },
]

export const XBOT_POSE_BONES: ReadonlyArray<[string, string]> =
    XBOT_POSE_BONE_OPTIONS.map(({ value, label }) => [value, label])

export function getXBotPoseBoneOption(
    value: string,
): PoseBoneOption | undefined {
    return XBOT_POSE_BONE_OPTIONS.find(
        (option) => option.value === value,
    )
}
