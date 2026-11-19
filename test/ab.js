'use strict';

// the unit tests run against the TypeScript sources
require('tsx/cjs');

const assert = require('node:assert');
const { isOn } = require('../src/lib/utils');
const { TR064Client } = require('../src/lib/tr064');

/** Calls setAB with a fake client and returns the arguments of SetEnable */
function setAB(val, abIndex) {
    let args;
    const client = { abIndex, setEnableAB: a => (args = a) };
    TR064Client.prototype.setAB.call(client, val);
    return args;
}

describe('answering machine', () => {
    it('reads "0", "false" and "off" as off', () => {
        for (const val of [false, 0, '', '0', 'false', 'FALSE', 'off', ' 0 ']) {
            assert.strictEqual(isOn(val), false, JSON.stringify(val));
        }
        for (const val of [true, 1, '1', 'true', 'on', '2']) {
            assert.strictEqual(isOn(val), true, JSON.stringify(val));
        }
    });

    it('switches off with "<index>,0"', () => {
        assert.deepStrictEqual(setAB('1,0', 0), { NewIndex: 1, NewEnable: 0 });
        assert.deepStrictEqual(setAB('2, false', 0), { NewIndex: 2, NewEnable: 0 });
        assert.deepStrictEqual(setAB('1,off', 0), { NewIndex: 1, NewEnable: 0 });
        assert.deepStrictEqual(setAB('1,1', 0), { NewIndex: 1, NewEnable: 1 });
        assert.deepStrictEqual(setAB('0,true', 2), { NewIndex: 0, NewEnable: 1 });
    });

    it('uses states.abIndex without an index', () => {
        assert.deepStrictEqual(setAB(true, 2), { NewIndex: 2, NewEnable: 1 });
        assert.deepStrictEqual(setAB(false, 2), { NewIndex: 2, NewEnable: 0 });
        assert.deepStrictEqual(setAB('false', undefined), { NewIndex: 0, NewEnable: 0 });
    });
});
