import {describe, expect, it} from 'vitest';
import {MockTransport} from '../transport/MockTransport.js';
import {NoticesStore} from './NoticesStore.svelte.js';
import {ParamsetStore} from './ParamsetStore.svelte.js';
import {ServiceMessagesStore} from './ServiceMessagesStore.svelte.js';
import {isHmipInterface, suppressCallText} from './suppression.js';

/**
 * Task 26: eQ-3's service-message suppression (HmIP only). The list comes back as strings, an
 * interface without the method answers undefined rather than a notice, and a toggle is the
 * three-argument call the addendum documents.
 */
describe('ParamsetStore service-message suppression', () => {
    it('reads the suppressed list and toggles one parameter or all', async () => {
        const transport = new MockTransport();
        const calls: unknown[][] = [];
        transport.respond('rpc.call', (interfaceName, method, params) => {
            calls.push([interfaceName, method, params]);
            return method === 'getSuppressedServiceMessages' ? ['UNREACH', 7] : true;
        });
        const store = new ParamsetStore(transport, new NoticesStore(transport));
        await expect(store.suppressedServiceMessages('HmIP-RF', '000A1B2C3D4E5F:0')).resolves.toEqual(['UNREACH']);
        await expect(store.suppressServiceMessages('HmIP-RF', '000A1B2C3D4E5F:0', 'LOWBAT', true)).resolves.toBe(true);
        await expect(store.suppressServiceMessages('HmIP-RF', '000A1B2C3D4E5F:0', '', false)).resolves.toBe(true);
        expect(calls).toEqual([
            ['HmIP-RF', 'getSuppressedServiceMessages', ['000A1B2C3D4E5F:0']],
            ['HmIP-RF', 'suppressServiceMessages', ['000A1B2C3D4E5F:0', 'LOWBAT', true]],
            ['HmIP-RF', 'suppressServiceMessages', ['000A1B2C3D4E5F:0', '', false]],
        ]);
    });

    it('answers undefined, and no notice, where the interface has no such method', async () => {
        const transport = new MockTransport();
        transport.respond('rpc.call', () => {
            throw new Error('Unknown method');
        });
        const notices = new NoticesStore(transport);
        const store = new ParamsetStore(transport, notices);
        await expect(store.suppressedServiceMessages('BidCos-RF', 'MEQ0123456:0')).resolves.toBeUndefined();
        expect(notices.items.length).toBe(0);
        // a failed toggle is reported, that one the user asked for
        await expect(store.suppressServiceMessages('BidCos-RF', 'MEQ0123456:0', 'UNREACH', true)).resolves.toBe(false);
        expect(notices.items.length).toBe(1);
    });
});

describe('the suppression helpers', () => {
    it('prints the call the preview and the change list show', () => {
        expect(suppressCallText('000A1B2C3D4E5F:0', 'UNREACH', true)).toBe(
            'suppressServiceMessages(000A1B2C3D4E5F:0, "UNREACH", true)',
        );
        expect(suppressCallText('A:0', '', false)).toBe('suppressServiceMessages(A:0, "", false)');
    });

    it('recognises the HmIP interface by name or by type, and nothing else', () => {
        expect(isHmipInterface('HmIP-RF')).toBe(true);
        expect(isHmipInterface('Funk', 'HmIP-RF')).toBe(true);
        expect(isHmipInterface('BidCos-RF', 'BidCos-RF')).toBe(false);
        expect(isHmipInterface('CUxD')).toBe(false);
    });
});

/**
 * Task 26: the service-messages tab reads the suppressed list per channel of the list once, and
 * a row's suppress reads it again plus the messages - a suppressed message reports a value that
 * raises none, so it is expected to leave the list.
 */
describe('ServiceMessagesStore suppression', () => {
    const lowbat = {interfaceName: 'HmIP-RF', address: '000A1B2C3D4E5F:0', datapoint: 'LOWBAT', value: true, since: 0};
    const unreach = {
        interfaceName: 'HmIP-RF',
        address: '0001D8A9B7C6D5:0',
        datapoint: 'UNREACH',
        value: true,
        since: 0,
    };

    it('reads the list of every channel once, and again after a change', async () => {
        const transport = new MockTransport({demo: true});
        transport.result('serviceMessages.list', [lowbat, unreach, lowbat]);
        const calls: unknown[][] = [];
        transport.respond('rpc.call', (_interfaceName, method, params) => {
            calls.push([method, ...params]);
            return method === 'getSuppressedServiceMessages'
                ? params[0] === unreach.address
                    ? ['UNREACH']
                    : []
                : true;
        });
        const store = new ServiceMessagesStore(transport, new NoticesStore(transport));
        await store.load();

        await store.loadSuppressed('HmIP-RF');
        expect(calls).toEqual([
            ['getSuppressedServiceMessages', lowbat.address],
            ['getSuppressedServiceMessages', unreach.address],
        ]);
        expect(store.isSuppressed(lowbat)).toBe(false);
        expect(store.isSuppressed(unreach)).toBe(true);
        expect(store.suppressedOf('HmIP-RF', lowbat.address)).toEqual([]);
        expect(store.suppressedOf('BidCos-RF', 'MEQ0123456:0')).toBeUndefined();

        // asked once: a second sweep is free
        await store.loadSuppressed('HmIP-RF');
        expect(calls).toHaveLength(2);

        const before = transport.countOf('serviceMessages.list');
        await expect(store.suppress('HmIP-RF', lowbat.address, 'LOWBAT', true)).resolves.toBe(true);
        expect(calls.slice(2)).toEqual([
            ['suppressServiceMessages', lowbat.address, 'LOWBAT', true],
            ['getSuppressedServiceMessages', lowbat.address],
        ]);
        expect(transport.countOf('serviceMessages.list')).toBe(before + 1);
    });

    it('asks an interface without the method once and keeps no entry for it', async () => {
        const transport = new MockTransport({demo: true});
        transport.respond('rpc.call', () => {
            throw new Error('Unknown method');
        });
        const notices = new NoticesStore(transport);
        const store = new ServiceMessagesStore(transport, notices);
        await store.load();
        await store.loadSuppressed('BidCos-RF');
        await store.loadSuppressed('BidCos-RF');
        expect(transport.countOf('rpc.call')).toBe(2);
        expect(store.suppressed).toEqual({});
        expect(notices.items).toHaveLength(0);
        // a failed suppress is reported: the user asked for it
        await expect(store.suppress('BidCos-RF', 'LEQ0456789:0', 'LOWBAT', true)).resolves.toBe(false);
        expect(notices.items).toHaveLength(1);
    });
});
