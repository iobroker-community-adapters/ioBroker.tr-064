'use strict';

// the unit tests run against the TypeScript sources
require('tsx/cjs');

const assert = require('node:assert');
const { buildMeshTopology } = require('../src/lib/mesh');

describe('buildMeshTopology', () => {
    it('takes the IP of a node without ip_addresses from the host list (#755)', () => {
        const list = {
            nodes: [
                { uid: 'n-1', device_name: 'box', device_mac_address: 'aa:bb:cc:00:00:01' },
                {
                    uid: 'n-2',
                    device_name: 'repeater',
                    device_mac_address: 'AA:BB:CC:00:00:02',
                    node_interfaces: [{ uid: 'ni-1', name: 'AP:5G:0', mac_address: 'aa:bb:cc:00:00:03' }],
                },
                { uid: 'n-3', device_name: 'unknown', device_mac_address: 'AA:BB:CC:00:00:04' },
            ],
        };
        const hostIps = new Map([
            ['AA:BB:CC:00:00:01', '192.168.178.1'],
            ['AA:BB:CC:00:00:03', '192.168.178.2'],
        ]);
        const { nodes } = buildMeshTopology(list, [], undefined, hostIps);
        assert.strictEqual(nodes[0].ip, '192.168.178.1');
        assert.strictEqual(nodes[1].ip, '192.168.178.2');
        assert.strictEqual(nodes[2].ip, undefined);
    });

    it('recognizes ip_addresses with the version IPv4', () => {
        const list = {
            nodes: [
                {
                    uid: 'n-1',
                    device_mac_address: 'AA:BB:CC:00:00:01',
                    ip_addresses: [
                        { version: 'IPv6', value: 'fe80::1' },
                        { version: 'IPv4', value: '192.168.178.20/24' },
                    ],
                },
            ],
        };
        const hostIps = new Map([['AA:BB:CC:00:00:01', '192.168.178.99']]);
        const { nodes } = buildMeshTopology(list, [], undefined, hostIps);
        assert.strictEqual(nodes[0].ip, '192.168.178.20');
    });
});
