import {describe, expect, it} from 'vitest';
import {MockTransport} from '../transport/MockTransport.js';
import {NoticesStore} from './NoticesStore.svelte.js';
import {ParamsetStore} from './ParamsetStore.svelte.js';

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
