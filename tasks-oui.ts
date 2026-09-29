/**
 * Generates `data/oui.txt`, the manufacturer list which `src/lib/oui.ts` resolves a MAC address
 * with. Run with `npm run update-oui` (`tsx tasks-oui.ts`).
 *
 * The three registries of the IEEE are fetched and merged into one file which is sorted by the
 * prefix, so that the lookup can binary search it without building a map:
 *
 *   MA-L  oui.csv     24 bit, `001A2B`      the classic OUI
 *   MA-M  mam.csv     28 bit, `001A2B3`     small blocks
 *   MA-S  oui36.csv   36 bit, `001A2B3C4`   smallest blocks
 *
 * A prefix which the IEEE keeps for itself (`IEEE Registration Authority` - the parent block of a
 * MA-M/MA-S assignment) or which the registrant hid (`Private`) is dropped: it would only show a
 * name which tells the user nothing.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = __dirname;

/** The registries, longest prefix last - the order in the file does not matter, it is sorted */
const REGISTRIES: { url: string; digits: number }[] = [
    { url: 'https://standards-oui.ieee.org/oui/oui.csv', digits: 6 },
    { url: 'https://standards-oui.ieee.org/oui28/mam.csv', digits: 7 },
    { url: 'https://standards-oui.ieee.org/oui36/oui36.csv', digits: 9 },
];

/** Names which are not a manufacturer */
const IGNORED = ['private', 'ieee registration authority'];

/** The longest manufacturer name which is kept - the view has no room for more */
const MAX_NAME = 48;

/** One row of an IEEE CSV file (`Registry,Assignment,Organization Name,Organization Address`) */
function parseCsvLine(line: string): string[] {
    const fields: string[] = [];
    let field = '';
    let quoted = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (quoted) {
            if (char === '"') {
                // "" inside a quoted field is one quote
                if (line[i + 1] === '"') {
                    field += '"';
                    i++;
                } else {
                    quoted = false;
                }
            } else {
                field += char;
            }
        } else if (char === '"') {
            quoted = true;
        } else if (char === ',') {
            fields.push(field);
            field = '';
        } else {
            field += char;
        }
    }
    fields.push(field);
    return fields;
}

/** Whitespace of the IEEE files collapsed, no tab (the separator) and not longer than `MAX_NAME` */
function cleanName(name: string): string {
    const text = name.replace(/\s+/g, ' ').trim();
    return text.length > MAX_NAME ? `${text.slice(0, MAX_NAME - 1).trimEnd()}…` : text;
}

async function fetchRegistry(url: string, digits: number, into: Map<string, string>): Promise<number> {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`${url}: ${response.status} ${response.statusText}`);
    }
    const text = await response.text();
    let count = 0;

    for (const line of text.split('\n')) {
        if (!line.trim() || line.startsWith('Registry,')) {
            continue;
        }
        const fields = parseCsvLine(line);
        const prefix = (fields[1] || '').toUpperCase().replace(/[^0-9A-F]/g, '');
        const name = cleanName(fields[2] || '');
        if (prefix.length !== digits || !name || IGNORED.includes(name.toLowerCase())) {
            continue;
        }
        into.set(prefix, name);
        count++;
    }

    console.log(`${url}: ${count} entries`);
    return count;
}

async function main(): Promise<void> {
    const entries = new Map<string, string>();
    for (const registry of REGISTRIES) {
        await fetchRegistry(registry.url, registry.digits, entries);
    }
    if (entries.size < 10_000) {
        throw new Error(`Only ${entries.size} entries - the IEEE files look incomplete`);
    }

    const sorted = [...entries.keys()].sort();
    const date = new Date().toISOString().slice(0, 10);
    const lines = [`# IEEE MA-L/MA-M/MA-S, ${date}, ${sorted.length} entries - npm run update-oui`];
    for (const prefix of sorted) {
        lines.push(`${prefix}\t${entries.get(prefix)!}`);
    }

    const file = join(ROOT, 'data', 'oui.txt');
    mkdirSync(join(ROOT, 'data'), { recursive: true });
    writeFileSync(file, `${lines.join('\n')}\n`);
    console.log(`Wrote ${file}: ${sorted.length} entries, ${Math.round(lines.join('\n').length / 1024)} kB`);
}

main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
});
