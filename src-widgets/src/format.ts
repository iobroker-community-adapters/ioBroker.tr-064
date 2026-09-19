/** Formatting of the values of the FRITZ!Box for the widgets */

export interface FormattedRate {
    value: string;
    unit: string;
}

/** `value` with `digits` decimals in the notation of the language */
export function formatNumber(value: number, digits: number, lang: string): string {
    try {
        return value.toLocaleString(lang === 'zh-cn' ? 'zh-CN' : lang, {
            minimumFractionDigits: digits,
            maximumFractionDigits: digits,
        });
    } catch {
        return value.toFixed(digits);
    }
}

/**
 * A data rate in the unit which fits: `87.3 Mbit/s`, `512 kbit/s`, `1.2 Gbit/s`.
 * Three significant digits at most, so the text does not jump around while the value changes.
 *
 * @param bitsPerSecond rate in bit/s
 * @param lang language of vis-2, decides about the decimal separator
 */
export function formatBitRate(bitsPerSecond: number, lang: string): FormattedRate {
    const bps = Number.isFinite(bitsPerSecond) && bitsPerSecond > 0 ? bitsPerSecond : 0;
    const units: [number, string][] = [
        [1e9, 'Gbit/s'],
        [1e6, 'Mbit/s'],
        [1e3, 'kbit/s'],
    ];
    for (const [factor, unit] of units) {
        if (bps >= factor) {
            const value = bps / factor;
            return { value: formatNumber(value, value >= 100 ? 0 : 1, lang), unit };
        }
    }
    return { value: formatNumber(bps, 0, lang), unit: 'bit/s' };
}

/**
 * The same for a rate in bytes per second (`states.wanReceiveRate`, `states.wanSendRate`)
 *
 * @param bytesPerSecond rate in B/s
 * @param lang language of vis-2
 */
export function formatByteRate(bytesPerSecond: number, lang: string): FormattedRate {
    return formatBitRate(bytesPerSecond * 8, lang);
}

/** `true`/`false` of a state value, `undefined` if the state does not exist */
export function toBool(value: ioBroker.StateValue | undefined): boolean | undefined {
    if (value === undefined || value === null) {
        return undefined;
    }
    if (typeof value === 'string') {
        return value === 'true' || value === '1' || value === 'on';
    }
    return !!value;
}

/** A number of a state value, `undefined` if the state does not exist or is not a number */
export function toNumber(value: ioBroker.StateValue | undefined): number | undefined {
    if (value === undefined || value === null || value === '') {
        return undefined;
    }
    const num = Number(value);
    return Number.isFinite(num) ? num : undefined;
}

/** A text of a state value, `''` if the state does not exist */
export function toText(value: ioBroker.StateValue | undefined): string {
    return value === undefined || value === null ? '' : String(value).trim();
}
