import { Fragment } from "toad.jsx/jsx-runtime"

import { ProxyType } from 'proxy/Proxy'
import { TAB } from 'HistoryManager'

import { FileSystemAdapter } from './filesystem/FileSystemAdapter'
import { HTTPFSAdapter } from './filesystem/HTTPFSAdapter'

import { Tab, Tabs } from 'toad.js/viewkit/Tab'
import { Application, setRenderer } from 'Application'
import { RenderHuman } from 'render/RenderHuman'
import { RenderView } from 'render/RenderView'
import { PoseTab } from 'pose/PoseTab'
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

    // Start directly in the body editor.
    app.tabModel.value = TAB.MORPH

    // Use the smoother generic MakeHuman proxy as the visible mannequin.
    // The hidden MakeHuman base mesh still drives morphs and skeleton deformation.
    const mannequinProxy = app.proxyManager.list.get(ProxyType.Proxymeshes)
    if (mannequinProxy !== undefined) {
        mannequinProxy.value = DEFAULT_MANNEQUIN_PROXY
    }

    // App.glview needs to be set before other operations.
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
                        <MorphTab app={app} />
                        <PoseTab app={app} />
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

function MorphTab(props: { app: Application }) {
    return (
        <Tab
            label="Body"
            value={TAB.MORPH}
            visibilityChange={setRenderer(props.app, new RenderHuman())}
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
