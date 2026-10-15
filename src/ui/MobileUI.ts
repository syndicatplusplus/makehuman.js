const STYLE_ID = 'makehuman-mobile-ui'
const PANEL_TOGGLE_ID = 'app-panel-toggle'
const PANEL_HIDDEN_CLASS = 'app-controls-hidden'
const CONTROL_SELECTOR = 'tx-button, tx-slider, tx-text, tx-select'

let enhanceFrame: number | undefined

function isTouchLayout(): boolean {
    return (
        window.matchMedia('(pointer: coarse)').matches ||
        window.innerWidth <= 1100
    )
}

function enhanceButton(host: HTMLElement, touch: boolean) {
    const button = host.shadowRoot?.querySelector('button') as HTMLButtonElement | null
    if (button === null) return

    button.style.height = touch ? '48px' : '36px'
    button.style.minHeight = touch ? '48px' : '36px'
    button.style.padding = touch ? '6px 18px' : '4px 15px'
    button.style.fontSize = touch ? '17px' : '15px'
    button.style.borderRadius = touch ? '24px' : '18px'
}

function enhanceSlider(host: HTMLElement, touch: boolean) {
    host.style.height = touch ? '34px' : '22px'
    host.style.paddingTop = touch ? '5px' : '4px'
    host.style.paddingBottom = touch ? '5px' : '4px'
    host.style.touchAction = 'none'

    const root = host.shadowRoot
    if (root === null) return

    const thumb = root.querySelector('.tx-thumb') as HTMLElement | null
    const rail = root.querySelector('.tx-rail') as HTMLElement | null
    const track = root.querySelector('.tx-track') as HTMLElement | null

    if (thumb) {
        thumb.style.width = touch ? '28px' : '18px'
        thumb.style.height = touch ? '28px' : '18px'
        thumb.style.borderWidth = touch ? '3px' : '2px'
    }

    if (rail) {
        rail.style.height = touch ? '5px' : '3px'
        rail.style.borderRadius = touch ? '3px' : '2px'
    }

    if (track) {
        track.style.height = touch ? '5px' : '3px'
        track.style.borderRadius = touch ? '3px' : '2px'
    }
}

function enhanceText(host: HTMLElement, touch: boolean) {
    const input = host.shadowRoot?.querySelector('input') as HTMLInputElement | null
    if (input === null) return

    input.style.minHeight = touch ? '46px' : '34px'
    input.style.fontSize = touch ? '17px' : '15px'
    input.style.lineHeight = touch ? '24px' : '20px'
    input.style.padding = touch ? '8px 10px' : '5px 8px'
}

function enhanceSelectPopup(host: HTMLElement, touch: boolean) {
    const root = host.shadowRoot
    if (root === null) return

    const popup = root.querySelector('.tx-popover') as HTMLElement | null
    if (popup === null) return

    popup.style.fontSize = touch ? '17px' : '15px'
    popup.style.maxHeight = touch ? '55vh' : '45vh'
    popup.style.overflowY = 'auto'

    if (touch) {
        host.style.position = 'relative'
        host.style.overflow = 'visible'

        popup.style.position = 'absolute'
        popup.style.left = '0'
        popup.style.top = 'calc(100% + 4px)'
        popup.style.right = 'auto'
        popup.style.width = '100%'
        popup.style.minWidth = '100%'
        popup.style.maxWidth = '100%'
        popup.style.boxSizing = 'border-box'
        popup.style.zIndex = '200'
        popup.style.opacity = '1'
    }

    popup.querySelectorAll('li').forEach((item) => {
        const element = item as HTMLElement
        element.style.minHeight = touch ? '48px' : '34px'
        element.style.padding = touch ? '12px 14px' : '7px 10px'
        element.style.boxSizing = 'border-box'
        element.style.display = 'flex'
        element.style.alignItems = 'center'
    })
}

function enhanceSelect(host: HTMLElement, touch: boolean) {
    const controlHeight = touch ? '48px' : '36px'

    host.style.height = controlHeight
    host.style.minHeight = controlHeight

    const root = host.shadowRoot
    if (root === null) return

    const display = root.querySelector('[tabindex]') as HTMLElement | null
    const button = root.querySelector('button') as HTMLButtonElement | null

    if (display) {
        display.style.height = controlHeight
        display.style.minHeight = controlHeight
        display.style.fontSize = touch ? '17px' : '15px'
        display.style.padding = touch ? '11px 12px' : '7px 9px'
        display.style.boxSizing = 'border-box'
        display.style.display = 'flex'
        display.style.alignItems = 'center'
    }

    if (button) {
        button.style.width = controlHeight
        button.style.minWidth = controlHeight
        button.style.height = controlHeight
        button.style.minHeight = controlHeight
        button.style.padding = '0'
        button.style.margin = '0'
        button.style.boxSizing = 'border-box'
        button.style.display = 'flex'
        button.style.alignItems = 'center'
        button.style.justifyContent = 'center'
        button.style.lineHeight = '1'
        button.style.verticalAlign = 'middle'
    }

    if (host.dataset.mobileSelectHook !== '1') {
        host.dataset.mobileSelectHook = '1'
        host.addEventListener('pointerdown', () => {
            window.setTimeout(
                () => enhanceSelectPopup(host, isTouchLayout()),
                0,
            )
        })
    }

    enhanceSelectPopup(host, touch)
}

function enhanceControls() {
    const touch = isTouchLayout()

    document.querySelectorAll('tx-button').forEach((node) => {
        enhanceButton(node as HTMLElement, touch)
    })

    document.querySelectorAll('tx-slider').forEach((node) => {
        enhanceSlider(node as HTMLElement, touch)
    })

    document.querySelectorAll('tx-text').forEach((node) => {
        enhanceText(node as HTMLElement, touch)
    })

    document.querySelectorAll('tx-select').forEach((node) => {
        enhanceSelect(node as HTMLElement, touch)
    })
}

function scheduleEnhanceControls() {
    if (enhanceFrame !== undefined) {
        return
    }

    enhanceFrame = window.requestAnimationFrame(() => {
        enhanceFrame = undefined
        enhanceControls()
        ensurePanelToggle()
    })
}

function updatePanelToggleState(button: HTMLButtonElement) {
    const hidden = document.body.classList.contains(PANEL_HIDDEN_CLASS)

    const expanded = hidden ? 'false' : 'true'
    const label = hidden
        ? 'Show Body and Pose controls'
        : 'Hide Body and Pose controls'
    const title = hidden ? 'Show controls' : 'Hide controls'

    if (button.getAttribute('aria-expanded') !== expanded) {
        button.setAttribute('aria-expanded', expanded)
    }

    if (button.getAttribute('aria-label') !== label) {
        button.setAttribute('aria-label', label)
    }

    if (button.title !== title) {
        button.title = title
    }
}

function ensurePanelToggle() {
    if (document.getElementById(PANEL_TOGGLE_ID) !== null) {
        return
    }

    if (document.getElementById('app-control-panel') === null) {
        return
    }

    const button = document.createElement('button')
    button.id = PANEL_TOGGLE_ID
    button.type = 'button'
    button.textContent = 'Controls'

    button.addEventListener('click', () => {
        document.body.classList.toggle(PANEL_HIDDEN_CLASS)
        updatePanelToggleState(button)
        window.dispatchEvent(new Event('resize'))
    })

    updatePanelToggleState(button)
    document.body.appendChild(button)
}

function addedNodeNeedsEnhancement(node: Node): boolean {
    if (!(node instanceof HTMLElement)) {
        return false
    }

    if (
        node.id === 'app-control-panel' ||
        node.matches(CONTROL_SELECTOR)
    ) {
        return true
    }

    return node.querySelector(CONTROL_SELECTOR) !== null
}

export function installMobileUI() {
    if (document.getElementById(STYLE_ID) === null) {
        const style = document.createElement('style')
        style.id = STYLE_ID
        style.textContent = `
            :root {
                --app-panel-width: 540px;
                --app-panel-height-mobile: 50dvh;
                --app-control-font-size: 15px;
                --app-panel-padding: 18px;
            }

            html,
            body {
                width: 100%;
                height: 100%;
                margin: 0;
                overflow: hidden;
                overscroll-behavior: none;
                -webkit-text-size-adjust: 100%;
            }

            #app-control-panel {
                position: absolute;
                left: 0;
                top: 0;
                bottom: 0;
                width: var(--app-panel-width);
                min-width: var(--app-panel-width);
                max-width: var(--app-panel-width);
                z-index: 30;
                overflow: hidden;
                background: var(--tx-gray-100);
                font-size: var(--app-control-font-size);
                transform: translateX(0);
                transition: transform 180ms ease;
                will-change: transform;
            }

            #app-viewport {
                position: absolute;
                left: var(--app-panel-width);
                top: 0;
                right: 0;
                bottom: 0;
                overflow: hidden;
                background: #000;
                touch-action: none;
                transition: left 180ms ease, bottom 180ms ease;
            }

            body.${PANEL_HIDDEN_CLASS} #app-control-panel {
                transform: translateX(-100%);
            }

            body.${PANEL_HIDDEN_CLASS} #app-viewport {
                left: 0;
            }

            #app-panel-toggle {
                position: absolute;
                z-index: 60;
                left: calc(var(--app-panel-width) + 14px);
                top: max(14px, env(safe-area-inset-top));
                height: 48px;
                min-height: 48px;
                padding: 6px 18px;
                border: 0;
                border-radius: 24px;
                background: var(--tx-gray-400);
                color: var(--tx-gray-900);
                font: inherit;
                font-size: 17px;
                font-weight: 500;
                line-height: 1;
                cursor: pointer;
                transition:
                    left 180ms ease,
                    bottom 180ms ease,
                    background 120ms ease;
                -webkit-tap-highlight-color: transparent;
            }

            #app-panel-toggle:hover {
                background: var(--tx-gray-500);
            }

            #app-panel-toggle:active {
                background: var(--tx-gray-300);
            }

            body.${PANEL_HIDDEN_CLASS} #app-panel-toggle {
                left: max(14px, env(safe-area-inset-left));
            }

            #app-viewport tx-glview {
                position: absolute !important;
                inset: 0 !important;
                width: 100% !important;
                height: 100% !important;
            }

            #app-control-panel tx-select,
            #app-control-panel tx-slider {
                width: 100%;
                box-sizing: border-box;
            }

            #app-control-panel tx-text {
                width: 100%;
                box-sizing: border-box;
            }

            .pose-scroll-panel {
                padding: var(--app-panel-padding) !important;
                box-sizing: border-box;
            }

            .pose-axis-row {
                grid-template-columns: 34px 88px minmax(140px, 1fr) !important;
                gap: 14px !important;
                min-height: 44px;
            }

            .hand-slider-row {
                grid-template-columns: 104px 88px minmax(140px, 1fr) !important;
                gap: 14px !important;
                min-height: 44px;
            }

            .body-slider-row {
                grid-template-columns: 140px 88px minmax(140px, 1fr) !important;
                gap: 14px !important;
                min-height: 48px;
            }

            .mannequin-control {
                padding: 16px !important;
            }

            .mannequin-control-row {
                grid-template-columns: 112px minmax(180px, 1fr) !important;
                gap: 14px !important;
            }

            .mannequin-help {
                margin-left: 126px !important;
            }

            .viewport-controls {
                position: absolute;
                right: max(14px, env(safe-area-inset-right));
                top: max(14px, env(safe-area-inset-top));
            }

            @media (max-width: 1180px) {
                :root {
                    --app-control-font-size: 17px;
                    --app-panel-padding: 20px;
                }

                #app-control-panel h2 {
                    font-size: 28px;
                }

                #app-control-panel h3 {
                    font-size: 22px;
                }

                #app-control-panel p {
                    line-height: 1.5;
                }

                .pose-axis-row,
                .hand-slider-row,
                .body-slider-row {
                    min-height: 52px;
                }
            }

            @media (max-width: 900px),
                   ((orientation: portrait) and (max-width: 1100px)) {
                :root {
                    --app-panel-width: 100vw;
                    --app-control-font-size: 17px;
                    --app-panel-padding: 18px;
                }

                #app-control-panel {
                    left: 0;
                    right: 0;
                    top: auto;
                    bottom: 0;
                    width: 100vw;
                    min-width: 0;
                    max-width: none;
                    height: var(--app-panel-height-mobile);
                    border-top: 1px solid var(--tx-gray-300);
                    transform: translateY(0);
                }

                #app-viewport {
                    left: 0;
                    right: 0;
                    top: 0;
                    bottom: var(--app-panel-height-mobile);
                }

                body.${PANEL_HIDDEN_CLASS} #app-control-panel {
                    transform: translateY(100%);
                }

                body.${PANEL_HIDDEN_CLASS} #app-viewport {
                    left: 0;
                    bottom: 0;
                }

                #app-panel-toggle {
                    left: max(14px, env(safe-area-inset-left));
                    top: auto;
                    bottom: calc(var(--app-panel-height-mobile) + 14px);
                }

                body.${PANEL_HIDDEN_CLASS} #app-panel-toggle {
                    left: max(14px, env(safe-area-inset-left));
                    bottom: max(14px, env(safe-area-inset-bottom));
                }

                .mannequin-control-row {
                    grid-template-columns: 96px minmax(0, 1fr) !important;
                }

                .mannequin-help {
                    margin-left: 110px !important;
                }

                .pose-axis-row {
                    grid-template-columns: 30px 82px minmax(120px, 1fr) !important;
                }

                .hand-slider-row {
                    grid-template-columns: 88px 82px minmax(120px, 1fr) !important;
                }

                .body-slider-row {
                    grid-template-columns: 120px 82px minmax(120px, 1fr) !important;
                }
            }

            @media (max-width: 560px) {
                :root {
                    --app-panel-height-mobile: 54dvh;
                    --app-control-font-size: 16px;
                    --app-panel-padding: 14px;
                }

                .pose-axis-row {
                    grid-template-columns: 26px 76px minmax(90px, 1fr) !important;
                    gap: 10px !important;
                }

                .hand-slider-row {
                    grid-template-columns: 74px 76px minmax(90px, 1fr) !important;
                    gap: 10px !important;
                }

                .body-slider-row {
                    grid-template-columns: 100px 76px minmax(90px, 1fr) !important;
                    gap: 10px !important;
                }

                .mannequin-control-row {
                    grid-template-columns: 82px minmax(0, 1fr) !important;
                    gap: 10px !important;
                }

                .mannequin-help {
                    display: none;
                }

                .viewport-controls {
                    transform: scale(0.92);
                    transform-origin: top right;
                }

                #app-panel-toggle {
                    height: 44px;
                    min-height: 44px;
                    padding: 5px 15px;
                    border-radius: 22px;
                    font-size: 16px;
                }
            }

            @media (pointer: coarse) {
                #app-control-panel {
                    -webkit-user-select: none;
                    user-select: none;
                }

                #app-control-panel p,
                #app-control-panel h2,
                #app-control-panel h3,
                #app-control-panel strong,
                #app-control-panel span {
                    -webkit-user-select: text;
                    user-select: text;
                }
            }

            @media (prefers-reduced-motion: reduce) {
                #app-control-panel,
                #app-viewport,
                #app-panel-toggle {
                    transition: none;
                }
            }
        `
        document.head.appendChild(style)
    }

    const observer = new MutationObserver((records) => {
        for (const record of records) {
            for (let i = 0; i < record.addedNodes.length; ++i) {
                const node = record.addedNodes.item(i)

                if (
                    node !== null &&
                    addedNodeNeedsEnhancement(node)
                ) {
                    scheduleEnhanceControls()
                    return
                }
            }
        }
    })

    observer.observe(document.body, {
        childList: true,
        subtree: true,
    })

    window.addEventListener('resize', scheduleEnhanceControls)

    if (window.visualViewport) {
        window.visualViewport.addEventListener(
            'resize',
            scheduleEnhanceControls,
        )
    }

    scheduleEnhanceControls()
}
