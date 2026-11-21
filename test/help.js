'use strict';

// the unit tests run against the TypeScript sources
require('tsx/cjs');

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { COMMANDS, HELP } = require('../src/lib/help');

/** The commands of the switch in `onMessage` of src/main.ts */
function commandsOfMain() {
    const source = fs.readFileSync(path.join(__dirname, '../src/main.ts'), 'utf8');
    const start = source.indexOf('private onMessage(');
    const end = source.indexOf('private sendDiscoveryResult(');
    assert.ok(start > 0 && end > start, 'onMessage found');
    return [...source.slice(start, end).matchAll(/case '([^']+)':/g)].map(m => m[1]);
}

describe('help', () => {
    it('lists exactly the commands onMessage answers, each once', () => {
        const names = COMMANDS.map(c => c.command);
        assert.strictEqual(new Set(names).size, names.length);
        assert.deepStrictEqual([...names].sort(), commandsOfMain().sort());
    });

    it('marks only the commands with an effect as writing', () => {
        const writing = ['setHostName', 'guestWifi', 'call', 'hangup'];
        for (const { command, write } of COMMANDS) {
            assert.strictEqual(typeof write, 'boolean', command);
            assert.strictEqual(write, writing.includes(command), command);
        }
    });

    it('marks the commands of the shared catalog with their standard', () => {
        const marked = Object.fromEntries(COMMANDS.filter(c => c.standard).map(c => [c.command, c.standard]));
        assert.deepStrictEqual(marked, {
            getPersons: 'presence.getPersons',
            getClients: 'network.getClients',
            guestWifi: 'network.guestWifi',
            call: 'phone.call',
            hangup: 'phone.hangup',
        });
        for (const [command, standard] of Object.entries(marked)) {
            assert.match(standard, /^[a-z]+\.[a-z][A-Za-z]+$/, command);
            assert.ok(HELP.includes(`- ${command}`) && HELP.includes(`(${standard})`), command);
        }
    });

    it('names every command for an agent', () => {
        for (const { command } of COMMANDS.filter(c => c.command !== 'help')) {
            assert.ok(HELP.includes(`- ${command}`), command);
        }
        assert.ok(HELP.includes('sendTo tr-064.0'));
        assert.ok(HELP.includes("user's explicit request"));
    });

    it('keeps the lines short', () => {
        for (const line of HELP.split('\n')) {
            assert.ok(line.length <= 120, line);
        }
    });
});
