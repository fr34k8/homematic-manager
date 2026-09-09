import type {ServiceMessage} from '@homematic-manager/core';
import {fireEvent, screen, waitFor, within} from '@testing-library/svelte';
import {beforeEach, describe, expect, it} from 'vitest';

import {DEMO_SERVICE_MESSAGES} from '../lib/transport/demoData.js';
import {MockTransport} from '../lib/transport/MockTransport.js';
import {mountApp} from '../testHarness.js';

const sabotage: ServiceMessage = {
    interfaceName: 'BidCos-RF',
    address: 'GEQ0567890:0',
    datapoint: 'SABOTAGE',
    value: true,
    since: Date.parse('2026-09-05T07:00:00Z'),
};

describe('the service messages tab', () => {
    let transport: MockTransport;

    beforeEach(() => {
        transport = new MockTransport({demo: true});
    });

    it('lists the messages of the selected interface with device, value and age', async () => {
        await mountApp({transport, hash: '#/BidCos-RF/messages'});

        const row = document.querySelector<HTMLElement>('[data-row-id="LEQ0456789:0/LOWBAT"]');
        expect(row?.textContent).toContain('LOWBAT');
        expect(row?.textContent).toContain('LEQ0456789');
        expect(row?.textContent).toContain('true');
    });

    /**
     * Issue #146: the button asked `serviceMessages.list`, which the backend answers from its
     * cache - the interfaces themselves are read by an event or by the five-minute poll, so
     * nothing about the list could change and the button looked dead. It now asks for the round
     * trip, and it turns while it waits.
     */
    it('reads the interfaces again when refresh is pressed, and says that it is working', async () => {
        let answer: (value: ServiceMessage[]) => void = () => undefined;
        transport.respond(
            'serviceMessages.refresh',
            () => new Promise<ServiceMessage[]>((resolve) => (answer = resolve)),
        );
        await mountApp({transport, hash: '#/BidCos-RF/messages'});
        const button = screen.getByTestId<HTMLButtonElement>('messages-refresh');
        expect(button.disabled).toBe(false);

        await fireEvent.click(button);
        expect(transport.lastCall('serviceMessages.refresh')).toEqual(['BidCos-RF']);
        await waitFor(() => {
            expect(screen.getByTestId('messages-refresh').getAttribute('aria-busy')).toBe('true');
        });
        expect(screen.getByTestId<HTMLButtonElement>('messages-refresh').disabled).toBe(true);

        answer([sabotage]);
        await waitFor(() => {
            expect(screen.getByTestId('messages-refresh').getAttribute('aria-busy')).toBeNull();
        });
        expect(document.querySelector('[data-row-id="GEQ0567890:0/SABOTAGE"]')).not.toBeNull();
    });

    it('acknowledges only what the CCU lets an application acknowledge', async () => {
        await mountApp({transport, hash: '#/BidCos-RF/messages'});

        // LOWBAT goes away when the battery is changed; STICKY_UNREACH can be written.
        await fireEvent.click(document.querySelector('[data-row-id="LEQ0456789:0/LOWBAT"]')!);
        expect(screen.getByTestId<HTMLButtonElement>('messages-ack').disabled).toBe(true);
        expect(screen.getByTestId('messages-ack').getAttribute('title')).toContain('STICKY_UNREACH');

        await fireEvent.click(document.querySelector('[data-row-id="KEQ0345678:0/STICKY_UNREACH"]')!);
        expect(screen.getByTestId<HTMLButtonElement>('messages-ack').disabled).toBe(false);
        await fireEvent.click(screen.getByTestId('messages-ack'));

        await waitFor(() => {
            expect(transport.lastCall('serviceMessages.ack')).toEqual(['BidCos-RF', 'KEQ0345678:0', 'STICKY_UNREACH']);
        });
    });

    it('acknowledges everything acknowledgeable of the interface at once', async () => {
        transport.result('serviceMessages.list', [...DEMO_SERVICE_MESSAGES, sabotage]);
        await mountApp({transport, hash: '#/BidCos-RF/messages'});

        await fireEvent.click(screen.getByTestId('messages-ack-all'));
        await waitFor(() => {
            expect(transport.countOf('serviceMessages.ack')).toBe(2);
        });
        const acked = transport.calls
            .filter((call) => call.method === 'serviceMessages.ack')
            .map((call) => call.params[2]);
        expect(acked.sort()).toEqual(['SABOTAGE', 'STICKY_UNREACH']);
    });

    it('explains a BidCos CONFIG_PENDING in the list, where the user is looking at it', async () => {
        transport.result('serviceMessages.list', [
            {interfaceName: 'BidCos-RF', address: 'MEQ0123456:0', datapoint: 'CONFIG_PENDING', value: true, since: 0},
        ]);
        await mountApp({transport, hash: '#/BidCos-RF/messages'});

        const row = document.querySelector<HTMLElement>('[data-row-id="MEQ0123456:0/CONFIG_PENDING"]');
        expect(row?.textContent).toContain('Aufwachen');
    });

    it('announces a message that arrives later as a toast, never as a modal (#77)', async () => {
        const {stores} = await mountApp({transport, hash: '#/BidCos-RF/messages'});
        expect(stores.notices.items).toHaveLength(0);

        transport.emit('serviceMessages.changed', [...DEMO_SERVICE_MESSAGES, sabotage]);

        await waitFor(() => {
            expect(stores.notices.items.at(-1)?.message).toContain('SABOTAGE');
        });
        // The paramset dialog, if one were open, is untouched: a toast has no modal backdrop.
        expect(document.querySelector('dialog[open]')).toBeNull();
    });

    /**
     * Task 26 (openccu-lite 28.9): eQ-3's suppression, HmIP only. The row offers it once the
     * channel's suppressed list is known, the click is the three-argument call, and the list and
     * the messages are read again afterwards. BidCos has no such method and no such button.
     */
    it('suppresses a message from its row on an HmIP interface, and reads the state back', async () => {
        const lowbat: ServiceMessage = {
            interfaceName: 'HmIP-RF',
            address: '000A1B2C3D4E5F:0',
            datapoint: 'LOWBAT',
            value: true,
            since: 0,
        };
        transport.result('serviceMessages.list', [lowbat]);
        const suppressedNow: string[] = [];
        transport.respond('rpc.call', (_interfaceName, method, params) => {
            if (method === 'suppressServiceMessages') {
                const parameter = params[1];
                suppressedNow.push(typeof parameter === 'string' ? parameter : '');
                return true;
            }
            return method === 'getSuppressedServiceMessages' ? [...suppressedNow] : '';
        });
        const {stores} = await mountApp({transport, hash: '#/HmIP-RF/messages'});

        const button = await waitFor(() => screen.getByTestId<HTMLButtonElement>('suppress-000A1B2C3D4E5F:0-LOWBAT'));
        expect(transport.calls.filter((call) => call.method === 'rpc.call').map((call) => call.params)).toEqual([
            ['HmIP-RF', 'getSuppressedServiceMessages', ['000A1B2C3D4E5F:0']],
        ]);
        expect(stores.serviceMessages.isSuppressed(lowbat)).toBe(false);

        await fireEvent.click(button);
        await waitFor(() => {
            expect(stores.serviceMessages.isSuppressed(lowbat)).toBe(true);
        });
        expect(transport.calls.filter((call) => call.method === 'rpc.call').map((call) => call.params)).toEqual([
            ['HmIP-RF', 'getSuppressedServiceMessages', ['000A1B2C3D4E5F:0']],
            ['HmIP-RF', 'suppressServiceMessages', ['000A1B2C3D4E5F:0', 'LOWBAT', true]],
            ['HmIP-RF', 'getSuppressedServiceMessages', ['000A1B2C3D4E5F:0']],
        ]);
        // the list is read again: a suppressed UNREACH or LOWBAT reports false and leaves it
        expect(transport.countOf('serviceMessages.list')).toBeGreaterThan(1);
        // the same button now lifts the suppression
        await fireEvent.click(screen.getByTestId('suppress-000A1B2C3D4E5F:0-LOWBAT'));
        await waitFor(() => {
            expect(transport.lastCall('rpc.call')).toEqual([
                'HmIP-RF',
                'getSuppressedServiceMessages',
                ['000A1B2C3D4E5F:0'],
            ]);
        });
        expect(
            transport.calls.filter(
                (call) => call.method === 'rpc.call' && call.params[1] === 'suppressServiceMessages',
            ),
        ).toHaveLength(2);
    });

    it('offers no suppression on BidCos, where the interface has no such method', async () => {
        await mountApp({transport, hash: '#/BidCos-RF/messages'});
        expect(screen.getByTestId('message-LEQ0456789:0-LOWBAT')).toBeTruthy();
        expect(screen.queryByTestId('suppress-LEQ0456789:0-LOWBAT')).toBeNull();
        expect(transport.countOf('rpc.call')).toBe(0);
        // the quiet mode of #102 is gone with task 26: a service message has no such state
        expect(screen.queryByTestId('messages-quiet')).toBeNull();
    });

    it('survives an rfd that answers "" instead of an empty list', async () => {
        const {stores} = await mountApp({transport, hash: '#/BidCos-RF/messages'});
        transport.emit('serviceMessages.changed', '' as unknown as ServiceMessage[]);

        await waitFor(() => {
            expect(stores.serviceMessages.messages).toEqual([]);
        });
        expect(screen.getByTestId('messages-table')).toBeTruthy();
    });
});

describe('the events tab', () => {
    let transport: MockTransport;

    beforeEach(() => {
        transport = new MockTransport({demo: true});
    });

    it('shows the live events of the interface, newest first, with the method', async () => {
        await mountApp({transport, hash: '#/BidCos-RF/events'});
        const rows = [...document.querySelectorAll('[data-row-id]')];
        expect(rows.length).toBeGreaterThan(0);
        expect(rows[0]?.textContent).toContain('ACTUAL_TEMPERATURE');
        expect(rows[0]?.textContent).toContain('event');
    });

    it('counts the events per device, which is what #129 asked for', async () => {
        const {stores} = await mountApp({transport, hash: '#/BidCos-RF/events'});
        for (let index = 0; index < 3; index += 1) {
            transport.emit('rpc.event', {
                timestamp: Date.now(),
                interfaceName: 'BidCos-RF',
                method: 'event',
                address: 'JEQ0234567:1',
                datapoint: 'PRESS_SHORT',
                value: true,
            });
        }
        await waitFor(() => {
            expect(stores.events.countFor('JEQ0234567:1')).toBe(4);
        });
        const row = document.querySelector<HTMLElement>('[data-row-id]');
        expect(row?.textContent).toContain('4');
    });

    it('narrows by address and by datapoint, through the core filter', async () => {
        await mountApp({transport, hash: '#/BidCos-RF/events'});

        await fireEvent.input(screen.getByTestId('events-filter-address'), {target: {value: 'KEQ'}});
        await waitFor(() => {
            expect(document.querySelectorAll('[data-row-id]')).toHaveLength(1);
        });
        expect(document.querySelector('[data-row-id]')?.textContent).toContain('KEQ0345678:4');

        await fireEvent.input(screen.getByTestId('events-filter-address'), {target: {value: ''}});
        await fireEvent.input(screen.getByTestId('events-filter-datapoint'), {target: {value: 'press'}});
        await waitFor(() => {
            expect(document.querySelectorAll('[data-row-id]')).toHaveLength(1);
        });
        expect(document.querySelector('[data-row-id]')?.textContent).toContain('PRESS_SHORT');
    });

    it('freezes the list while it is paused and catches up when it is not', async () => {
        await mountApp({transport, hash: '#/BidCos-RF/events'});
        const before = document.querySelectorAll('[data-row-id]').length;

        await fireEvent.click(screen.getByTestId('events-pause'));
        expect(screen.getByTestId('events-paused')).toBeTruthy();

        transport.emit('rpc.event', {
            timestamp: Date.now(),
            interfaceName: 'BidCos-RF',
            method: 'event',
            address: 'GEQ0567890:1',
            datapoint: 'LEVEL',
            value: 0.5,
        });
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(document.querySelectorAll('[data-row-id]')).toHaveLength(before);

        await fireEvent.click(screen.getByTestId('events-pause'));
        await waitFor(() => {
            expect(document.querySelectorAll('[data-row-id]')).toHaveLength(before + 1);
        });
    });

    it('clears the buffer here and in the backend', async () => {
        const {stores} = await mountApp({transport, hash: '#/BidCos-RF/events'});
        await fireEvent.click(screen.getByTestId('events-clear'));

        await waitFor(() => {
            expect(stores.events.size).toBe(0);
        });
        expect(transport.countOf('events.clear')).toBe(1);
        expect(within(screen.getByTestId('events-table')).getByText('Keine Daten')).toBeTruthy();
    });
});
