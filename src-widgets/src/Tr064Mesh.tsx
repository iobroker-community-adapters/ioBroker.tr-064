import React from 'react';

import type { RxRenderWidgetProps, RxWidgetInfo, VisRxWidgetProps, VisRxWidgetState } from '@iobroker/types-vis-2';

import Generic from './Generic';
import MeshView from './shared/MeshView';
import { MeshLoader } from './shared/meshApi';
import type { MeshResponse } from './shared/types';

/** Below this width or height the toolbar of the mesh view is compact - the full one is made for a page, not a card */
const COMPACT_WIDTH = 900;
const COMPACT_HEIGHT = 400;

/** Seconds between two refreshes, if the attribute is empty */
const DEFAULT_INTERVAL = 30;
const MIN_INTERVAL = 10;

interface Tr064MeshRxData {
    instance: string;
    noCard: boolean;
    widgetTitle: string;
    view: 'graph' | 'table';
    onlyConfigured: boolean;
    showDisconnected: boolean;
    interval: number | string;
}

/**
 * `MeshLoaderState` under other names: `data` (and `error`) must not be overwritten, vis-2 keeps the
 * data of the widget in `state.data`
 */
interface Tr064MeshState extends VisRxWidgetState {
    mesh: MeshResponse | null;
    meshLoading: boolean;
    meshError: string | null;
    size: { width: number; height: number };
    /** Changes when the defaults of the view change, so that `MeshView` reads its settings again */
    viewKey: number;
}

/** The view settings of `MeshView` (its `localStorage` format) */
interface ViewSettings {
    onlyConfigured: boolean;
    showDisconnected: boolean;
    viewMode: 'graph' | 'table';
}

/**
 * Mesh topology of the FRITZ!Box in the size of the widget.
 *
 * `MeshView` keeps its settings (only configured devices, disconnected devices, graph or table) in the
 * `localStorage`. The attributes of the widget are the defaults: they are written into the storage key
 * of this widget when it is shown the first time in a browser and whenever they are changed in the
 * editor; a change by the viewer is remembered in the browser until the attributes change again.
 */
export default class Tr064Mesh extends Generic<Tr064MeshRxData, Tr064MeshState> {
    private loader: MeshLoader | null = null;

    private observer: ResizeObserver | null = null;

    private visibility: IntersectionObserver | null = null;

    private rootElement: HTMLDivElement | null = null;

    /** The widget is in the visible part of the page */
    private inViewport = true;

    constructor(props: VisRxWidgetProps) {
        super(props);
        this.state = {
            ...this.state,
            mesh: null,
            meshLoading: false,
            meshError: null,
            size: { width: 0, height: 0 },
            viewKey: 0,
        };
        // before the first render: MeshView reads its settings only when it is created
        this.applyViewDefaults();
    }

    static getWidgetInfo(): RxWidgetInfo {
        return {
            id: 'tplTr064Mesh',
            visSet: 'tr-064',
            visSetLabel: 'set_label',
            visSetColor: '#e2001a',
            visName: 'FRITZ!Box Mesh',
            visWidgetLabel: 'mesh',
            visHelp: 'mesh_help',
            visAttrs: [
                {
                    name: 'common',
                    fields: [
                        {
                            name: 'instance',
                            type: 'instance',
                            adapter: 'tr-064',
                            default: 'tr-064.0',
                            label: 'instance',
                        },
                        { name: 'noCard', type: 'checkbox', label: 'without_card' },
                        { name: 'widgetTitle', type: 'text', label: 'title', hidden: '!!data.noCard' },
                        {
                            name: 'interval',
                            type: 'number',
                            min: MIN_INTERVAL,
                            max: 3600,
                            default: DEFAULT_INTERVAL,
                            label: 'interval',
                            tooltip: 'interval_tooltip',
                        },
                    ],
                },
                {
                    name: 'viewDefaults',
                    label: 'view_defaults',
                    fields: [
                        {
                            name: 'view',
                            type: 'select',
                            options: [
                                { value: 'graph', label: 'view_graph' },
                                { value: 'table', label: 'view_table' },
                            ],
                            default: 'graph',
                            label: 'view',
                            tooltip: 'view_tooltip',
                        },
                        {
                            name: 'onlyConfigured',
                            type: 'checkbox',
                            default: false,
                            label: 'only_configured',
                            tooltip: 'view_tooltip',
                        },
                        {
                            name: 'showDisconnected',
                            type: 'checkbox',
                            default: false,
                            label: 'show_disconnected',
                            tooltip: 'view_tooltip',
                        },
                    ],
                },
            ],
            visDefaultStyle: { width: '100%', height: 480, position: 'relative' },
            visPrev: 'widgets/tr-064/img/prev_tr064_mesh.png',
        };
    }

    // eslint-disable-next-line class-methods-use-this
    getWidgetInfo(): RxWidgetInfo {
        return Tr064Mesh.getWidgetInfo();
    }

    componentDidMount(): void {
        super.componentDidMount();
        document.addEventListener('visibilitychange', this.onVisibilityChange);
        this.startLoader();
    }

    componentDidUpdate(prevProps: VisRxWidgetProps, prevState: Tr064MeshState & { rxData: Tr064MeshRxData }): void {
        super.componentDidUpdate(prevProps, prevState);
        // the interval depends on the edit mode
        if (prevState.editMode !== this.state.editMode) {
            this.startLoader();
        }
    }

    componentWillUnmount(): void {
        document.removeEventListener('visibilitychange', this.onVisibilityChange);
        this.stopLoader();
        this.observer?.disconnect();
        this.observer = null;
        this.visibility?.disconnect();
        this.visibility = null;
        super.componentWillUnmount();
    }

    onRxDataChanged(prevRxData: Tr064MeshRxData): void {
        const rxData = this.state.rxData;
        if (
            prevRxData.view !== rxData.view ||
            !!prevRxData.onlyConfigured !== !!rxData.onlyConfigured ||
            !!prevRxData.showDisconnected !== !!rxData.showDisconnected
        ) {
            this.applyViewDefaults();
            this.setState({ viewKey: this.state.viewKey + 1 });
        }
        if (prevRxData.instance !== rxData.instance) {
            this.setState({ mesh: null, meshError: null, meshLoading: false }, () => this.startLoader());
        } else if (String(prevRxData.interval) !== String(rxData.interval)) {
            this.startLoader();
        }
    }

    // ---- view settings ------------------------------------------------------

    private getMeshStorageKey(): string {
        return this.getStorageKey('mesh');
    }

    private getViewDefaults(): ViewSettings {
        const rxData = this.state.rxData;
        return {
            onlyConfigured: !!rxData.onlyConfigured,
            showDisconnected: !!rxData.showDisconnected,
            viewMode: rxData.view === 'table' ? 'table' : 'graph',
        };
    }

    /** Writes the attributes into the settings of `MeshView`, if they are new for this browser */
    private applyViewDefaults(): void {
        const key = this.getMeshStorageKey();
        const defaults = JSON.stringify(this.getViewDefaults());
        try {
            if (window.localStorage.getItem(`${key}.defaults`) !== defaults || !window.localStorage.getItem(key)) {
                window.localStorage.setItem(key, defaults);
                window.localStorage.setItem(`${key}.defaults`, defaults);
            }
        } catch {
            // no storage (private window, blocked site data): MeshView starts with its own defaults
        }
    }

    // ---- loading ------------------------------------------------------------

    private getInterval(): number {
        if (this.state.editMode) {
            // the editor reads once, a refresh is possible by the button
            return 0;
        }
        const interval = parseInt(String(this.state.rxData.interval ?? ''), 10);
        return Number.isFinite(interval) && interval > 0 ? Math.max(MIN_INTERVAL, interval) : DEFAULT_INTERVAL;
    }

    /** Reads now and then periodically - only while the page and the widget are visible */
    private startLoader(): void {
        this.stopLoader();
        if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
            return;
        }
        if (!this.inViewport) {
            return;
        }
        this.loader = new MeshLoader({
            socket: this.getMeshSocket(),
            instanceId: this.getInstanceId(),
            interval: this.getInterval(),
            onChange: state => this.setState({ mesh: state.data, meshLoading: state.loading, meshError: state.error }),
        });
        this.loader.start();
    }

    private stopLoader(): void {
        this.loader?.stop();
        this.loader = null;
    }

    private onVisibilityChange = (): void => {
        if (document.visibilityState === 'hidden') {
            this.stopLoader();
        } else if (!this.loader) {
            this.startLoader();
        }
    };

    /** Callback ref of the root element: size for `compact`, visibility for the refresh */
    private setRoot = (element: HTMLDivElement | null): void => {
        if (element === this.rootElement) {
            return;
        }
        this.observer?.disconnect();
        this.observer = null;
        this.visibility?.disconnect();
        this.visibility = null;
        this.rootElement = element;
        if (!element) {
            return;
        }

        const measure = (width: number, height: number): void => {
            const size = { width: Math.round(width), height: Math.round(height) };
            if (size.width !== this.state.size.width || size.height !== this.state.size.height) {
                this.setState({ size });
            }
        };
        const rect = element.getBoundingClientRect();
        measure(rect.width, rect.height);

        if (typeof ResizeObserver !== 'undefined') {
            this.observer = new ResizeObserver(entries => {
                if (entries[0]) {
                    measure(entries[0].contentRect.width, entries[0].contentRect.height);
                }
            });
            this.observer.observe(element);
        }
        if (typeof IntersectionObserver !== 'undefined') {
            this.visibility = new IntersectionObserver(entries => {
                const visible = entries.some(entry => entry.isIntersecting);
                if (visible === this.inViewport) {
                    return;
                }
                this.inViewport = visible;
                if (!visible) {
                    this.stopLoader();
                } else if (!this.loader) {
                    this.startLoader();
                }
            });
            this.visibility.observe(element);
        }
    };

    renderWidgetBody(props: RxRenderWidgetProps): React.JSX.Element | React.JSX.Element[] | null {
        super.renderWidgetBody(props);

        const { width, height } = this.state.size;
        const compact = (width > 0 && width < COMPACT_WIDTH) || (height > 0 && height < COMPACT_HEIGHT);

        const content = (
            <div
                ref={this.setRoot}
                className="tr064-mesh"
                style={{
                    width: '100%',
                    flex: '1 1 auto',
                    height: '100%',
                    minHeight: 0,
                    minWidth: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                }}
            >
                <MeshView
                    key={this.state.viewKey}
                    data={this.state.mesh}
                    loading={this.state.meshLoading}
                    error={this.state.meshError}
                    onRefresh={() => void this.loader?.refresh()}
                    t={Generic.meshT()}
                    themeType={this.getThemeType()}
                    compact={compact}
                    height="100%"
                    storageKey={this.getMeshStorageKey()}
                />
            </div>
        );

        if (this.state.rxData.noCard || props.widget?.usedInWidget) {
            return content;
        }

        return this.wrapContent(content, null, {
            alignItems: 'stretch',
            minHeight: 0,
            padding: 12,
            paddingBottom: 12,
            // explicit box-sizing: with a CssBaseline the card content is border-box, without it content-box
            boxSizing: 'border-box',
            height: '100%',
            overflow: 'hidden',
        });
    }
}
