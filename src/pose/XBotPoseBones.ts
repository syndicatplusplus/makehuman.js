import { PoseBoneOption } from './PoseBones'

export const XBOT_POSE_BONE_OPTIONS: readonly PoseBoneOption[] = [
    { value: 'none', label: 'None', pickBones: [], hitRadius: 0 },

    { value: 'mixamorig:Hips', label: 'Hips / lower torso', pickBones: ['mixamorig:Hips', 'mixamorig:Spine'], hitRadius: 60 },
    { value: 'mixamorig:Spine2', label: 'Chest', pickBones: ['mixamorig:Spine', 'mixamorig:Spine1', 'mixamorig:Spine2'], hitRadius: 65 },
    { value: 'mixamorig:Neck', label: 'Neck', pickBones: ['mixamorig:Neck'], hitRadius: 34 },
    { value: 'mixamorig:Head', label: 'Head', pickBones: ['mixamorig:Head'], hitRadius: 50 },

    { value: 'mixamorig:LeftShoulder', label: 'Left shoulder', pickBones: ['mixamorig:LeftShoulder'], hitRadius: 38 },
    { value: 'mixamorig:LeftArm', label: 'Left upper arm', pickBones: ['mixamorig:LeftArm'], hitRadius: 34 },
    { value: 'mixamorig:LeftForeArm', label: 'Left forearm', pickBones: ['mixamorig:LeftForeArm'], hitRadius: 32 },
    { value: 'mixamorig:LeftHand', label: 'Left wrist', pickBones: ['mixamorig:LeftHand'], hitRadius: 30 },

    { value: 'mixamorig:RightShoulder', label: 'Right shoulder', pickBones: ['mixamorig:RightShoulder'], hitRadius: 38 },
    { value: 'mixamorig:RightArm', label: 'Right upper arm', pickBones: ['mixamorig:RightArm'], hitRadius: 34 },
    { value: 'mixamorig:RightForeArm', label: 'Right forearm', pickBones: ['mixamorig:RightForeArm'], hitRadius: 32 },
    { value: 'mixamorig:RightHand', label: 'Right wrist', pickBones: ['mixamorig:RightHand'], hitRadius: 30 },

    { value: 'mixamorig:LeftUpLeg', label: 'Left thigh', pickBones: ['mixamorig:LeftUpLeg'], hitRadius: 42 },
    { value: 'mixamorig:LeftLeg', label: 'Left shin', pickBones: ['mixamorig:LeftLeg'], hitRadius: 38 },
    { value: 'mixamorig:LeftFoot', label: 'Left foot', pickBones: ['mixamorig:LeftFoot', 'mixamorig:LeftToeBase'], hitRadius: 38 },

    { value: 'mixamorig:RightUpLeg', label: 'Right thigh', pickBones: ['mixamorig:RightUpLeg'], hitRadius: 42 },
    { value: 'mixamorig:RightLeg', label: 'Right shin', pickBones: ['mixamorig:RightLeg'], hitRadius: 38 },
    { value: 'mixamorig:RightFoot', label: 'Right foot', pickBones: ['mixamorig:RightFoot', 'mixamorig:RightToeBase'], hitRadius: 38 },
]

export const XBOT_POSE_BONES: ReadonlyArray<[string, string]> =
    XBOT_POSE_BONE_OPTIONS.map(({ value, label }) => [value, label])

export function getXBotPoseBoneOption(value: string): PoseBoneOption | undefined {
    return XBOT_POSE_BONE_OPTIONS.find((option) => option.value === value)
}
