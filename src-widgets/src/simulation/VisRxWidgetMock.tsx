/* eslint-disable class-methods-use-this, react/no-unused-class-component-methods */
// Only for the simulation (npm start) - never part of the widget build.
// A minimal stand-in for the `VisRxWidget` which vis-2 puts on `window.visRxWidget`: rxData/rxStyle
// from the props, `wrapContent()` like vis-2, the static i18n helpers and `onRxDataChanged()`.
import React from 'react';

import { Card, CardContent } from '@mui/material';

import type { RxRenderWidgetProps } from '@iobroker/types-vis-2';

import translations from '../translations';

let language = 'en';
const words: Record<string, Record<string, string>> = {};

/** Like `I18n.extendTranslations()` of vis-2: the prefix is prepended to every key */
function loadTranslations(): void {
    const { prefix, ...languages } = translations;
    for (const [lang, texts] of Object.entries(languages)) {
        words[lang] = {};
        for (const [key, text] of Object.entries(texts as Record<string, string>)) {
            words[lang][key.startsWith(prefix) ? key : `${prefix}${key}`] = text;
        }
    }
}
loadTranslations();

export function setMockLanguage(lang: string): void {
    language = words[lang] ? lang : 'en';
}

export interface MockWidgetProps {
    id: string;
    editMode: boolean;
    data: Record<string, unknown>;
    style: Record<string, string | number>;
    context: Record<string, unknown>;
}

interface MockWidgetState {
    rxData: Record<string, unknown>;
    rxStyle: Record<string, string | number>;
    editMode: boolean;
    values: Record<string, unknown>;
    visible: boolean;
}

export default class VisRxWidgetMock extends React.Component<MockWidgetProps, MockWidgetState> {
    static getI18nPrefix(): string {
        return '';
    }

    static getText(text: ioBroker.StringOrTranslated): string {
        if (typeof text === 'object') {
            return (text as Record<string, string>)[language] || text.en;
        }
        return text;
    }

    static t(key: string, ...args: string[]): string {
        const full = `${this.getI18nPrefix()}${key}`;
        let text = words[language]?.[full] ?? words.en?.[full] ?? full;
        for (const arg of args) {
            text = text.replace('%s', arg);
        }
        return text;
    }

    static getLanguage(): string {
        return language;
    }

    constructor(props: MockWidgetProps) {
        super(props);
        this.state = {
            rxData: { ...props.data },
            rxStyle: { ...props.style },
            editMode: !!props.editMode,
            values: {},
            visible: true,
        };
    }

    componentDidMount(): void {
        // nothing - vis-2 subscribes the bindings here
    }

    componentDidUpdate(prevProps: MockWidgetProps): void {
        if (prevProps.data !== this.props.data) {
            const prevRxData = this.state.rxData;
            this.setState({ rxData: { ...this.props.data } }, () => this.onRxDataChanged(prevRxData));
        }
        if (prevProps.editMode !== this.props.editMode) {
            this.setState({ editMode: this.props.editMode });
        }
        if (prevProps.style !== this.props.style) {
            this.setState({ rxStyle: { ...this.props.style } });
        }
    }

    componentWillUnmount(): void {
        // nothing
    }

    onRxDataChanged(_prevRxData: Record<string, unknown>): void {
        // overwritten by the widgets
    }

    renderWidgetBody(_props: RxRenderWidgetProps): React.JSX.Element | React.JSX.Element[] | null {
        return null;
    }

    /** The card of vis-2 (`VisRxWidget.wrapContent`), with the same styles */
    wrapContent(
        content: React.JSX.Element | React.JSX.Element[],
        addToHeader?: React.JSX.Element | null | React.JSX.Element[],
        cardContentStyle?: React.CSSProperties,
        headerStyle?: React.CSSProperties,
        onCardClick?: (e?: React.MouseEvent<HTMLDivElement>) => void,
    ): React.JSX.Element {
        const title = this.state.rxData.widgetTitle as string | undefined;
        return (
            <Card
                className="vis_rx_widget_card"
                style={{ width: 'calc(100% - 8px)', height: 'calc(100% - 8px)', margin: 4, boxSizing: 'border-box' }}
                onClick={onCardClick}
            >
                <CardContent
                    className="vis_rx_widget_card_content"
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        height: 'calc(100% - 32px)',
                        paddingBottom: 16,
                        position: 'relative',
                        ...cardContentStyle,
                    }}
                >
                    {title ? (
                        <div
                            className="vis_rx_widget_card_name"
                            style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                width: '100%',
                                alignItems: 'center',
                            }}
                        >
                            <div
                                className="vis_rx_widget_card_name_div"
                                style={{ fontSize: 24, paddingTop: 0, paddingBottom: 4, ...headerStyle }}
                            >
                                {title}
                            </div>
                            {addToHeader || null}
                        </div>
                    ) : (
                        addToHeader || null
                    )}
                    {content}
                </CardContent>
            </Card>
        );
    }

    render(): React.JSX.Element {
        const props = {
            className: 'vis-widget',
            overlayClassNames: [],
            style: {},
            id: this.props.id,
            refService: React.createRef<HTMLElement>(),
            widget: { usedInWidget: false },
        } as unknown as RxRenderWidgetProps;

        return (
            <div
                className="vis-widget"
                id={this.props.id}
                style={{
                    position: 'relative',
                    boxSizing: 'border-box',
                    width: this.state.rxStyle.width,
                    height: this.state.rxStyle.height,
                }}
            >
                {this.renderWidgetBody(props)}
            </div>
        );
    }
}
