import { Application } from 'Application'
import { matrix2euler } from 'gl/algorithms/euler'
import { rad2deg } from 'gl/algorithms/rad2deg'
import { mat4 } from 'gl-matrix'
import { RenderXBot, XBotRotation } from 'render/RenderXBot'

export type PoseMirrorAction =
    | 'mirror'
    | 'left-to-right'
    | 'right-to-left'

const REFLECT_X = mat4.fromValues(
    -1, 0, 0, 0,
     0, 1, 0, 0,
     0, 0, 1, 0,
     0, 0, 0, 1,
)

function mirroredLocalRotation(
    sourceRest: mat4,
    sourcePose: mat4,
    targetRest: mat4,
): mat4 {
    const sourceRestInverse = mat4.invert(
        mat4.create(),
        sourceRest,
    )
    const targetRestInverse = mat4.invert(
        mat4.create(),
        targetRest,
    )

    if (
        sourceRestInverse === null ||
        targetRestInverse === null
    ) {
        return mat4.create()
    }

    // Convert the source's local pose into a world-space deformation,
    // reflect that deformation across the mannequin's left/right plane,
    // then express it in the target bone's own local rest frame.
    const worldDelta = mat4.multiply(
        mat4.create(),
        sourceRest,
        sourcePose,
    )
    mat4.multiply(
        worldDelta,
        worldDelta,
        sourceRestInverse,
    )

    const reflected = mat4.multiply(
        mat4.create(),
        REFLECT_X,
        worldDelta,
    )
    mat4.multiply(
        reflected,
        reflected,
        REFLECT_X,
    )

    const targetLocal = mat4.multiply(
        mat4.create(),
        targetRestInverse,
        reflected,
    )
    mat4.multiply(
        targetLocal,
        targetLocal,
        targetRest,
    )

    // User pose matrices are rotations only. Tiny translation residue can
    // appear from floating-point math or slightly asymmetric rest positions.
    targetLocal[3] = 0
    targetLocal[7] = 0
    targetLocal[11] = 0
    targetLocal[12] = 0
    targetLocal[13] = 0
    targetLocal[14] = 0
    targetLocal[15] = 1

    return targetLocal
}

function humanOppositeBone(name: string): string {
    if (name.endsWith('.L')) {
        return `${name.slice(0, -2)}.R`
    }
    if (name.endsWith('.R')) {
        return `${name.slice(0, -2)}.L`
    }
    return name
}

function humanSourceForTarget(
    targetName: string,
    action: PoseMirrorAction,
): string | undefined {
    if (action === 'mirror') {
        return humanOppositeBone(targetName)
    }

    if (action === 'left-to-right') {
        return targetName.endsWith('.R')
            ? `${targetName.slice(0, -2)}.L`
            : undefined
    }

    return targetName.endsWith('.L')
        ? `${targetName.slice(0, -2)}.R`
        : undefined
}

export function mirrorHumanPose(
    app: Application,
    action: PoseMirrorAction,
): void {
    const bones = app.skeleton.getBones()

    // Snapshot first so whole-pose mirroring can swap L/R without the first
    // assignment contaminating the source for the second side.
    const sourcePoses = new Map<string, mat4>()
    for (const bone of bones) {
        sourcePoses.set(
            bone.name,
            mat4.clone(bone.matUserPoseRelative),
        )
    }

    for (const target of bones) {
        const sourceName = humanSourceForTarget(
            target.name,
            action,
        )
        if (
            sourceName === undefined ||
            !app.skeleton.hasBone(sourceName)
        ) {
            continue
        }

        const source = app.skeleton.getBone(sourceName)
        const sourcePose = sourcePoses.get(sourceName)

        if (
            sourcePose === undefined ||
            source.matRestGlobal === undefined ||
            target.matRestGlobal === undefined
        ) {
            continue
        }

        target.matUserPoseGlobal = undefined
        target.matUserPoseRelative = mirroredLocalRotation(
            source.matRestGlobal,
            sourcePose,
            target.matRestGlobal,
        )
    }

    app.skeleton.update()
    app.humanMesh.calculateVertexRigged()

    if (app.glview?.renderList) {
        app.glview.renderList.update()
    }

    app.glview?.invalidate()
}

function xbotOppositeBone(name: string): string {
    if (name.includes(':Left')) {
        return name.replace(':Left', ':Right')
    }
    if (name.includes(':Right')) {
        return name.replace(':Right', ':Left')
    }
    return name
}

function xbotSourceForTarget(
    targetName: string,
    action: PoseMirrorAction,
): string | undefined {
    if (action === 'mirror') {
        return xbotOppositeBone(targetName)
    }

    if (action === 'left-to-right') {
        return targetName.includes(':Right')
            ? targetName.replace(':Right', ':Left')
            : undefined
    }

    return targetName.includes(':Left')
        ? targetName.replace(':Left', ':Right')
        : undefined
}

function xbotRotationMatrix(rotation: XBotRotation): mat4 {
    const result = mat4.create()
    mat4.rotateX(result, result, rotation.x * Math.PI / 180)
    mat4.rotateY(result, result, rotation.y * Math.PI / 180)
    mat4.rotateZ(result, result, rotation.z * Math.PI / 180)
    return result
}

function cleanDegrees(value: number): number {
    const degrees = rad2deg(value)
    return Math.abs(degrees) < 0.000001
        ? 0
        : degrees
}

export function mirrorXBotPose(
    renderer: RenderXBot,
    action: PoseMirrorAction,
): void {
    const boneNames = renderer.getBoneNames()

    const sourcePoses = new Map<string, mat4>()
    for (const name of boneNames) {
        sourcePoses.set(
            name,
            xbotRotationMatrix(renderer.getBoneRotation(name)),
        )
    }

    for (const targetName of boneNames) {
        const sourceName = xbotSourceForTarget(
            targetName,
            action,
        )
        if (sourceName === undefined || !renderer.hasBone(sourceName)) {
            continue
        }

        const sourceRest = renderer.getBoneRestMatrix(sourceName)
        const targetRest = renderer.getBoneRestMatrix(targetName)
        const sourcePose = sourcePoses.get(sourceName)

        if (
            sourceRest === undefined ||
            targetRest === undefined ||
            sourcePose === undefined
        ) {
            continue
        }

        const targetPose = mirroredLocalRotation(
            sourceRest,
            sourcePose,
            targetRest,
        )

        // RenderXBot applies rotations as X -> Y -> Z, which corresponds to
        // the rotating-axis rxyz Euler convention.
        const rotation = matrix2euler(targetPose, 'rxyz')
        const x = cleanDegrees(rotation.x)
        const y = cleanDegrees(rotation.y)
        const z = cleanDegrees(rotation.z)

        if (
            Math.abs(x) < 0.000001 &&
            Math.abs(y) < 0.000001 &&
            Math.abs(z) < 0.000001
        ) {
            renderer.resetBone(targetName)
        } else {
            renderer.setBoneRotation(
                targetName,
                x,
                y,
                z,
            )
        }
    }
}
