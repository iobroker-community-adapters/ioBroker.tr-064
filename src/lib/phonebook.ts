/** Phone book of the Fritz!Box - used to resolve numbers to names */
import { get as httpGet } from 'node:http';
import { get as httpsGet } from 'node:https';
import { Parser } from 'xml2js';
import type { Action, Device } from 'tr-O64';

import { normalizeName, normalizeNumber } from './utils';
import type { PhonebookContact, PhonebookEntry, PhonebookXml } from './types';
import type { Tr064Adapter } from '../main';

export interface PhonebookStartOptions {
    /** If true, the phone book is not read at all (option "Use phonebook" is switched off) */
    return?: boolean;
}

export class Phonebook {
    private readonly adapter: Tr064Adapter;
    private readonly parser = new Parser({
        explicitArray: false,
        mergeAttrs: true,
        normalizeTags: true,
        ignoreAttrs: true,
    });

    private entries: PhonebookEntry[] = [];
    private areaCode = '';
    private countryCode = '';
    private countryAndAreaCode = '';
    /** URL pattern to load a contact image, `{imageurl}` is replaced by the image path */
    private ownUrl = '';

    private getPhonebookList: Action | undefined;
    private getPhonebook: Action | undefined;
    private getVoIPCommonAreaCode: Action | undefined;
    private getVoIPCommonCountryCode: Action | undefined;

    public constructor(adapter: Tr064Adapter) {
        this.adapter = adapter;
    }

    /** Reads area code, country code and all phone books of the box */
    public start(sslDevice: Device, options: PhonebookStartOptions, cb?: (result: unknown) => void): void {
        if (options?.return) {
            cb?.(0);
            return;
        }

        this.init(sslDevice, () => this.read(true, cb));
    }

    private init(sslDevice: Device, cb?: (result: unknown) => void): void {
        // a repeater has no phone book, so check it
        if (sslDevice?.services) {
            const tel = sslDevice.services['urn:dslforum-org:service:X_AVM-DE_OnTel:1'];
            if (tel?.actions) {
                this.getPhonebookList = tel.actions.GetPhonebookList;
                this.getPhonebook = tel.actions.GetPhonebook;
            }
            const voip = sslDevice.services['urn:dslforum-org:service:X_VoIP:1'];
            if (voip?.actions) {
                this.getVoIPCommonAreaCode = voip.actions.GetVoIPCommonAreaCode;
                this.getVoIPCommonCountryCode = voip.actions.GetVoIPCommonCountryCode;
            }
        }

        if (!this.getVoIPCommonCountryCode) {
            cb?.(-1);
            return;
        }

        this.getVoIPCommonCountryCode((err, res) => {
            this.adapter.log.debug(`getVoIPCommonCountryCode: ${err ? err.message : res.NewVoIPCountryCode}`);
            if (!err && res) {
                this.countryCode = res.NewVoIPCountryCode;
            }

            this.getVoIPCommonAreaCode!((err, res) => {
                this.adapter.log.debug(`getVoIPCommonAreaCode: ${err ? err.message : res.NewVoIPAreaCode}`);
                if (!err && res) {
                    this.areaCode = res.NewVoIPAreaCode;
                    this.countryAndAreaCode = this.countryCode + this.areaCode.substring(1);
                }
                cb?.(0);
            });
        });
    }

    private read(read: boolean, cb?: (result: unknown) => void): void {
        if (!read) {
            cb?.(0);
            return;
        }

        this.adapter.log.debug('Phonebook.read');

        if (!this.getPhonebookList) {
            this.adapter.log.warn('Phonebook not supported');
            cb?.(-1);
            return;
        }

        this.getPhonebookList((err, res) => {
            if (err || !res) {
                cb?.(-1);
                return;
            }

            this.adapter.log.debug(`Phonebook.read: NewPhonebookList=${res.NewPhonebookList}`);
            const books = res.NewPhonebookList.split(',');
            let no = 0;
            this.entries = [];

            const doIt = (): void => {
                if (no >= books.length) {
                    cb?.(0);
                    return;
                }

                const phonebookId = books[no++];
                this.getPhonebook!({ NewPhonebookID: phonebookId }, (err, res) => {
                    this.adapter.log.debug(`Phonebook ${phonebookId}: ${JSON.stringify(res)} / err=${err}`);
                    if (err || !res) {
                        cb?.(err);
                        return;
                    }

                    const url = new URL(res.NewPhonebookURL);
                    let data = '';

                    const ar = /^(.*)\/phonebook.lua\?(.*)/.exec(res.NewPhonebookURL);
                    if (ar && ar.length >= 3) {
                        this.ownUrl = `${ar[1]}{imageurl}&${ar[2]}`;
                    }

                    const get = url.protocol === 'https:' ? httpsGet : httpGet;

                    get(
                        {
                            hostname: url.hostname,
                            port: url.port,
                            path: `${url.pathname}${url.search}`,
                            rejectUnauthorized: false,
                        },
                        result => {
                            result.on('data', chunk => (data += chunk));
                            result.on('end', () => {
                                this.parser.parseString(data, (err: Error | null, json: PhonebookXml) => {
                                    const contacts = json?.phonebooks?.phonebook?.contact;
                                    if (err || !contacts) {
                                        cb?.(err);
                                        return;
                                    }

                                    // A phone book with exactly one contact is not an array and was
                                    // never evaluated - kept like this on purpose.
                                    for (let i = 0; i < contacts.length; i++) {
                                        this.addContact(contacts[i], phonebookId);
                                    }

                                    this.adapter.setTimeout(doIt, 10);
                                });
                            });
                            result.on('error', (e: Error) => cb?.(e));
                        },
                    );
                });
            };

            doIt();
        });
    }

    private addContact(contact: PhonebookContact, phonebookId: string): void {
        const numbers = Array.isArray(contact.telephony.number) ? contact.telephony.number : [contact.telephony.number];

        for (let j = 0; j < numbers.length; j++) {
            if (!numbers[j] || typeof numbers[j] !== 'string') {
                continue;
            }

            const newEntry: PhonebookEntry = {
                name: contact.person.realname,
                normalizedName: normalizeName(contact.person.realname),
                number: this.complete(numbers[j]),
                id: contact.uniqueid,
                phonebookId,
            };

            if (contact.person.imageurl && this.ownUrl) {
                const ar = /^(.*)\/download.lua\?path=(http[^=&]+)&*.*$/.exec(contact.person.imageurl);
                if (ar?.[2]) {
                    newEntry.imageurl = ar[2];
                } else {
                    newEntry.imageurl = this.ownUrl.replace(/{imageurl}/, contact.person.imageurl);
                }
            }

            this.adapter.log.debug(`Phonebook ${phonebookId} New Entry: ${JSON.stringify(newEntry)}`);
            this.entries.push(newEntry);
        }
    }

    /** Completes a number with country and area code, so that all numbers can be compared */
    public complete(number: string): string {
        number = normalizeNumber(number);

        if (this.areaCode !== '') {
            if (this.countryAndAreaCode !== '' && number.indexOf(this.countryAndAreaCode) !== 0) {
                if (number[0] === '0') {
                    if (number.substring(0, 2) === '00') {
                        return number;
                    }
                    return this.countryCode + number.substring(1);
                }
                return this.countryAndAreaCode + number;
            }
        }

        return number;
    }

    public findNumber(number: string): string {
        const v = this.byNumber(number);
        return v ? v.name : '';
    }

    public byNumber(number: string): PhonebookEntry | undefined {
        const completed = this.complete(number);
        const entry = this.entries.find(v => v.number === completed);
        this.adapter.log.debug(`Search number ${completed} in phonebook: ${JSON.stringify(entry)}`);

        return entry;
    }

    /** Searches by name. First the complete name is compared, then a part of it */
    public byName(name: string): PhonebookEntry | undefined {
        const normalized = normalizeName(name);
        let entry = this.entries.find(v => v.normalizedName === normalized);
        let fallbackUsed = false;

        if (!entry) {
            entry = this.entries.find(v => v.normalizedName.includes(normalized));
            fallbackUsed = true;
        }

        this.adapter.log.debug(
            `Search name ${normalized} in phonebook (Fallback=${fallbackUsed}): ${JSON.stringify(entry)}`,
        );

        return entry;
    }
}
