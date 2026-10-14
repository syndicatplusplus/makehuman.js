import { mat4, vec3 } from "gl-matrix"
import type { Context } from "./input/Context"
import type { InputHandler } from "./input/InputHandler"
import { deg2rad } from "./algorithms/deg2rad"
import { Fragment, HTMLElementProps, ref } from "toad.jsx/jsx-runtime"
import { View } from "toad.js/viewkit/View"

export interface GLViewProps extends HTMLElementProps {
    ctx: Context
}

export class GLView extends View {
    // DOM
    canvas!: HTMLCanvasElement
    overlay!: HTMLElement
    // status!: HTMLElement
    overlaySVG!: SVGElement
    // GL
    ctx: Context
    gl: WebGL2RenderingContext

    draw?: () => void

    constructor(props: GLViewProps) {
        super(props)
        this.ctx = props.ctx
        this.invalidate = this.invalidate.bind(this)
        this.paint = this.paint.bind(this)

        this.replaceChildren(...(<>
            <canvas
                set={ref(this, 'canvas')}
                style={{ width: '100%', height: '100%' }}
            />
            <div
                set={ref(this, 'overlay')}
                style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    top: 0,
                    bottom: 0,
                    overflow: 'hidden',
                    pointerEvents: 'none',
                }}
            ></div>
            <svg
                set={ref(this, 'overlaySVG')}
                style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    top: 0,
                    bottom: 0,
                    overflow: 'hidden',
                    pointerEvents: 'none',
                    width: '100%',
                    height: '100%',
                }}
            ></svg>
        </> as Fragment) )
        this.setupEventHandling()
        this.gl = this.canvas.getContext("webgl") as WebGL2RenderingContext
        if (this.gl === null) {
            throw Error(
                "Unable to initialize WebGL. Your browser or machine may not support it."
            )
        }
    }

    override connectedCallback(): void {
        this.invalidate()
    }

    prepareCanvas() {
        const canvas = this.canvas
        if (canvas.width !== canvas.clientWidth || canvas.height !== canvas.clientHeight) {
            canvas.width = canvas.clientWidth
            canvas.height = canvas.clientHeight
        }
    }

    prepareProjection() {
        const gl = this.gl
        gl.viewport(0, 0, this.canvas.width, this.canvas.height)
        const bg = this.ctx.background
        gl.clearColor(bg[0], bg[1], bg[2], bg[3]);
        gl.clearDepth(1.0)
        gl.enable(gl.DEPTH_TEST)
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)

        gl.enable(gl.CULL_FACE)
        gl.cullFace(gl.BACK)

        const fieldOfView = deg2rad(45)
        const canvas = this.canvas
        const aspect = canvas.clientWidth / canvas.clientHeight
        const zNear = 0.1
        const zFar = 100.0
        const projectionMatrix = mat4.perspective(
            mat4.create(),
            fieldOfView,
            aspect,
            zNear,
            zFar
        )
        return projectionMatrix
    }

    prepare() {
        const projectionMatrix = this.prepareProjection()
        const modelViewMatrix = this.ctx.camera

        const normalMatrix = mat4.create()
        mat4.invert(normalMatrix, modelViewMatrix)
        mat4.transpose(normalMatrix, normalMatrix)

        return { projectionMatrix, modelViewMatrix, normalMatrix }
    }

    /*
     * InputHandler
     */
    private _inputHandlerStack: InputHandler[] = [];
    pushInputHandler(inputHandler: InputHandler): string | undefined {
        this._inputHandlerStack.push(inputHandler)
        return inputHandler.info()
    }

    popInputHandler(): string | undefined {
        this._inputHandlerStack.pop()?.destructor()
        let handler
        if (this._inputHandlerStack.length > 0) {
            handler = this._inputHandlerStack[this._inputHandlerStack.length - 1]
        }
        return handler?.info()
    }

    protected paint() {
        this._redrawIsPending = false
        if (this.draw) {
            this.draw()
        }
        for (let i = this._inputHandlerStack.length - 1; i >= 0; --i) {
            this._inputHandlerStack[i]!.paint()
        }
    }

    protected _redrawIsPending = false;

    invalidate() {
        if (this._redrawIsPending) {
            return
        }
        this._redrawIsPending = true
        requestAnimationFrame(this.paint)
    }

    selectionCenter(): vec3 {
        for (let i = this._inputHandlerStack.length - 1; i >= 0; --i) {
            const center = this._inputHandlerStack[i]!.selectionCenter()
            if (center !== undefined) {
                return center
            }
        }
        return vec3.create()
    }

    /**
     * setup handling of pointer, keyboard and resize event
     */
    private setupEventHandling() {
        const canvas = this.canvas

        //
        // resize
        //
        new ResizeObserver(this.paint).observe(canvas)

        //
        // pointer
        //
        let buttonDown = false

        canvas.oncontextmenu = (ev: MouseEvent) => {
            ev.preventDefault()
        }

        canvas.onpointerdown = (ev: PointerEvent) => {
            for (let i = this._inputHandlerStack.length - 1; i >= 0; --i) {
                this._inputHandlerStack[i]!.pointerdown(ev)
                if (ev.defaultPrevented) {
                    return
                }
            }

            ev.preventDefault()
            canvas.setPointerCapture(ev.pointerId)
            buttonDown = true
        }

        canvas.onpointerup = (ev: PointerEvent) => {
            for (let i = this._inputHandlerStack.length - 1; i >= 0; --i) {
                this._inputHandlerStack[i]!.pointerup(ev)
                if (ev.defaultPrevented) {
                    return
                }
            }

            ev.preventDefault()
            buttonDown = false
        }

        canvas.onpointermove = (ev: PointerEvent) => {
            for (let i = this._inputHandlerStack.length - 1; i >= 0; --i) {
                this._inputHandlerStack[i]!.pointermove(ev)
                if (ev.defaultPrevented) {
                    return
                }
            }

            ev.preventDefault()
        }

        const cancelPointer = (ev: PointerEvent) => {
            // Cancellation is cleanup, so every input handler receives it.
            // This prevents an interrupted touch from remaining as a
            // "ghost" finger and forcing later gestures into pan/zoom mode.
            for (let i = this._inputHandlerStack.length - 1; i >= 0; --i) {
                this._inputHandlerStack[i]!.pointercancel(ev)
            }

            buttonDown = false
        }

        canvas.onpointercancel = cancelPointer

        // iPadOS/Safari may drop pointer capture while changing input
        // sources, especially while alternating between Pencil and fingers.
        canvas.addEventListener(
            'lostpointercapture',
            cancelPointer as EventListener,
        )

        //
        // keyboard
        //
        window.onkeyup = (ev: KeyboardEvent) => {
            for (let i = this._inputHandlerStack.length - 1; i >= 0; --i) {
                this._inputHandlerStack[i]!.keyup(ev)
                if (ev.defaultPrevented) {
                    break
                }
            }
        }

        window.onkeydown = (ev: KeyboardEvent) => {
            for (let i = this._inputHandlerStack.length - 1; i >= 0; --i) {
                this._inputHandlerStack[i]!.keydown(ev)
                if (ev.defaultPrevented) {
                    break
                }
            }
        }

        void buttonDown
    }
}
GLView.define('tx-glview', GLView)
