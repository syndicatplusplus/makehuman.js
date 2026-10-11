import { Application } from 'Application'
import { ProxyType } from 'proxy/Proxy'
import { OptionModel } from 'toad.js/appkit/OptionModel'
import { Select } from 'toad.js/viewkit/Select'

const MANNEQUIN_OPTIONS: ReadonlyArray<[string, string]> = [
    ['female_generic', 'Feminine'],
    ['male_generic', 'Masculine'],
]

export function MannequinControls(props: { app: Application }) {
    const proxyModel = props.app.proxyManager.list.get(ProxyType.Proxymeshes)

    if (proxyModel === undefined) {
        return <></>
    }

    const initialValue =
        MANNEQUIN_OPTIONS.some(([value]) => value === proxyModel.value)
            ? proxyModel.value
            : 'female_generic'

    const mannequinModel = new OptionModel<string>(
        initialValue,
        MANNEQUIN_OPTIONS,
    )

    mannequinModel.signal.add(() => {
        if (proxyModel.value !== mannequinModel.value) {
            proxyModel.value = mannequinModel.value
        }
    })

    return (
        <div
            style={{
                flex: '0 0 auto',
                padding: '14px 14px 12px 14px',
                borderBottom: '1px solid var(--tx-gray-60)',
            }}
        >
            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: '110px 1fr',
                    gap: '12px',
                    alignItems: 'center',
                }}
            >
                <strong>Mannequin</strong>
                <Select
                    model={mannequinModel}
                    style={{ width: '100%' }}
                />
            </div>

            <p
                style={{
                    margin: '8px 0 0 122px',
                    opacity: 0.65,
                    lineHeight: '1.35',
                }}
            >
                Switching mannequins keeps the current body morphs and pose.
            </p>
        </div>
    )
}
