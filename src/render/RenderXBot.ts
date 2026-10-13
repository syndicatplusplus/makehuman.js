import { mat4, vec3, vec4 } from 'gl-matrix'
import { Application } from 'Application'
import { RenderHandler } from './RenderHandler'
import { RenderMesh } from './RenderMesh'
import { RenderView } from './RenderView'
import { di } from 'lib/di'

const XBOT_URL = 'static/external-models/xbot/xbot.nyanposer.json'
const MANNEQUIN_COLOR = [0.88, 0.64, 0.62, 1]
const TARGET_HEIGHT = 15

export interface XBotRotation {
    x: number
    y: number
    z: number
}

export interface XBotBoneFrame {
    head: vec3
    tail: vec3
    axisX: vec3
    axisY: vec3
    axisZ: vec3
}

export interface XBotPoseFile {
    format: 'nyanposer-pose'
    version: 1
    model: 'xbot'
    bones: Record<string, XBotRotation>
}

interface NyanposerBone {
    name: string
    parent: number
    head: number[]
    tail: number[]
    bindMatrix: number[]
    inverseBindMatrix: number[]
}

interface NyanposerMesh {
    name: string
    positions: number[]
    normals: number[]
    indices: number[]
    influences: [number, number][][]
}

interface NyanposerRigFile {
    format: string
    version: number
    source: string
    coordinateSpace: string
    armature: {
        name: string
        bones: NyanposerBone[]
    }
    meshes: NyanposerMesh[]
}

interface Normalization {
    scale: number
    centerX: number
    centerY: number
    centerZ: number
}

function jsonMatrix(values: number[]): mat4 {
    if (values.length !== 16) {
        throw new Error(`Expected a 4x4 matrix, got ${values.length} values`)
    }

    const result = mat4.create()
    for (let i = 0; i < 16; ++i) {
        result[i] = values[i]
    }
    return result
}

function isFiniteRotation(value: unknown): value is XBotRotation {
    if (
        typeof value !== 'object' ||
        value === null
    ) {
        return false
    }

    const rotation = value as Partial<XBotRotation>

    return (
        typeof rotation.x === 'number' &&
        Number.isFinite(rotation.x) &&
        typeof rotation.y === 'number' &&
        Number.isFinite(rotation.y) &&
        typeof rotation.z === 'number' &&
        Number.isFinite(rotation.z)
    )
}

export class RenderXBot extends RenderHandler {
    private data?: NyanposerRigFile
    private meshes?: RenderMesh[]
    private normalization?: Normalization
    private loadError?: Error

    private poseDegrees = new Map<string, XBotRotation>()
    private poseDirty = true
    private poseGlobalCache?: mat4[]

    constructor() {
        super()
        void this.load()
    }

    override defaultCamera(): () => mat4 {
        return di.get(Application).bodyCamera
    }

    hasBone(name: string): boolean {
        return this.data?.armature.bones.some((bone) => bone.name === name) ?? false
    }

    getBoneRotation(name: string): XBotRotation {
        const rotation = this.poseDegrees.get(name)
        if (rotation === undefined) {
            return { x: 0, y: 0, z: 0 }
        }
        return { ...rotation }
    }

    setBoneRotation(name: string, x: number, y: number, z: number): void {
        this.poseDegrees.set(name, { x, y, z })
        this.poseDirty = true
        this.poseGlobalCache = undefined
        this.invalidate()
    }

    resetBone(name: string): void {
        this.poseDegrees.delete(name)
        this.poseDirty = true
        this.poseGlobalCache = undefined
        this.invalidate()
    }

    resetPose(): void {
        this.poseDegrees.clear()
        this.poseDirty = true
        this.poseGlobalCache = undefined
        this.invalidate()
    }

    exportPose(): XBotPoseFile {
        const bones: Record<string, XBotRotation> = {}

        for (const [name, rotation] of this.poseDegrees.entries()) {
            // Keep the files compact. Bones that are effectively at rest do
            // not need to be written at all.
            if (
                Math.abs(rotation.x) < 0.000001 &&
                Math.abs(rotation.y) < 0.000001 &&
                Math.abs(rotation.z) < 0.000001
            ) {
                continue
            }

            bones[name] = { ...rotation }
        }

        return {
            format: 'nyanposer-pose',
            version: 1,
            model: 'xbot',
            bones,
        }
    }

    importPose(pose: unknown): void {
        if (this.data === undefined) {
            throw new Error('X Bot is still loading. Try again in a moment.')
        }

        if (
            typeof pose !== 'object' ||
            pose === null
        ) {
            throw new Error('That file does not contain a NYANPOSER pose.')
        }

        const candidate = pose as Partial<XBotPoseFile>

        if (candidate.format !== 'nyanposer-pose') {
            throw new Error('That file is not a NYANPOSER pose file.')
        }

        if (candidate.version !== 1) {
            throw new Error(
                `Unsupported NYANPOSER pose version: ${candidate.version}`
            )
        }

        if (candidate.model !== 'xbot') {
            throw new Error(
                `This pose is for '${candidate.model ?? 'an unknown model'}', not X Bot.`
            )
        }

        if (
            typeof candidate.bones !== 'object' ||
            candidate.bones === null ||
            Array.isArray(candidate.bones)
        ) {
            throw new Error('The pose file has no valid bone data.')
        }

        const nextPose = new Map<string, XBotRotation>()
        let recognizedBones = 0

        for (const [name, rotation] of Object.entries(candidate.bones)) {
            if (!this.hasBone(name)) {
                // Forward compatibility: a future rig may contain additional
                // bones. Ignore names the current X Bot does not understand.
                continue
            }

            if (!isFiniteRotation(rotation)) {
                throw new Error(
                    `The pose contains invalid rotation data for '${name}'.`
                )
            }

            nextPose.set(name, {
                x: rotation.x,
                y: rotation.y,
                z: rotation.z,
            })
            recognizedBones += 1
        }

        // An entirely neutral pose legitimately contains zero saved bones.
        // A non-empty file where none of the names match is more likely to be
        // the wrong rig, so reject that case rather than silently doing nothing.
        if (
            Object.keys(candidate.bones).length > 0 &&
            recognizedBones === 0
        ) {
            throw new Error(
                'None of the bones in this pose match the current X Bot rig.'
            )
        }

        this.poseDegrees = nextPose
        this.poseDirty = true
        this.poseGlobalCache = undefined
        this.invalidate()
    }

    getBoneFrame(name: string): XBotBoneFrame | undefined {
        if (this.data === undefined || this.normalization === undefined) {
            return undefined
        }

        const boneIndex = this.data.armature.bones.findIndex(
            (bone) => bone.name === name,
        )
        if (boneIndex < 0) {
            return undefined
        }

        const bones = this.data.armature.bones
        const poseGlobal = this.getPoseGlobals(this.data)
        const transform = poseGlobal[boneIndex]
        const inverseBind = jsonMatrix(bones[boneIndex].inverseBindMatrix)

        const tailWorld = vec4.fromValues(
            bones[boneIndex].tail[0],
            bones[boneIndex].tail[1],
            bones[boneIndex].tail[2],
            1,
        )
        const tailLocal = vec4.transformMat4(vec4.create(), tailWorld, inverseBind)

        const headWorld = vec4.transformMat4(
            vec4.create(),
            vec4.fromValues(0, 0, 0, 1),
            transform,
        )
        const posedTailWorld = vec4.transformMat4(
            vec4.create(),
            tailLocal,
            transform,
        )

        const axisXWorld = vec4.transformMat4(
            vec4.create(),
            vec4.fromValues(1, 0, 0, 1),
            transform,
        )
        const axisYWorld = vec4.transformMat4(
            vec4.create(),
            vec4.fromValues(0, 1, 0, 1),
            transform,
        )
        const axisZWorld = vec4.transformMat4(
            vec4.create(),
            vec4.fromValues(0, 0, 1, 1),
            transform,
        )

        return {
            head: this.normalizeWorldPoint(headWorld),
            tail: this.normalizeWorldPoint(posedTailWorld),
            axisX: this.normalizeWorldPoint(axisXWorld),
            axisY: this.normalizeWorldPoint(axisYWorld),
            axisZ: this.normalizeWorldPoint(axisZWorld),
        }
    }

    private invalidate(): void {
        const app = di.get(Application)
        app.glview?.invalidate()
        app.updateManager.invalidateView()
    }

    private async load() {
        try {
            const response = await fetch(XBOT_URL)
            if (!response.ok) {
                throw new Error(
                    `Failed to load X Bot: ${response.status} ${response.statusText}`
                )
            }

            const data = (await response.json()) as NyanposerRigFile
            if (data.format !== 'nyanposer-rig') {
                throw new Error(`Unexpected X Bot file format: ${data.format}`)
            }
            if (!Array.isArray(data.meshes) || data.meshes.length === 0) {
                throw new Error('X Bot file contains no meshes')
            }
            if (!data.armature?.bones?.length) {
                throw new Error('X Bot file contains no bones')
            }

            this.data = data
            this.normalization = this.computeRestNormalization(data)
            this.poseDirty = true
            this.poseGlobalCache = undefined
            this.invalidate()

            console.log(
                `Loaded X Bot: ${data.meshes.length} meshes, ` +
                `${data.armature.bones.length} bones`
            )
        } catch (error) {
            this.loadError =
                error instanceof Error ? error : new Error(String(error))
            console.error(this.loadError)
        }
    }

    override paint(app: Application, view: RenderView): void {
        if (view.overlay.children.length !== 0) {
            view.overlay.replaceChildren()
        }

        view.prepareCanvas()
        const { projectionMatrix, modelViewMatrix, normalMatrix } = view.prepare()

        view.shaderShadedMono.init(
            view.gl,
            projectionMatrix,
            modelViewMatrix,
            normalMatrix
        )

        if (
            this.loadError !== undefined ||
            this.data === undefined ||
            this.normalization === undefined
        ) {
            return
        }

        if (this.meshes === undefined) {
            const vertices = this.calculatePosedVertices(
                this.data,
                this.normalization,
            )

            this.meshes = this.data.meshes.map(
                (mesh, index) =>
                    new RenderMesh(
                        view.gl,
                        vertices[index],
                        mesh.indices,
                        undefined,
                        undefined,
                        false,
                    ),
            )
            this.poseDirty = false
        } else if (this.poseDirty) {
            const vertices = this.calculatePosedVertices(
                this.data,
                this.normalization,
            )
            this.meshes.forEach((mesh, index) => {
                mesh.update(vertices[index])
            })
            this.poseDirty = false
        }

        const gl = view.gl
        gl.disable(gl.CULL_FACE)
        gl.disable(gl.BLEND)
        gl.depthMask(true)
        gl.enable(gl.DEPTH_TEST)

        const shader = view.shaderShadedMono
        shader.use(gl)
        shader.setColor(gl, MANNEQUIN_COLOR)

        for (const mesh of this.meshes) {
            mesh.draw(shader, gl.TRIANGLES)
        }
    }

    private computeRestNormalization(data: NyanposerRigFile): Normalization {
        let minX = Number.POSITIVE_INFINITY
        let minY = Number.POSITIVE_INFINITY
        let minZ = Number.POSITIVE_INFINITY
        let maxX = Number.NEGATIVE_INFINITY
        let maxY = Number.NEGATIVE_INFINITY
        let maxZ = Number.NEGATIVE_INFINITY

        for (const mesh of data.meshes) {
            const src = mesh.positions
            for (let i = 0; i < src.length; i += 3) {
                const x = src[i]
                const y = src[i + 2]
                const z = -src[i + 1]

                minX = Math.min(minX, x)
                minY = Math.min(minY, y)
                minZ = Math.min(minZ, z)
                maxX = Math.max(maxX, x)
                maxY = Math.max(maxY, y)
                maxZ = Math.max(maxZ, z)
            }
        }

        const height = maxY - minY
        if (!Number.isFinite(height) || height <= 0) {
            throw new Error('X Bot has an invalid rest bounding box')
        }

        return {
            scale: TARGET_HEIGHT / height,
            centerX: (minX + maxX) * 0.5,
            centerY: (minY + maxY) * 0.5,
            centerZ: (minZ + maxZ) * 0.5,
        }
    }

    private normalizeWorldPoint(point: vec4): vec3 {
        if (this.normalization === undefined) {
            return vec3.create()
        }

        const x = point[0]
        const y = point[2]
        const z = -point[1]

        return vec3.fromValues(
            (x - this.normalization.centerX) * this.normalization.scale,
            (y - this.normalization.centerY) * this.normalization.scale,
            (z - this.normalization.centerZ) * this.normalization.scale,
        )
    }

    private getPoseGlobals(data: NyanposerRigFile): mat4[] {
        if (this.poseGlobalCache === undefined) {
            this.poseGlobalCache = this.buildPoseGlobals(data)
        }
        return this.poseGlobalCache
    }

    private buildPoseGlobals(data: NyanposerRigFile): mat4[] {
        const bones = data.armature.bones
        const bindGlobal = bones.map((bone) => jsonMatrix(bone.bindMatrix))

        const localRest = bones.map((bone, index) => {
            if (bone.parent < 0) {
                return mat4.clone(bindGlobal[index])
            }

            const parentInverse = mat4.invert(
                mat4.create(),
                bindGlobal[bone.parent],
            )
            if (parentInverse === null) {
                throw new Error(
                    `Could not invert parent bind matrix for ${bone.name}`
                )
            }

            return mat4.multiply(
                mat4.create(),
                parentInverse,
                bindGlobal[index],
            )
        })

        const localPose = localRest.map((rest, index) => {
            const result = mat4.clone(rest)
            const rotation = this.getBoneRotation(bones[index].name)

            mat4.rotateX(result, result, rotation.x * Math.PI / 180)
            mat4.rotateY(result, result, rotation.y * Math.PI / 180)
            mat4.rotateZ(result, result, rotation.z * Math.PI / 180)
            return result
        })

        const poseGlobal: mat4[] = bones.map(() => mat4.create())
        bones.forEach((bone, index) => {
            if (bone.parent < 0) {
                mat4.copy(poseGlobal[index], localPose[index])
            } else {
                mat4.multiply(
                    poseGlobal[index],
                    poseGlobal[bone.parent],
                    localPose[index],
                )
            }
        })

        return poseGlobal
    }

    private calculatePosedVertices(
        data: NyanposerRigFile,
        normalization: Normalization,
    ): Float32Array[] {
        const bones = data.armature.bones
        const poseGlobal = this.getPoseGlobals(data)
        const inverseBindGlobal = bones.map((bone) =>
            jsonMatrix(bone.inverseBindMatrix)
        )

        const skinMatrices = bones.map((bone, index) =>
            mat4.multiply(
                mat4.create(),
                poseGlobal[index],
                inverseBindGlobal[index],
            )
        )

        return data.meshes.map((mesh) => {
            const src = mesh.positions
            const dst = new Float32Array(src.length)

            for (let vertexIndex = 0; vertexIndex < src.length / 3; ++vertexIndex) {
                const offset = vertexIndex * 3
                const source = vec4.fromValues(
                    src[offset],
                    src[offset + 1],
                    src[offset + 2],
                    1,
                )
                const influences = mesh.influences[vertexIndex]

                let worldX = source[0]
                let worldY = source[1]
                let worldZ = source[2]

                if (influences && influences.length > 0) {
                    worldX = 0
                    worldY = 0
                    worldZ = 0
                    let totalWeight = 0

                    for (const [boneIndex, weight] of influences) {
                        const transformed = vec4.transformMat4(
                            vec4.create(),
                            source,
                            skinMatrices[boneIndex],
                        )

                        worldX += transformed[0] * weight
                        worldY += transformed[1] * weight
                        worldZ += transformed[2] * weight
                        totalWeight += weight
                    }

                    if (totalWeight > 0) {
                        worldX /= totalWeight
                        worldY /= totalWeight
                        worldZ /= totalWeight
                    }
                }

                const x = worldX
                const y = worldZ
                const z = -worldY

                dst[offset] =
                    (x - normalization.centerX) * normalization.scale
                dst[offset + 1] =
                    (y - normalization.centerY) * normalization.scale
                dst[offset + 2] =
                    (z - normalization.centerZ) * normalization.scale
            }

            return dst
        })
    }
}
