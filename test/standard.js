'use strict';

// the unit tests run against the TypeScript sources
require('tsx/cjs');

const assert = require('node:assert');
const { callRequest, clientsOfHosts, guestWifiRequest, onlineFilter, standardError } = require('../src/lib/standard');
const { TR064Client } = require('../src/lib/tr064');

const host = (mac, name, active, more = {}) => ({
    NewMACAddress: mac,
    NewHostName: name,
    NewIPAddress: '',
    NewActive: active ? '1' : '0',
    ...more,
});

describe('network.getClients', () => {
    const topology = {
        nodes: [
            { uid: 'n-1', name: 'FRITZ!Box', mac: 'AA:BB:CC:00:00:01', role: 'master' },
            { uid: 'n-2', name: 'phone', mac: 'AA:BB:CC:00:00:02', role: 'client' },
        ],
        links: [{ from: 'n-1', to: 'n-2', type: 'WLAN', state: 'CONNECTED', interface: 'AP:5G:0', band: 5 }],
    };
    const hosts = [
        host('aa:bb:cc:00:00:02', 'phone', true, {
            NewIPAddress: '192.168.178.20',
            NewInterfaceType: '802.11',
            'NewX_AVM-DE_Guest': '0',
        }),
        host('AA:BB:CC:00:00:03', 'printer', false, { NewInterfaceType: 'Ethernet' }),
        host('AA:BB:CC:00:00:04', 'guest-tablet', true, { NewInterfaceType: '802.11', 'NewX_AVM-DE_Guest': '1' }),
        // listed twice (LAN and WLAN): the online entry wins
        host('AA:BB:CC:00:00:05', 'laptop', false, { NewInterfaceType: 'Ethernet' }),
        host('AA:BB:CC:00:00:05', 'laptop', true, { NewInterfaceType: '802.11' }),
        host('', 'no mac', true),
    ];

    it('maps the host list to {mac, name, ip?, online, wired?, guest?, accessPoint?}', () => {
        assert.deepStrictEqual(clientsOfHosts(hosts, undefined, topology), [
            {
                mac: 'AA:BB:CC:00:00:02',
                name: 'phone',
                ip: '192.168.178.20',
                online: true,
                wired: false,
                accessPoint: 'FRITZ!Box',
            },
            { mac: 'AA:BB:CC:00:00:03', name: 'printer', online: false, wired: true },
            { mac: 'AA:BB:CC:00:00:04', name: 'guest-tablet', online: true, wired: false, guest: true },
            { mac: 'AA:BB:CC:00:00:05', name: 'laptop', online: true, wired: false },
        ]);
    });

    it('filters by online', () => {
        assert.deepStrictEqual(
            clientsOfHosts(hosts, true, null).map(c => c.name),
            ['phone', 'guest-tablet', 'laptop'],
        );
        assert.deepStrictEqual(
            clientsOfHosts(hosts, false, null).map(c => c.name),
            ['printer'],
        );
        assert.strictEqual(onlineFilter({ online: true }), true);
        assert.strictEqual(onlineFilter({ online: 'false' }), false);
        assert.strictEqual(onlineFilter({}), undefined);
        assert.strictEqual(onlineFilter(undefined), undefined);
        assert.strictEqual(onlineFilter({ online: 'yes' }).reason, 'BAD_REQUEST');
    });
});

describe('network.guestWifi', () => {
    it('reads without enabled and switches with it', () => {
        assert.deepStrictEqual(guestWifiRequest(undefined), {});
        assert.deepStrictEqual(guestWifiRequest({ minutes: 60 }), {});
        assert.deepStrictEqual(guestWifiRequest({ enabled: true }), { enabled: true });
        assert.deepStrictEqual(guestWifiRequest({ enabled: 'false' }), { enabled: false });
        assert.deepStrictEqual(guestWifiRequest({ enabled: false, minutes: 60 }), { enabled: false });
    });

    it('refuses minutes and unusable values', () => {
        assert.strictEqual(guestWifiRequest({ enabled: true, minutes: 60 }).reason, 'NOT_SUPPORTED');
        assert.strictEqual(guestWifiRequest({ enabled: 'on' }).reason, 'BAD_REQUEST');
    });
});

describe('phone.call', () => {
    const contacts = [
        { name: 'Anna Schmidt', number: '+493012345' },
        { name: 'Anna Schmidt', number: '+4917012345' },
        { name: 'Bernd', number: '+493099999' },
        { name: 'Bernd Müller', number: '+493088888' },
        { name: 'Карл', number: '+493077777' },
    ];

    it('maps a number and seconds to the value of the state ring', () => {
        assert.deepStrictEqual(callRequest({ to: '**610' }, []), {
            ring: '**610',
            to: '**610',
            text: 'The FritzBox dials **610 with its dialing help',
        });
        const request = callRequest({ to: '030 / 123-45', seconds: '20' }, []);
        assert.strictEqual(request.ring, '03012345,20');
        assert.strictEqual(request.to, '03012345');
        assert.strictEqual(callRequest({ to: 610 }, []).ring, '610');
    });

    it('finds a contact by name, the exact name before a part', () => {
        const bernd = callRequest({ to: 'bernd' }, contacts);
        assert.strictEqual(bernd.ring, '+493099999');
        assert.strictEqual(bernd.text, 'The FritzBox dials Bernd (+493099999) with its dialing help');
        assert.strictEqual(callRequest({ to: 'müller' }, contacts).to, '+493088888');
        assert.strictEqual(callRequest({ to: 'карл' }, contacts).to, '+493077777');
    });

    it('answers AMBIGUOUS and NOT_FOUND with candidates', () => {
        assert.deepStrictEqual(callRequest({ to: 'Bern' }, contacts), {
            error: '"Bern" fits several contacts',
            reason: 'AMBIGUOUS',
            candidates: ['Bernd', 'Bernd Müller'],
        });
        assert.deepStrictEqual(callRequest({ to: 'Anna' }, contacts).candidates, ['+493012345', '+4917012345']);
        const none = callRequest({ to: 'Zoe' }, contacts);
        assert.strictEqual(none.reason, 'NOT_FOUND');
        assert.deepStrictEqual(none.candidates, ['Anna Schmidt', 'Bernd', 'Bernd Müller', 'Карл']);
        assert.strictEqual(callRequest({ to: 'Zoe' }, []).reason, 'NOT_FOUND');
    });

    it('refuses what the box cannot do', () => {
        assert.strictEqual(callRequest({}, contacts).reason, 'BAD_REQUEST');
        assert.strictEqual(callRequest({ to: '**610', from: 'kitchen' }, contacts).reason, 'NOT_SUPPORTED');
        assert.strictEqual(callRequest({ to: '**610', text: 'dinner' }, contacts).reason, 'NOT_SUPPORTED');
        assert.strictEqual(callRequest({ to: '**610', seconds: 'x' }, contacts).reason, 'BAD_REQUEST');
    });

    it('dials with the dialing help and answers through the callback', () => {
        const dialed = [];
        const timers = [];
        let hungUp = 0;
        const client = {
            voip: {
                'X_AVM-DE_DialNumber': (args, cb) => {
                    dialed.push(args['NewX_AVM-DE_PhoneNumber']);
                    cb(args['NewX_AVM-DE_PhoneNumber'] === '0' ? new Error('refused') : null, {});
                },
                'X_AVM-DE_DialHangup': (_args, cb) => {
                    hungUp++;
                    cb(null, {});
                },
            },
            adapter: {
                log: { debug() {}, silly() {}, warn() {}, error() {} },
                setTimeout: (fn, ms) => timers.push(ms),
                clearTimeout() {},
            },
            safe: TR064Client.prototype.safe,
            clearRingTimeout: TR064Client.prototype.clearRingTimeout,
        };
        const results = [];
        TR064Client.prototype.ring.call(client, '**610,20', err => results.push(err));
        TR064Client.prototype.ring.call(client, '0', err => results.push(err && err.message));
        assert.deepStrictEqual(dialed, ['**610', '0']);
        assert.deepStrictEqual(results, [null, 'refused']);
        assert.deepStrictEqual(timers, [20_000]);
        assert.strictEqual(TR064Client.prototype.canDial.call(client), true);
        assert.strictEqual(TR064Client.prototype.canDial.call({}), false);

        TR064Client.prototype.hangup.call(client, err => results.push(err));
        assert.strictEqual(hungUp, 1);
        TR064Client.prototype.hangup.call({}, err => results.push(err.message));
        assert.deepStrictEqual(results.slice(2), [null, 'not supported']);
    });
});

describe('standard errors', () => {
    it('maps the errors of the box to reasons', () => {
        assert.deepStrictEqual(standardError('not connected'), { error: 'not connected', reason: 'NOT_CONNECTED' });
        assert.deepStrictEqual(standardError(new Error('not supported')), {
            error: 'not supported',
            reason: 'NOT_SUPPORTED',
        });
        assert.strictEqual(standardError('timeout').reason, 'TIMEOUT');
        assert.deepStrictEqual(standardError(new Error('HTTP 500')), { error: 'HTTP 500' });
    });
});
