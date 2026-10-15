import { Fragment } from "toad.jsx/jsx-runtime"

import { ProxyType } from 'proxy/Proxy'
import { TAB } from 'HistoryManager'

import { FileSystemAdapter } from './filesystem/FileSystemAdapter'
import { HTTPFSAdapter } from './filesystem/HTTPFSAdapter'

import { Tab, Tabs } from 'toad.js/viewkit/Tab'
import { OptionModel } from 'toad.js/appkit/OptionModel'
import { Application } from 'Application'
import { RenderHuman } from 'render/RenderHuman'
import { RenderXBot } from 'render/RenderXBot'
import { RenderView } from 'render/RenderView'
import { UnifiedPoseTab } from 'pose/UnifiedPoseTab'
import { ViewportControls } from 'ui/ViewportControls'
import {
    MANNEQUIN_OPTIONS,
    MANNEQUIN_XBOT,
    MannequinControls,
} from 'ui/MannequinControls'
import { BodyControls } from 'ui/BodyControls'
import { installMobileUI } from 'ui/MobileUI'

const DEFAULT_MANNEQUIN_PROXY = 'female_generic'

export async function main() {
    try {
        FileSystemAdapter.setInstance(new HTTPFSAdapter())
        await run()
    } catch (e) {
        console.log(e)
        if (e instanceof Error) {
            alert(`${e.name}: ${e.message}`)
        } else {
            alert(e)
        }
    }
}

async function run() {
    installMobileUI()

    const app = new Application()
    const humanRenderer = new RenderHuman()
    const xbotRenderer = new RenderXBot()

    app.tabModel.value = TAB.MORPH

    const mannequinProxy = app.proxyManager.list.get(ProxyType.Proxymeshes)

    let initialMannequin = DEFAULT_MANNEQUIN_PROXY

    if (
        mannequinProxy !== undefined &&
        MANNEQUIN_OPTIONS.some(
            ([value]) =>
                value !== MANNEQUIN_XBOT &&
                value === mannequinProxy.value,
        )
    ) {
        initialMannequin = mannequinProxy.value
    } else if (mannequinProxy !== undefined) {
        mannequinProxy.value = DEFAULT_MANNEQUIN_PROXY
    }

    const mannequinModel = new OptionModel<string>(
        initialMannequin,
        MANNEQUIN_OPTIONS,
    )

    const glview = (
        <RenderView
            app={app}
            style={{
                position: 'absolute',
                inset: 0,
                overflow: 'hidden',
            }}
        />
    )

    document.body.replaceChildren(
        ...(
            <>
                <div id="app-control-panel">
                    <Tabs
                        model={app.tabModel}
                        style={{
                            position: 'absolute',
                            inset: 0,
                            width: '100%',
                            height: '100%',
                        }}
                    >
                        <MorphTab
                            app={app}
                            humanRenderer={humanRenderer}
                            xbotRenderer={xbotRenderer}
                            mannequinModel={mannequinModel}
                        />

                        <UnifiedPoseTab
                            app={app}
                            humanRenderer={humanRenderer}
                            xbotRenderer={xbotRenderer}
                            mannequinModel={mannequinModel}
                        />
                    </Tabs>
                </div>

                <div id="app-viewport">
                    {glview}
                    <ViewportControls app={app} />
                </div>
            </> as Fragment
        )
    )
}

function MorphTab(props: {
    app: Application
    humanRenderer: RenderHuman
    xbotRenderer: RenderXBot
    mannequinModel: OptionModel<string>
}) {
    const {
        app,
        humanRenderer,
        xbotRenderer,
        mannequinModel,
    } = props

    const syncBodyMode = () => {
        const xbotSelected =
            mannequinModel.value === MANNEQUIN_XBOT

        const humanControls = document.getElementById(
            'human-body-controls',
        )
        const xbotMessage = document.getElementById(
            'xbot-body-message',
        )

        if (humanControls !== null) {
            humanControls.style.display =
                xbotSelected
                    ? 'none'
                    : 'flex'
        }

        if (xbotMessage !== null) {
            xbotMessage.style.display =
                xbotSelected
                    ? 'block'
                    : 'none'
        }

        if (app.tabModel.value === TAB.MORPH) {
            app.setRenderer(
                xbotSelected
                    ? xbotRenderer
                    : humanRenderer,
            )
            app.glview?.invalidate()
        }
    }

    mannequinModel.signal.add(syncBodyMode)
    requestAnimationFrame(syncBodyMode)

    const bodyVisibility = (state: 'visible' | 'hidden') => {
        if (state === 'visible') {
            syncBodyMode()
        }
    }

    return (
        <Tab
            label="Body"
            value={TAB.MORPH}
            visibilityChange={bodyVisibility}
        >
            <div
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    width: '100%',
                    height: '100%',
                    overflow: 'hidden',
                }}
            >
                <MannequinControls
                    app={app}
                    model={mannequinModel}
                />

                <div
                    id="human-body-controls"
                    style={{
                        display: 'flex',
                        flex: '1 1 auto',
                        minHeight: 0,
                        overflow: 'hidden',
                    }}
                >
                    <BodyControls app={app} />
                </div>

                <div
                    id="xbot-body-message"
                    style={{
                        display: 'none',
                        flex: '1 1 auto',
                        boxSizing: 'border-box',
                        padding: 'var(--app-panel-padding)',
                        overflowY: 'auto',
                    }}
                >
                    <h2 style={{ margin: '0 0 10px 0' }}>
                        X Bot
                    </h2>

                    <p
                        style={{
                            margin: 0,
                            opacity: 0.72,
                            lineHeight: '1.5',
                        }}
                    >
                        X Bot has fixed body proportions, so MakeHuman body
                        morph sliders do not apply to it. Use the Pose tab to
                        adjust its skeleton.
                    </p>
                </div>
            </div>
        </Tab>
    )
}

main()
