import { BaseMeshGroup } from "../mesh/BaseMeshGroup"
import { ProxyType } from "proxy/Proxy"
import { RenderHandler } from './RenderHandler'
import { Application } from "Application"
import { RenderMesh } from "./RenderMesh"
import { RenderView } from "./RenderView"
import { di } from "lib/di"
import { Texture } from "gl/Texture"

const MANNEQUIN_COLOR = [0.88, 0.64, 0.62]

export class RenderHuman extends RenderHandler {
    private viewHead: boolean
    constructor(viewHead: boolean = false) {
        super()
        this.viewHead = viewHead
    }
    override defaultCamera() {
        const app = di.get(Application)
        return this.viewHead ? app.headCamera : app.bodyCamera
    }
    override paint(app: Application, view: RenderView): void {
        if (view.overlay.children.length !== 0) {
            view.overlay.replaceChildren()
        }
        const humanMesh = app.humanMesh
        const renderList = view.renderList

        // one proxy has changed
        // TODO: changedProxy should be in updateManager
        if (humanMesh.changedProxy !== undefined) {
            if (humanMesh.proxies.has(humanMesh.changedProxy)) {
                const proxy = humanMesh.proxies.get(humanMesh.changedProxy)!
                renderList.proxies.set(
                    proxy.type,
                    new RenderMesh(
                        view.gl,
                        proxy.getCoords(humanMesh.vertexRigged),
                        proxy.getMesh().fxyz,
                        proxy.getMesh().uv,
                        proxy.getMesh().fuv
                    )
                )
            } else {
                renderList.proxies.delete(humanMesh.changedProxy)
            }
            humanMesh.changedProxy = undefined
        }

        view.prepareCanvas()
        const { projectionMatrix, modelViewMatrix, normalMatrix } = view.prepare()

        view.shaderShadedMono.init(view.gl, projectionMatrix, modelViewMatrix, normalMatrix)
        view.shaderShadedTexture.init(view.gl, projectionMatrix, modelViewMatrix, normalMatrix)

        app.updateManager.updateIt()
        drawHumanCore(app, view)
    }
}

export function drawHumanCore(app: Application, view: RenderView) {
    const gl = view.gl
    const shaderShadedMono = view.shaderShadedMono
    const shaderShadedTexture = view.shaderShadedTexture
    const wireframe = app.wireframe.value

    gl.disable(gl.CULL_FACE)

    let alpha: number
    if (wireframe) {
        gl.enable(gl.BLEND)
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
        alpha = 0.3
        gl.depthMask(false)
    } else {
        gl.disable(gl.BLEND)
        alpha = 1
        gl.depthMask(true)
    }
    shaderShadedTexture.setAlpha(alpha)

    const WORD_LENGTH = 2
    const renderList = view.renderList
    const base = renderList.base
    const baseMesh = app.humanMesh.baseMesh

    interface MeshDefinition {
        group: BaseMeshGroup[],
        proxyType?: ProxyType,
        rgb: number[],
        baseTexture?: Texture,
        proxyTexture?: Texture,
        glMode: number
    }

    // Art-reference mannequin mode:
    // body, eyes, teeth and tongue all use one untextured material.
    // The MakeHuman base mesh can still drive morphs and posing underneath.
    const meshDefinitions: MeshDefinition[] = [{
        group: [BaseMeshGroup.SKIN],
        proxyType: ProxyType.Proxymeshes,
        rgb: MANNEQUIN_COLOR,
        glMode: gl.TRIANGLES
    }, {
        group: [BaseMeshGroup.EYEBALL0, BaseMeshGroup.EYEBALL1],
        proxyType: ProxyType.Eyes,
        rgb: MANNEQUIN_COLOR,
        glMode: gl.TRIANGLES
    }, {
        group: [BaseMeshGroup.TEETH_TOP, BaseMeshGroup.TEETH_BOTTOM],
        proxyType: ProxyType.Teeth,
        rgb: MANNEQUIN_COLOR,
        glMode: gl.TRIANGLES
    }, {
        group: [BaseMeshGroup.TOUNGE],
        proxyType: ProxyType.Tongue,
        rgb: MANNEQUIN_COLOR,
        glMode: gl.TRIANGLES
    }, {
        group: [],
        proxyType: ProxyType.Hair,
        rgb: MANNEQUIN_COLOR,
        glMode: gl.TRIANGLES
    }, {
        group: [],
        proxyType: ProxyType.Eyebrows,
        rgb: MANNEQUIN_COLOR,
        glMode: gl.TRIANGLES
    }, {
        group: [],
        proxyType: ProxyType.Eyelashes,
        rgb: MANNEQUIN_COLOR,
        glMode: gl.TRIANGLES
    }, {
        group: [],
        proxyType: ProxyType.Clothes,
        rgb: MANNEQUIN_COLOR,
        glMode: gl.TRIANGLES
    }, {
        group: [BaseMeshGroup.CUBE],
        rgb: [1, 0, 0.5],
        glMode: gl.LINE_STRIP
    }]

    //
    // Draw any groups that still use textures.
    //
    shaderShadedTexture.use(gl)
    base.glVertex.bind(shaderShadedTexture)
    base.glNormal.bind(shaderShadedTexture)
    base.glUVCoords!.bind(shaderShadedTexture)
    base.glIndices.bind()
    view.bodyTexture.bind()

    for (let def of meshDefinitions) {
        if (def.proxyType !== undefined && renderList.proxies.has(def.proxyType)) {
            continue
        }
        if (def.baseTexture) {
            for (const group of def.group) {
                const offset = baseMesh.groups[group].startIndex * WORD_LENGTH
                const length = baseMesh.groups[group].length
                gl.drawElements(gl.TRIANGLES, (length / 4) * 6, gl.UNSIGNED_SHORT, (offset / 4) * 6)
            }
        }
    }

    //
    // Draw the base mesh as a simple shaded mannequin.
    //
    shaderShadedMono.use(gl)
    base.glVertex.bind(shaderShadedMono)
    base.glNormal.bind(shaderShadedMono)

    for (let def of meshDefinitions) {
        if (def.proxyType !== undefined && renderList.proxies.has(def.proxyType)) {
            continue
        }
        if (!def.baseTexture) {
            for (const group of def.group) {
                shaderShadedMono.setColor(gl, [...def.rgb, alpha])
                const offset = baseMesh.groups[group].startIndex * WORD_LENGTH
                const length = baseMesh.groups[group].length
                gl.drawElements(def.glMode, (length / 4) * 6, gl.UNSIGNED_SHORT, (offset / 4) * 6)
            }
        }
    }

    //
    // Draw proxy meshes as the same untextured mannequin material.
    //
    for (let def of meshDefinitions) {
        if (def.proxyType === undefined || !renderList.proxies.has(def.proxyType)) {
            continue
        }
        const renderMesh = renderList.proxies.get(def.proxyType)!

        if (def.proxyTexture === undefined) {
            shaderShadedMono.use(gl)
            shaderShadedMono.setColor(gl, [...def.rgb, alpha])
            renderMesh.draw(shaderShadedMono, gl.TRIANGLES)
        } else {
            shaderShadedTexture.use(gl)
            def.proxyTexture.bind()
            renderMesh.draw(shaderShadedTexture, gl.TRIANGLES)
        }
    }

    //
    // Draw skeleton when wireframe mode is enabled.
    //
    if (wireframe) {
        renderList.base.bind(shaderShadedMono)

        const NUMBER_OF_JOINTS = BaseMeshGroup.JOINT_LAST - BaseMeshGroup.JOINT_FIRST + 1
        const offset = baseMesh.groups[2].startIndex * WORD_LENGTH
        const length = baseMesh.groups[2].length * NUMBER_OF_JOINTS

        shaderShadedMono.use(gl)
        shaderShadedMono.setColor(gl, [1, 1, 1, 1])

        gl.disable(gl.BLEND)
        gl.depthMask(true)
        gl.enable(gl.DEPTH_TEST)
        renderList.base.drawSubset(gl.TRIANGLES, offset, length)
        renderList.skeleton.draw(shaderShadedMono, gl.LINES)
    }
}
