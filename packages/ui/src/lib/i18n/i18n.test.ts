import {describe, expect, it} from 'vitest';

import {browserLanguage, createI18n, LANGUAGE_LABELS, resolveLanguage, UI_LANGUAGES} from './i18n.svelte.js';
import {CATALOGUE, UI_MESSAGES} from './uiMessages.js';

describe('I18n', () => {
    it('translates the 2.x tab labels through core’s catalogue', () => {
        const i18n = createI18n('de');
        expect(i18n.t('Devices')).toBe('Geräte');
        expect(i18n.t('Links')).toBe('Verknüpfungen');
        expect(i18n.t('RSSI')).toBe('Funk');
        expect(i18n.t('RPC Console')).toBe('RPC Konsole');
        expect(i18n.t('Service messages')).toBe('Servicemeldungen');
        expect(i18n.t('Events')).toBe('Ereignisse');
    });

    it('translates the shell’s own keys', () => {
        const i18n = createI18n('de');
        expect(i18n.t('RPC log')).toBe('RPC-Protokoll');
        expect(i18n.t('Theme')).toBe('Design');
    });

    it('captions the main actions of the Devices and the Links tab (tasks 28 and 33)', () => {
        expect(createI18n('de').t('Pair device')).toBe('Gerät anlernen');
        expect(createI18n('en').t('Pair device')).toBe('Pair device');
        expect(createI18n('de').t('Add link')).toBe('Verknüpfung anlegen');
        expect(createI18n('en').t('Add link')).toBe('Add link');
    });

    it('words the pinned callback fields and the callback line of the interface popup (task 38)', () => {
        const option = {option: 'HMM_CALLBACK_XMLRPC_PORT / --callback-xmlrpc-port'};
        expect(createI18n('de').t('Set at start ({option})', option)).toBe(
            'Beim Start festgelegt (HMM_CALLBACK_XMLRPC_PORT / --callback-xmlrpc-port)',
        );
        expect(createI18n('en').t('Set at start ({option})', option)).toBe(
            'Set at start (HMM_CALLBACK_XMLRPC_PORT / --callback-xmlrpc-port)',
        );
        expect(createI18n('de').t('Callback port {port} is in use', {port: '2126'})).toBe(
            'Callback-Port 2126 ist belegt',
        );
        expect(createI18n('en').t('Callback port {port} is in use', {port: '2126'})).toBe(
            'Callback port 2126 is in use',
        );
        expect(createI18n('de').t('Callback port {port} cannot be opened', {port: '80'})).toBe(
            'Callback-Port 80 lässt sich nicht öffnen',
        );
        expect(createI18n('en').t('Callback port {port} cannot be opened', {port: '80'})).toBe(
            'Callback port 80 cannot be opened',
        );
        expect(createI18n('de').t('Publish this port unchanged')).toBe('Diesen Port unverändert veröffentlichen');
        expect(createI18n('en').t('Publish this port unchanged')).toBe('Publish this port unchanged');
    });

    it('words the one-time question of the automatic acknowledgement the way the maintainer chose (#147)', () => {
        const key =
            '{count} STICKY_UNREACH messages are already listed. New ones are acknowledged automatically from now on.';
        expect(createI18n('de').t(key, {}, 1)).toBe(
            'In der Liste steht schon 1 STICKY_UNREACH-Meldung. Neue werden ab jetzt automatisch bestätigt.',
        );
        expect(createI18n('de').t(key, {}, 3)).toBe(
            'In der Liste stehen schon 3 STICKY_UNREACH-Meldungen. Neue werden ab jetzt automatisch bestätigt.',
        );
        expect(createI18n('en').t(key, {}, 1)).toBe(
            '1 STICKY_UNREACH message is already listed. New ones are acknowledged automatically from now on.',
        );
        expect(createI18n('en').t(key, {}, 3)).toBe(
            '3 STICKY_UNREACH messages are already listed. New ones are acknowledged automatically from now on.',
        );
        expect(createI18n('de').t('Acknowledge existing')).toBe('Vorhandene bestätigen');
        expect(createI18n('en').t('Acknowledge existing')).toBe('Acknowledge existing');
        expect(createI18n('de').t('Only new ones')).toBe('Nur neue');
        expect(createI18n('en').t('Only new ones')).toBe('Only new ones');
    });

    it('re-translates when the language changes', () => {
        const i18n = createI18n('de');
        expect(i18n.t('Devices')).toBe('Geräte');
        i18n.language = 'en';
        expect(i18n.language).toBe('en');
        expect(i18n.t('Devices')).toBe('Devices');
    });

    it('interpolates and pluralises', () => {
        const i18n = createI18n('en');
        expect(i18n.t('{count} devices', {}, 1)).toBe('1 device');
        expect(i18n.t('{count} devices', {}, 7)).toBe('7 devices');
        expect(i18n.t('Connected to {host}', {host: 'ccu3'})).toBe('Connected to ccu3');
    });

    it('falls back to the key for a text nobody translated', () => {
        const i18n = createI18n('de');
        expect(i18n.has('Devices')).toBe(true);
        expect(i18n.has('this key does not exist')).toBe(false);
        expect(i18n.t('this key does not exist')).toBe('this key does not exist');
    });

    it('offers exactly the two languages the UI has', () => {
        expect(UI_LANGUAGES).toEqual(['de', 'en']);
        expect(LANGUAGE_LABELS.de).toBe('Deutsch');
        expect(LANGUAGE_LABELS.en).toBe('English');
    });

    it('starts in English rather than in German when nobody says otherwise (D-36)', () => {
        expect(createI18n().language).toBe('en');
    });
});

/**
 * D-36, task 22: the UI starts in the browser's language with English as the fallback, and a
 * choice the user stored wins over the browser. The 2.x default was German first, whatever the
 * browser asked for.
 */
describe('the language the UI starts in', () => {
    describe('what the browser asks for', () => {
        it('takes the first supported entry, region subtag dropped', () => {
            expect(browserLanguage(['de-DE', 'en-US'])).toBe('de');
            expect(browserLanguage(['en-GB'])).toBe('en');
            expect(browserLanguage(['de-AT', 'de', 'en'])).toBe('de');
        });

        it('respects the order rather than a preference of ours', () => {
            // English first even though German is on the list: the user put it first.
            expect(browserLanguage(['en-US', 'de-DE'])).toBe('en');
            // French first is skipped - there is no French UI - and German is the next one it has.
            expect(browserLanguage(['fr-FR', 'de-DE'])).toBe('de');
        });

        it('falls back to English for a language the UI does not have', () => {
            expect(browserLanguage(['fr'])).toBe('en');
            expect(browserLanguage(['tr-TR'])).toBe('en');
            expect(browserLanguage([])).toBe('en');
        });
    });

    describe('what wins', () => {
        const browser = ['de-DE', 'de', 'en'];

        it('lets a stored choice win over the browser', () => {
            expect(resolveLanguage('en', browser)).toBe('en');
            expect(resolveLanguage('de', ['en-US'])).toBe('de');
        });

        it('follows the browser for `auto` and for a profile without a language', () => {
            expect(resolveLanguage('auto', browser)).toBe('de');
            expect(resolveLanguage(undefined, browser)).toBe('de');
            expect(resolveLanguage('auto', ['fr'])).toBe('en');
            expect(resolveLanguage(undefined, ['en-GB'])).toBe('en');
        });

        /** `tr` is in `Language` for the easy-mode fallback (D-15); there is no Turkish UI. */
        it('follows the browser for a stored language the UI cannot show', () => {
            expect(resolveLanguage('tr', browser)).toBe('de');
            expect(resolveLanguage('tr', ['fr'])).toBe('en');
        });
    });
});

describe('CATALOGUE', () => {
    it('has a German and an English text for every UI key', () => {
        for (const [key, entry] of Object.entries(UI_MESSAGES)) {
            expect(entry.de, `${key} has no German text`).toBeDefined();
            expect(entry.en, `${key} has no English text`).toBeDefined();
        }
    });

    it('merges core’s catalogue with the UI’s', () => {
        expect(CATALOGUE['Devices']).toBeDefined();
        expect(CATALOGUE['RPC log']).toBeDefined();
    });
});
