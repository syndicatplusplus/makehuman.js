import { Application } from 'Application'
import { SliderNode } from 'modifier/loadSliders'
import { ProxyType } from 'proxy/Proxy'
import { OptionModel } from 'toad.js/appkit/OptionModel'
import { NumberModel } from 'toad.js/appkit/NumberModel'
import { Select } from 'toad.js/viewkit/Select'

export const MANNEQUIN_XBOT = 'xbot'

export const MANNEQUIN_OPTIONS: ReadonlyArray<[string, string]> = [
    ['female_generic', 'Feminine'],
    ['male_generic', 'Masculine'],
    [MANNEQUIN_XBOT, 'X Bot'],
]

function findSliderModel(
    node: SliderNode | undefined,
    label: string,
): NumberModel | undefined {
    let current = node

    while (current !== undefined) {
        if (current.label === label && current.model !== undefined) {
            return current.model
        }

        const nested = findSliderModel(current.down, label)
        if (nested !== undefined) {
            return nested
        }

        current = current.next
    }

    return undefined
}

export function MannequinControls(props: {
    app: Application
    model: OptionModel<string>
}) {
    const proxyModel = props.app.proxyManager.list.get(ProxyType.Proxymeshes)

    if (proxyModel === undefined) {
        return <></>
    }

    const genderModel = findSliderModel(
        props.app.sliderNodes,
        'Gender',
    )

    const syncHumanMannequin = () => {
        const mannequin = props.model.value

        if (mannequin === MANNEQUIN_XBOT) {
            return
        }

        /*
         * The mannequin selector chooses a useful starting point rather than
         * locking the body to a sex value. After selecting Feminine or
         * Masculine, the ordinary Gender slider remains fully editable for
         * androgynous or intermediate body shapes.
         */
        if (genderModel !== undefined) {
            const targetGender =
                mannequin === 'male_generic'
                    ? 1
                    : 0

            if (genderModel.value !== targetGender) {
                genderModel.value = targetGender
            }
        }

        if (proxyModel.value !== mannequin) {
            proxyModel.value = mannequin
        }
    }

    /*
     * Apply the selected mannequin once when the controls are created, then
     * again only when the mannequin selector itself changes. Editing the
     * Gender slider afterward will therefore not be snapped back to 0 or 1.
     */
    syncHumanMannequin()
    props.model.signal.add(syncHumanMannequin)

    return (
        <div
            class="mannequin-control"
            style={{
                flex: '0 0 auto',
                padding: '14px 14px 12px 14px',
                borderBottom: '1px solid var(--tx-gray-60)',
            }}
        >
            <div
                class="mannequin-control-row"
                style={{
                    display: 'grid',
                    gridTemplateColumns: '110px 1fr',
                    gap: '12px',
                    alignItems: 'center',
                }}
            >
                <strong>Mannequin</strong>
                <Select
                    model={props.model}
                    style={{ width: '100%' }}
                />
            </div>

            <p
                class="mannequin-help"
                style={{
                    margin: '8px 0 0 122px',
                    opacity: 0.65,
                    lineHeight: '1.35',
                }}
            >
                Feminine starts Gender at 0 and Masculine at 1. The Gender
                slider remains editable for intermediate body shapes. X Bot
                uses its own fixed body and skeleton.
            </p>
        </div>
    )
}
