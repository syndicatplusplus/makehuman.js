import { mat4 } from 'gl-matrix'
import { Application } from 'Application'
import { RenderHandler } from './RenderHandler'
import { RenderMesh } from './RenderMesh'
import { RenderView } from './RenderView'
import { di } from 'lib/di'

const XBOT_URL = 'static/external-models/xbot/xbot.nyanposer.json'
const MANNEQUIN_COLOR = [0.88, 0.64, 0.62, 1]
const TARGET_HEIGHT = 15

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
    meshes: NyanposerMesh[]
}

export class RenderXBot extends RenderHandler {
    private data?: NyanposerRigFile
    private meshes?: RenderMesh[]
    private loadError?: Error

    constructor() {
        super()
        void this.load()
    }

    override defaultCamera(): () => mat4 {
        return di.get(Application).bodyCamera
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

            this.data = data
            di.get(Application).updateManager.invalidateView()

            console.log(
                `Loaded X Bot: ${data.meshes.length} meshes from ${XBOT_URL}`
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

        if (this.loadError !== undefined || this.data === undefined) {
            return
        }

        if (this.meshes === undefined) {
            this.meshes = this.createMeshes(view, this.data)
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

    private createMeshes(
        view: RenderView,
        data: NyanposerRigFile
    ): RenderMesh[] {
        const converted: Float32Array[] = []

        let minX = Number.POSITIVE_INFINITY
        let minY = Number.POSITIVE_INFINITY
        let minZ = Number.POSITIVE_INFINITY
        let maxX = Number.NEGATIVE_INFINITY
        let maxY = Number.NEGATIVE_INFINITY
        let maxZ = Number.NEGATIVE_INFINITY

        for (const mesh of data.meshes) {
            const src = mesh.positions
            const dst = new Float32Array(src.length)

            for (let i = 0; i < src.length; i += 3) {
                // Blender: X right, Y depth, Z up
                // NYANPOSER: X right, Y up, Z depth
                const x = src[i]
                const y = src[i + 2]
                const z = -src[i + 1]

                dst[i] = x
                dst[i + 1] = y
                dst[i + 2] = z

                minX = Math.min(minX, x)
                minY = Math.min(minY, y)
                minZ = Math.min(minZ, z)
                maxX = Math.max(maxX, x)
                maxY = Math.max(maxY, y)
                maxZ = Math.max(maxZ, z)
            }

            converted.push(dst)
        }

        const height = maxY - minY
        if (!Number.isFinite(height) || height <= 0) {
            throw new Error('X Bot has an invalid bounding box')
        }

        const scale = TARGET_HEIGHT / height
        const centerX = (minX + maxX) * 0.5
        const centerY = (minY + maxY) * 0.5
        const centerZ = (minZ + maxZ) * 0.5

        console.log(
            `X Bot bounds: height=${height.toFixed(3)}, scale=${scale.toFixed(3)}`
        )

        return data.meshes.map((mesh, meshIndex) => {
            const vertex = converted[meshIndex]

            for (let i = 0; i < vertex.length; i += 3) {
                vertex[i] = (vertex[i] - centerX) * scale
                vertex[i + 1] = (vertex[i + 1] - centerY) * scale
                vertex[i + 2] = (vertex[i + 2] - centerZ) * scale
            }

            return new RenderMesh(
                view.gl,
                vertex,
                mesh.indices,
                undefined,
                undefined,
                false
            )
        })
    }
}
