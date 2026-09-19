import React from 'react';

// important to import from the package and not from some children
import { ConfigGeneric, type ConfigGenericProps, type ConfigGenericState } from '@iobroker/json-config';
import { I18n } from '@iobroker/gui-components';

// `shared/` is a copy of `src-shared` (`tsx ../tasks.ts --sync`, runs before build and start)
import MeshView from './shared/MeshView';
import { MeshLoader, type MeshLoaderState } from './shared/meshApi';

type MeshTopologyState = ConfigGenericState & MeshLoaderState;

/** Tab "Mesh" of the instance settings: the mesh topology of the box (issue #383) */
export default class MeshTopology extends ConfigGeneric<ConfigGenericProps, MeshTopologyState> {
    private loader: MeshLoader | null = null;

    constructor(props: ConfigGenericProps) {
        super(props);
        this.state = {
            ...this.state,
            data: null,
            loading: false,
            error: null,
        };
    }

    async componentDidMount(): Promise<void> {
        await super.componentDidMount();
        this.loader = new MeshLoader({
            socket: this.props.oContext.socket,
            instanceId: `${this.props.oContext.adapterName}.${this.props.oContext.instance}`,
            onChange: state => this.setState(state),
        });
        this.loader.start();
    }

    componentWillUnmount(): void {
        this.loader?.stop();
        this.loader = null;
        super.componentWillUnmount();
    }

    static t = (key: string, ...args: (string | number)[]): string => I18n.t(key, ...args);

    renderItem(_error: string, _disabled: boolean, _defaultValue?: unknown): React.JSX.Element {
        return (
            <MeshView
                data={this.state.data}
                loading={this.state.loading}
                error={this.state.error}
                onRefresh={() => void this.loader?.refresh()}
                t={MeshTopology.t}
                themeType={this.props.oContext.themeType === 'dark' ? 'dark' : 'light'}
                storageKey="tr064.meshTopology"
            />
        );
    }
}
