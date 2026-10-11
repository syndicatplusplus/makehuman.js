import { Application } from 'Application'
import { SliderNode } from 'modifier/loadSliders'
import { Slider } from 'toad.js/viewkit/Slider'
import { TextField } from 'toad.js/viewkit/TextField'

function linkedNodes(first?: SliderNode): SliderNode[] {
    const nodes: SliderNode[] = []
    let node = first

    while (node !== undefined) {
        nodes.push(node)
        node = node.next
    }

    return nodes
}

function BodySlider(props: { node: SliderNode }) {
    const model = props.node.model
    if (model === undefined) {
        return <></>
    }

    return (
        <div
            class="body-slider-row"
            style={{
                display: 'grid',
                gridTemplateColumns: '140px 88px 1fr',
                gap: '12px',
                alignItems: 'center',
                marginBottom: '14px',
            }}
        >
            <span
                style={{
                    lineHeight: '1.25',
                }}
            >
                {props.node.label}
            </span>

            <TextField model={model} />
            <Slider model={model} />
        </div>
    )
}

function SliderGroup(props: {
    node: SliderNode
    openByDefault?: boolean
}) {
    const sliders = linkedNodes(props.node.down)

    return (
        <details
            open={props.openByDefault}
            class="body-subsection"
            style={{
                marginBottom: '12px',
                border: '1px solid var(--tx-gray-200)',
                borderRadius: '8px',
                overflow: 'hidden',
                background: 'var(--tx-gray-50)',
            }}
        >
            <summary
                style={{
                    minHeight: '48px',
                    boxSizing: 'border-box',
                    padding: '12px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    cursor: 'pointer',
                    fontWeight: 600,
                    userSelect: 'none',
                }}
            >
                {props.node.label}
            </summary>

            <div
                style={{
                    padding: '14px 14px 2px 14px',
                    borderTop: '1px solid var(--tx-gray-150)',
                }}
            >
                {sliders.map((slider) => (
                    <BodySlider node={slider} />
                ))}
            </div>
        </details>
    )
}

function BodySection(props: {
    node: SliderNode
    openByDefault?: boolean
}) {
    const groups = linkedNodes(props.node.down)

    return (
        <details
            open={props.openByDefault}
            class="body-section"
            style={{
                marginBottom: '14px',
                border: '1px solid var(--tx-gray-250)',
                borderRadius: '10px',
                overflow: 'hidden',
                background: 'var(--tx-gray-75)',
            }}
        >
            <summary
                style={{
                    minHeight: '52px',
                    boxSizing: 'border-box',
                    padding: '13px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    cursor: 'pointer',
                    fontSize: '1.08em',
                    fontWeight: 600,
                    userSelect: 'none',
                }}
            >
                {props.node.label}
            </summary>

            <div
                style={{
                    padding: '14px',
                    borderTop: '1px solid var(--tx-gray-200)',
                }}
            >
                {groups.map((group, index) => (
                    <SliderGroup
                        node={group}
                        openByDefault={
                            props.openByDefault && index === 0
                        }
                    />
                ))}
            </div>
        </details>
    )
}

export function BodyControls(props: { app: Application }) {
    const sections = linkedNodes(props.app.sliderNodes)

    return (
        <div
            class="body-scroll-panel"
            style={{
                flex: '1 1 auto',
                minHeight: 0,
                overflowY: 'auto',
                overflowX: 'hidden',
                boxSizing: 'border-box',
                WebkitOverflowScrolling: 'touch',
                padding: 'var(--app-panel-padding)',
            }}
        >
            <h2 style={{ margin: '0 0 8px 0' }}>
                Body proportions
            </h2>

            <p
                style={{
                    margin: '0 0 18px 0',
                    opacity: 0.72,
                    lineHeight: '1.45',
                }}
            >
                Open a section, then drag a slider or enter a precise value.
            </p>

            {sections.map((section, index) => (
                <BodySection
                    node={section}
                    openByDefault={index === 0}
                />
            ))}
        </div>
    )
}
