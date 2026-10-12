import React from 'react';

import { Autocomplete, TextField } from '@mui/material';

import type {
    RxWidgetInfoAttributesField,
    RxWidgetInfoCustomComponentProperties,
    WidgetData,
} from '@iobroker/types-vis-2';

import Generic, { instanceIdOf } from './Generic';
import { loadPersons, personGroups, type PresenceSocket } from './shared/presenceApi';

interface PresenceSelectProps {
    /** `person`: the names of the persons, `group`: their groups */
    kind: 'person' | 'group';
    socket: PresenceSocket | undefined;
    /** value of the attribute `instance` */
    instance: unknown;
    value: string;
    onChange: (value: string) => void;
}

/**
 * The names of the persons (or groups) of the instance as a dropdown. A widget stores the name, not
 * an object ID. While the list cannot be read (no connection, no persons yet) any text can be entered.
 */
function PresenceSelect(props: PresenceSelectProps): React.JSX.Element {
    const { kind, socket, value, onChange } = props;
    const instanceId = instanceIdOf(props.instance);
    const [options, setOptions] = React.useState<string[]>([]);

    React.useEffect(() => {
        let active = true;
        if (!socket) {
            setOptions([]);
            return undefined;
        }
        void loadPersons(socket, instanceId).then(persons => {
            if (active) {
                setOptions(kind === 'group' ? personGroups(persons) : persons.map(p => p.name));
            }
        });
        return () => {
            active = false;
        };
    }, [socket, instanceId, kind]);

    return (
        <Autocomplete
            freeSolo
            fullWidth
            size="small"
            options={options}
            value={value}
            inputValue={value}
            onInputChange={(_e, text, reason) => {
                // `reset` is the value written back by the component itself
                if (reason !== 'reset' || text !== value) {
                    onChange(text);
                }
            }}
            onChange={(_e, selected) => onChange(typeof selected === 'string' ? selected : '')}
            renderInput={params => (
                <TextField
                    {...params}
                    variant="standard"
                    placeholder={kind === 'group' ? Generic.t('all_groups') : ''}
                />
            )}
        />
    );
}

/**
 * `component` of a vis-2 attribute of the type `custom` which holds the name of a person or group
 *
 * @param kind what is selected
 */
export function presenceSelectComponent(
    kind: 'person' | 'group',
): (
    field: RxWidgetInfoAttributesField,
    data: WidgetData,
    onDataChange: (newData: WidgetData) => void,
    props: RxWidgetInfoCustomComponentProperties,
) => React.JSX.Element {
    // not a component: vis-2 calls it as a function and renders what it returns
    return function presenceSelectField(field, data, onDataChange, props) {
        const name = field.name || kind;
        const raw = (data as Record<string, unknown>)[name];
        return (
            <PresenceSelect
                kind={kind}
                socket={props?.context?.socket}
                instance={(data as Record<string, unknown>).instance}
                value={typeof raw === 'string' ? raw : ''}
                onChange={value => onDataChange({ [name]: value })}
            />
        );
    };
}
