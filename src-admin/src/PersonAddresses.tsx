import React from 'react';

// important to import from the package and not from some children
import { ConfigGeneric, type ConfigGenericProps, type ConfigGenericState } from '@iobroker/json-config';
import { I18n } from '@iobroker/gui-components';
import { Autocomplete, Box, Chip, CircularProgress, TextField, Tooltip } from '@mui/material';

/** A device which can be chosen: from the box (`discovery`) or from the tab "Devices" */
interface Host {
    name: string;
    mac: string;
    ip: string;
    /** `undefined` for a device which only the configuration knows */
    active?: boolean;
}

interface PersonAddressesState extends ConfigGenericState {
    hosts: Host[];
    loading: boolean;
}

/** Same rules as `splitAddresses()` of `src/lib/utils.ts` */
function isMac(address: string): boolean {
    return (
        address.replace(/[^0-9a-fA-F]/g, '').length === 12 &&
        !address.includes('::') &&
        /^[0-9a-fA-F:\-.\s]+$/.test(address)
    );
}

/** MAC, IP or host name - a host name cannot contain a colon, an IPv6 address needs one */
function isAddress(address: string): boolean {
    return (
        isMac(address) ||
        /^(\d{1,3})(\.\d{1,3}){3}$/.test(address) ||
        /^[0-9a-fA-F:]+$/.test(address) ||
        !address.includes(':')
    );
}

/** Compares MACs independent of their spelling, IPs and host names as text in lower case */
function addressKey(address: string): string {
    return isMac(address) ? address.replace(/[^0-9a-fA-F]/g, '').toUpperCase() : address.trim().toLowerCase();
}

function splitAddresses(text: string | undefined): string[] {
    return String(text || '')
        .split(/[,;]/)
        .map(address => address.trim())
        .filter(Boolean);
}

/**
 * The device list of the box, asked once per page: every row of the table is an own component,
 * and the adapter would read the box for each of them.
 */
let hostsPromise: Promise<Host[]> | null = null;
let hostsInstance = '';

/**
 * Column "MAC / IP" of the tab "Persons": the addresses as chips, chosen from the devices of the box
 * by name, MAC or IP. A typed text which is no MAC or IP is a host name of the box. Stored as before - a text, separated by commas - so the adapter is unchanged.
 */
export default class PersonAddresses extends ConfigGeneric<ConfigGenericProps, PersonAddressesState> {
    constructor(props: ConfigGenericProps) {
        super(props);
        this.state = {
            ...this.state,
            hosts: [],
            loading: false,
        };
    }

    async componentDidMount(): Promise<void> {
        await super.componentDidMount();
        if (!this.props.alive) {
            return;
        }
        const instance = `${this.props.oContext.adapterName}.${this.props.oContext.instance}`;
        if (!hostsPromise || hostsInstance !== instance) {
            hostsInstance = instance;
            // without `native` the adapter answers with the found devices as JSON string
            hostsPromise = this.props.oContext.socket
                .sendTo(instance, 'discovery', { onlyActive: false })
                .then((answer: unknown) => {
                    const list: unknown = typeof answer === 'string' ? JSON.parse(answer) : answer;
                    return Array.isArray(list) ? (list as Host[]) : [];
                })
                .catch((error: unknown) => {
                    console.error(`Cannot read the devices of the box: ${String(error)}`);
                    hostsPromise = null;
                    return [];
                });
        }
        this.setState({ loading: true });
        const hosts = await hostsPromise;
        this.setState({ hosts, loading: false });
    }

    /** Devices of the box plus those of the tab "Devices" which the box does not list */
    private getHosts(): Host[] {
        const hosts = [...this.state.hosts];
        const known = new Set(hosts.map(host => addressKey(host.mac)));
        const configured = (this.props.globalData?.devices || []) as { name?: string; mac?: string; ip?: string }[];
        for (const device of configured) {
            for (const mac of splitAddresses(device.mac)) {
                if (isMac(mac) && !known.has(addressKey(mac))) {
                    known.add(addressKey(mac));
                    hosts.push({ name: device.name || '', mac, ip: device.ip || '' });
                }
            }
        }
        return hosts.sort((a, b) => (a.name || a.mac).localeCompare(b.name || b.mac));
    }

    /** address key -> name of the other person which has it already */
    private getUsedBy(): Map<string, string> {
        const used = new Map<string, string>();
        const persons = (this.props.globalData?.persons || []) as { name?: string; addresses?: string }[];
        persons.forEach((person, index) => {
            if (index !== this.props.arrayIndex) {
                splitAddresses(person.addresses).forEach(address => used.set(addressKey(address), person.name || ''));
            }
        });
        return used;
    }

    private setAddresses(addresses: string[]): void {
        // a pasted list arrives as one entry
        const list = addresses.flatMap(address => splitAddresses(address));
        const unique = list.filter(
            (address, i) => list.findIndex(other => addressKey(other) === addressKey(address)) === i,
        );
        void this.onChange(this.props.attr, unique.join(', '));
    }

    renderItem(_error: string, disabled: boolean): React.JSX.Element {
        const value = splitAddresses(ConfigGeneric.getValue(this.props.data, this.props.attr));
        const hosts = this.getHosts();
        const byKey = new Map<string, Host>();
        hosts.forEach(host => {
            byKey.set(addressKey(host.mac), host);
            if (host.ip) {
                byKey.set(addressKey(host.ip), host);
            }
            if (host.name && !byKey.has(addressKey(host.name))) {
                byKey.set(addressKey(host.name), host);
            }
        });
        const usedBy = this.getUsedBy();
        const selected = new Set(value.map(addressKey));

        return (
            <Autocomplete<string, true, false, true>
                multiple
                freeSolo
                autoSelect
                fullWidth
                disabled={disabled}
                value={value}
                options={hosts.map(host => host.mac)}
                loading={this.state.loading}
                filterOptions={(options, { inputValue }) => {
                    const search = inputValue.trim().toLowerCase();
                    return options.filter(mac => {
                        if (selected.has(addressKey(mac))) {
                            return false;
                        }
                        if (!search) {
                            return true;
                        }
                        const host = byKey.get(addressKey(mac));
                        return [host?.name, mac, host?.ip].some(text => text?.toLowerCase().includes(search));
                    });
                }}
                onChange={(_event, addresses) => this.setAddresses(addresses)}
                renderOption={(props, mac) => {
                    const host = byKey.get(addressKey(mac));
                    const other = usedBy.get(addressKey(mac));
                    const { key, ...optionProps } = props as typeof props & { key: string };
                    return (
                        <Box
                            component="li"
                            key={key}
                            {...optionProps}
                            sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
                        >
                            <Box
                                sx={{
                                    width: 8,
                                    height: 8,
                                    borderRadius: '50%',
                                    flexShrink: 0,
                                    bgcolor: host?.active ? 'success.main' : 'action.disabled',
                                }}
                            />
                            <Box sx={{ minWidth: 0 }}>
                                <div>{host?.name || mac}</div>
                                <Box sx={{ fontSize: 12, opacity: 0.7 }}>
                                    {[mac, host?.ip].filter(Boolean).join(' · ')}
                                    {other !== undefined ? ` · ${I18n.t('tr064_usedBy', other)}` : ''}
                                </Box>
                            </Box>
                        </Box>
                    );
                }}
                renderValue={(addresses, getItemProps) =>
                    addresses.map((address, index) => {
                        const host = byKey.get(addressKey(address));
                        const { key, ...itemProps } = getItemProps({ index });
                        const valid = isAddress(address);
                        return (
                            <Tooltip
                                key={key}
                                title={
                                    valid
                                        ? [host?.name, address, host?.ip !== address ? host?.ip : '']
                                              .filter(Boolean)
                                              .join(' · ')
                                        : I18n.t('tr064_invalidAddress')
                                }
                            >
                                <Chip
                                    size="small"
                                    color={valid ? 'default' : 'error'}
                                    label={host?.name ? `${host.name} (${address})` : address}
                                    {...itemProps}
                                />
                            </Tooltip>
                        );
                    })
                }
                renderInput={params => (
                    <TextField
                        {...params}
                        variant="standard"
                        placeholder={value.length ? '' : I18n.t('tr064_addressesPlaceholder')}
                        slotProps={{
                            ...params.slotProps,
                            input: {
                                ...params.slotProps.input,
                                endAdornment: (
                                    <>
                                        {this.state.loading ? <CircularProgress size={16} /> : null}
                                        {params.slotProps.input.endAdornment}
                                    </>
                                ),
                            },
                        }}
                    />
                )}
            />
        );
    }
}
