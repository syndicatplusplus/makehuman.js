import { Fragment } from "toad.jsx/jsx-runtime"

import { ProxyType } from 'proxy/Proxy'
import { TAB } from 'HistoryManager'

import { FileSystemAdapter } from './filesystem/FileSystemAdapter'
import { HTTPFSAdapter } from './filesystem/HTTPFSAdapter'

import { Tab, Tabs } from 'toad.js/viewkit/Tab'
import { Application, setRenderer } from 'Application'
import { RenderXBot } from 'render/RenderXBot'
import { RenderView } from 'render/RenderView'
import { XBotPoseTab } from 'pose/XBotPoseTab'
import { ViewportControls } from 'ui/ViewportControls'
import { MannequinControls } from 'ui/MannequinControls'
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
    const xbotRenderer = new RenderXBot()

    app.tabModel.value = TAB.MORPH

    const mannequinProxy = app.proxyManager.list.get(ProxyType.Proxymeshes)
    if (mannequinProxy !== undefined) {
        mannequinProxy.value = DEFAULT_MANNEQUIN_PROXY
    }

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
                            renderer={xbotRenderer}
                        />
                        <XBotPoseTab
                            app={app}
                            renderer={xbotRenderer}
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
    renderer: RenderXBot
}) {
    return (
        <Tab
            label="Body"
            value={TAB.MORPH}
            visibilityChange={setRenderer(
                props.app,
                props.renderer,
            )}
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
                <MannequinControls app={props.app} />
                <BodyControls app={props.app} />
            </div>
        </Tab>
    )
}

main()
