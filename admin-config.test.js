const { expect } = require('chai');
const fs = require('fs');
const path = require('path');

describe('admin jsonConfig migration', () => {
    const repoDir = __dirname;
    const adminDir = path.join(repoDir, 'admin');
    const jsonConfig = JSON.parse(fs.readFileSync(path.join(adminDir, 'jsonConfig.json'), 'utf8'));
    const ioPackage = JSON.parse(fs.readFileSync(path.join(repoDir, 'io-package.json'), 'utf8'));
    const languages = ['de', 'en', 'es', 'fr', 'it', 'nl', 'pl', 'pt', 'ru', 'uk', 'zh-cn'];
    const translationKeys = new Set();

    function collectTexts(node) {
        if (!node || typeof node !== 'object') {
            return;
        }
        for (const key of ['label', 'help', 'text', 'title', 'tooltip']) {
            if (typeof node[key] === 'string' && node[key]) {
                translationKeys.add(node[key]);
            }
        }
        if (node.items && !Array.isArray(node.items)) {
            Object.values(node.items).forEach(collectTexts);
        }
        if (Array.isArray(node.items)) {
            node.items.forEach(collectTexts);
        }
        if (Array.isArray(node.options)) {
            node.options.forEach(collectTexts);
        }
    }

    it('uses jsonConfig for the admin UI', () => {
        expect(ioPackage.common.adminUI).to.deep.equal({ config: 'json' });
        expect(fs.existsSync(path.join(adminDir, 'index_m.html'))).to.equal(false);
        expect(fs.existsSync(path.join(adminDir, 'words.js'))).to.equal(false);
    });

    it('defines all expected configuration fields in jsonConfig', () => {
        expect(jsonConfig.type).to.equal('tabs');
        expect(jsonConfig.i18n).to.equal(true);
        expect(jsonConfig.items.optionsTab.items).to.include.all.keys(
            'iporhost',
            'pollingInterval',
            'user',
            'password',
            'useCallMonitor',
            'usePhonebook',
            'useDeflectionOptions',
            'useDevices',
            'useMDNS',
            'jsonDeviceList'
        );
        expect(jsonConfig.items.optionsTab.items.useDeflectionOptions.default).to.equal(true);
        expect(jsonConfig.items.optionsTab.items.useMDNS.default).to.equal(true);
        expect(jsonConfig.items.optionsTab.items.jsonDeviceList.default).to.equal(false);
        expect(jsonConfig.items.devicesTab.items.devices.type).to.equal('table');
        expect(jsonConfig.items.calllistsTab.items).to.include.all.keys(
            'calllists.all.generateJSON',
            'calllists.all.generateHTML',
            'calllists.all.maxEntries',
            'calllists.missed.generateJSON',
            'calllists.missed.generateHTML',
            'calllists.missed.maxEntries',
            'calllists.outbound.generateJSON',
            'calllists.outbound.generateHTML',
            'calllists.outbound.maxEntries',
            'calllists.inbound.generateJSON',
            'calllists.inbound.generateHTML',
            'calllists.inbound.maxEntries'
        );
    });

    it('provides short-form translations for all jsonConfig texts', () => {
        collectTexts(jsonConfig);
        for (const language of languages) {
            const filePath = path.join(adminDir, 'i18n', `${language}.json`);
            expect(fs.existsSync(filePath), filePath).to.equal(true);
            const translations = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            for (const key of translationKeys) {
                expect(translations[key], `${language}:${key}`).to.be.a('string').and.not.equal('');
            }
        }
    });
});
