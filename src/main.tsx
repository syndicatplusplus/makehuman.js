import { Fragment } from "toad.jsx/jsx-runtime"

/*

TODO: IT'S TIME TO CLEAR UP THIS MESS
[ ] instead of passing indiviual models around, group them into a class and pass that around
    it will be basically like a bunch of global variables. but at the moment i'm not sure
    how all the parts of the app will relate to each other
[ ] render, UpdateManager, ...
    * have something like setRenderer(...) which is called when a tab is activated
    * Tab has visibilityChange(state: "visible" | "hidden") property
    * it will need the canvas and the overlay
    * name... RenderView?, GLView? => WE NOW HAVE 'GlView'
[ ] get rid of the ui/ directory and instead clean up the root directory to match the UI structure
    application/
      file/
      morph/
      proxy/
      pose/
      expression/
      mediapipe/
      chordata/
      glview/
    makehuman/ ;; all the code from makehuman
    main.tsx   ;; an no other files to make it prominent!
*/

import { SliderNode } from './modifier/loadSliders'
import { ProxyType } from 'proxy/Proxy'
import { SliderTreeAdapter } from 'ui/morphView'
import { TAB } from 'HistoryManager'

import { FileSystemAdapter } from './filesystem/FileSystemAdapter'
import { HTTPFSAdapter } from './filesystem/HTTPFSAdapter'

import { Table } from 'toad.js/table/Table'
import { TreeNodeModel } from 'toad.js/table/model/TreeNodeModel'
import { TreeAdapter } from 'toad.js/table/adapter/TreeAdapter'
import { Tab, Tabs } from 'toad.js/viewkit/Tab'
import { StringArrayAdapter } from 'toad.js/table/adapter/StringArrayAdapter'
import { StringArrayModel } from 'toad.js/table/model/StringArrayModel'
import { Application, setRenderer } from 'Application'
import { RenderHuman } from 'render/RenderHuman'
import { RenderView } from 'render/RenderView'
import { TableAdapter } from 'toad.js/table/adapter/TableAdapter'

const CONTROL_PANEL_WIDTH = 540
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
    const app = new Application()

    TreeAdapter.register(SliderTreeAdapter, TreeNodeModel, SliderNode)
    TableAdapter.register(StringArrayAdapter, StringArrayModel)

    // Start directly in the body editor instead of the old Proxy tab.
    app.tabModel.value = TAB.MORPH

    // Use MakeHuman's very lightweight proxy mesh as the visible mannequin.
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
                left: `${CONTROL_PANEL_WIDTH}px`,
                right: 0,
                top: 0,
                bottom: 0,
                overflow: 'hidden',
            }}
        />
    )

    document.body.replaceChildren(
        ...(
            <>
                <Tabs
                    model={app.tabModel}
                    style={{
                        position: 'absolute',
                        left: 0,
                        width: `${CONTROL_PANEL_WIDTH}px`,
                        top: 0,
                        bottom: 0,
                    }}
                >
                    <MorphTab app={app} />
                </Tabs>
                {glview}
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
            <Table
                model={props.app.morphControls}
                style={{ width: '100%', height: '100%' }}
            />
        </Tab>
    )
}

main()
