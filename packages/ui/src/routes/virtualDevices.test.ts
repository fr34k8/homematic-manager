/**
 * Forum report against 3.0.0-beta.5 (BUGS.md B-1, #143): on the VirtualDevices interface the
 * popup counts 31 devices and the grid lists none. The groups themselves render - the first test
 * feeds 31 of them in the shape a CCU3 really sends (the hm2mqtt.js fixture: `CHILDREN` is `""`
 * on a channel, `UPDATABLE` a boolean, `VERSION` 131072 on an HmIP-HEATING group). What emptied
 * the grid was a column filter typed on another interface: it outlived the switch, the band still
 * counted every device, and the empty text blamed the interface. The other two tests pin the fix.
 */

import type {DeviceDescription} from '@homematic-manager/core';
import {fireEvent, screen, waitFor} from '@testing-library/svelte';
import {describe, expect, it} from 'vitest';

import {MockTransport} from '../lib/transport/MockTransport.js';
import {mountApp} from '../testHarness.js';

/** A heating group as the group process (port 9292, `/groups`) describes it. */
function group(n: number): DeviceDescription[] {
    const address = `INT${String(n).padStart(7, '0')}`;
    const hmip = n % 2 === 0;
    const type = hmip ? 'HmIP-HEATING' : 'HM-CC-VG-1';
    const channels = hmip ? [0, 1, 2, 3, 4, 5, 6] : [0, 1, 2];
    const common = {
        SUBTYPE: '',
        RF_ADDRESS: 0,
        AES_ACTIVE: 0,
        FIRMWARE: hmip ? '2.0.0' : '1.3',
        AVAILABLE_FIRMWARE: hmip ? '2.0.0' : '1.3',
        UPDATABLE: true,
        FIRMWARE_UPDATE_STATE: '',
        VERSION: hmip ? 131_072 : 3,
        LINK_SOURCE_ROLES: '',
        LINK_TARGET_ROLES: '',
        DIRECTION: 0,
        GROUP: '',
        TEAM: '',
        TEAM_TAG: '',
        TEAM_CHANNELS: [],
        INTERFACE: '',
        ROAMING: 0,
    };
    return [
        {
            ...common,
            TYPE: type,
            ADDRESS: address,
            CHILDREN: channels.map((index) => `${address}:${String(index)}`),
            PARENT: '',
            PARENT_TYPE: '',
            INDEX: 0,
            PARAMSETS: ['MASTER'],
            FLAGS: 1,
            RX_MODE: 1,
        } as unknown as DeviceDescription,
        ...channels.map(
            (index) =>
                ({
                    ...common,
                    TYPE: index === 0 ? 'MAINTENANCE' : 'CLIMATECONTROL_RT_TRANSCEIVER',
                    ADDRESS: `${address}:${String(index)}`,
                    // a string, not an array - what the group process really sends
                    CHILDREN: '',
                    PARENT: address,
                    PARENT_TYPE: type,
                    INDEX: index,
                    PARAMSETS: index === 0 ? ['VALUES'] : ['MASTER', 'VALUES'],
                    FLAGS: index === 0 ? 3 : 1,
                    RX_MODE: 0,
                }) as unknown as DeviceDescription,
        ),
    ];
}

/** The reporter's count. */
const GROUPS = Array.from({length: 31}, (_unused, index) => group(index + 1)).flat();

function bidcos(n: number): DeviceDescription[] {
    const address = `LEQ${String(n).padStart(7, '0')}`;
    return [
        {
            ADDRESS: address,
            TYPE: 'HM-LC-Sw1-Pl',
            VERSION: 1,
            FIRMWARE: '2.8',
            CHILDREN: [`${address}:0`],
            PARAMSETS: ['MASTER'],
        },
        {
            ADDRESS: `${address}:0`,
            TYPE: 'MAINTENANCE',
            VERSION: 1,
            PARENT: address,
            PARENT_TYPE: 'HM-LC-Sw1-Pl',
            PARAMSETS: ['MASTER', 'VALUES'],
            INDEX: 0,
        },
    ] as DeviceDescription[];
}

/** Enough BidCos devices that the grid scrolls, as the reporter's 112 do. */
const MANY = Array.from({length: 200}, (_unused, index) => bidcos(index + 1)).flat();

function transportWithGroups(): MockTransport {
    const transport = new MockTransport({demo: true});
    transport.respond('devices.list', (interfaceName) =>
        interfaceName === 'VirtualDevices' ? GROUPS : interfaceName === 'BidCos-RF' ? MANY : [],
    );
    return transport;
}

function drawnRows(): NodeListOf<HTMLElement> {
    return document.querySelectorAll<HTMLElement>('[data-testid="devices-table"] [data-row-kind="row"]');
}

function addressFilter(): HTMLInputElement {
    const input = document.querySelector<HTMLInputElement>(
        '[data-testid="devices-table"] input[aria-label="Filter: ADDRESS"]',
    );
    expect(input, 'the ADDRESS filter field').not.toBeNull();
    return input!;
}

describe('the VirtualDevices interface (B-1, #143)', () => {
    it('lists the 31 groups it counts, in the shape the group process sends them', async () => {
        const {stores} = await mountApp({transport: transportWithGroups(), hash: '#/VirtualDevices/devices'});
        await waitFor(() => {
            expect(stores.devices.devices('VirtualDevices')).toHaveLength(31);
        });
        await waitFor(() => {
            expect(screen.getByTestId('devices-table-count').textContent).toBe('31 Geräte');
        });
        expect(screen.getByRole('grid').getAttribute('aria-rowcount')).toBe('31');
        const first = document.querySelector<HTMLElement>('[data-row-id="INT0000001"]');
        expect(first?.textContent).toContain('HM-CC-VG-1');
        expect(document.querySelector('[data-row-id="INT0000002"]')?.textContent).toContain('HmIP-HEATING');
        expect(drawnRows().length).toBeGreaterThan(10);
    });

    it('forgets a column filter typed on another interface when the interface changes', async () => {
        const {stores} = await mountApp({transport: transportWithGroups(), hash: '#/BidCos-RF/devices'});
        await waitFor(() => {
            expect(stores.devices.devices('BidCos-RF')).toHaveLength(200);
        });
        // LEQ0000190 .. LEQ0000199: ten of the two hundred
        await fireEvent.input(addressFilter(), {target: {value: 'LEQ000019'}});
        await waitFor(() => {
            expect(screen.getByRole('grid').getAttribute('aria-rowcount')).toBe('10');
        });

        await stores.selectInterface('VirtualDevices');
        await waitFor(() => {
            expect(screen.getByRole('grid').getAttribute('aria-rowcount')).toBe('31');
        });
        expect(addressFilter().value).toBe('');
        expect(screen.getByTestId('devices-table-count').textContent).toBe('31 Geräte');
        expect(document.querySelector('[data-row-id="INT0000001"]')).not.toBeNull();
    });

    /**
     * The reporter saw it again on 3.0.0-beta.8 (2026-09-09), while another user saw every group
     * on the same version. The column filters of B-1 belong to the interface since beta.7 - the
     * room and the function filter above the grid did not, and they are applied to the rows
     * *before* the table sees them, so the table's own "0 von 31" could not report them either.
     * A grid narrowed to a room of BidCos-RF is empty on VirtualDevices, whose groups are in no
     * room at all, and it blamed the interface for it.
     */
    it('forgets the room filter when the interface changes (#143)', async () => {
        const {stores} = await mountApp({transport: transportWithGroups(), hash: '#/BidCos-RF/devices'});
        await waitFor(() => {
            expect(stores.devices.devices('BidCos-RF')).toHaveLength(200);
        });
        const room = screen.getByTestId<HTMLSelectElement>('devices-filter-room');
        await fireEvent.change(room, {target: {value: 'room/eg/kueche'}});
        await waitFor(() => {
            expect(drawnRows()).toHaveLength(0);
        });

        await stores.selectInterface('VirtualDevices');
        await waitFor(() => {
            expect(screen.getByRole('grid').getAttribute('aria-rowcount')).toBe('31');
        });
        expect(screen.getByTestId<HTMLSelectElement>('devices-filter-room').value).toBe('');
        expect(document.querySelector('[data-row-id="INT0000001"]')).not.toBeNull();
    });

    it('blames the room filter, not the interface, when the filter empties the grid (#143)', async () => {
        const {stores} = await mountApp({transport: transportWithGroups(), hash: '#/BidCos-RF/devices'});
        await waitFor(() => {
            expect(stores.devices.devices('BidCos-RF')).toHaveLength(200);
        });
        await fireEvent.change(screen.getByTestId('devices-filter-room'), {target: {value: 'room/eg/kueche'}});
        await waitFor(() => {
            expect(drawnRows()).toHaveLength(0);
        });
        expect(screen.getByText('Kein Gerät passt zum Raum- oder Gewerkefilter')).toBeTruthy();
        expect(screen.queryByText('Keine Geräte - die Schnittstelle hat noch keine gemeldet')).toBeNull();
    });

    it('says when a filter leaves nothing, counts honestly, and clears it on request', async () => {
        const {stores} = await mountApp({transport: transportWithGroups(), hash: '#/VirtualDevices/devices'});
        await waitFor(() => {
            expect(stores.devices.devices('VirtualDevices')).toHaveLength(31);
        });
        await fireEvent.input(addressFilter(), {target: {value: 'LEQ'}});
        await waitFor(() => {
            expect(screen.getByTestId('devices-table-count').textContent).toBe('Zeige 0 von 31');
        });
        expect(drawnRows()).toHaveLength(0);
        expect(screen.getByText('Keine Zeile passt zum Filter')).toBeTruthy();
        expect(screen.queryByText('Keine Geräte - die Schnittstelle hat noch keine gemeldet')).toBeNull();

        await fireEvent.click(screen.getByTestId('devices-table-clear-filter'));
        await waitFor(() => {
            expect(screen.getByTestId('devices-table-count').textContent).toBe('31 Geräte');
        });
        expect(addressFilter().value).toBe('');
        expect(document.querySelector('[data-row-id="INT0000001"]')).not.toBeNull();
    });
});
