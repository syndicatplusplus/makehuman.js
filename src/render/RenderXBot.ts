import { mat4, vec4 } from 'gl-matrix'
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

export class RenderXBot extends RenderHandler {
    private data?: NyanposerRigFile
    private meshes?: RenderMesh[]
    private normalization?: Normalization
    private loadError?: Error

    private poseDegrees = new Map<string, XBotRotation>()
    private poseDirty = true

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

    setBoneRotation(
        name: string,
        x: number,
        y: number,
        z: number,
    ): void {
        this.poseDegrees.set(name, { x, y, z })
        this.poseDirty = true
        this.invalidate()
    }

    resetBone(name: string): void {
        this.poseDegrees.delete(name)
        this.poseDirty = true
        this.invalidate()
    }

    resetPose(): void {
        this.poseDegrees.clear()
        this.poseDirty = true
        this.invalidate()
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
                // Blender: X right, Y depth, Z up
                // NYANPOSER: X right, Y up, Z depth
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

    private calculatePosedVertices(
        data: NyanposerRigFile,
        normalization: Normalization,
    ): Float32Array[] {
        const bones = data.armature.bones

        const bindGlobal = bones.map((bone) =>
            jsonMatrix(bone.bindMatrix)
        )

        const inverseBindGlobal = bones.map((bone) =>
            jsonMatrix(bone.inverseBindMatrix)
        )

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

            // Post-multiplication applies these rotations in the bone's
            // imported local coordinate system.
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

            for (
                let vertexIndex = 0;
                vertexIndex < src.length / 3;
                ++vertexIndex
            ) {
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

                // Blender -> NYANPOSER coordinate conversion, followed by the
                // FIXED rest-pose normalization. The model therefore does not
                // re-center itself while you pose it.
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
