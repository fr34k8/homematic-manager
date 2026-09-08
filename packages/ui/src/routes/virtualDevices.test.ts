/**
 * Forum report against 3.0.0-beta.5 (BUGS.md B-1): on the VirtualDevices interface the header
 * counts the devices but the grid lists none. This is the guard that a heating group, as the
 * group process (port 9292, `/groups`) describes it, is listed at all - it is, so the report
 * needs the reporter's own `listDevices` answer before it can be reproduced.
 */

import type {DeviceDescription} from '@homematic-manager/core';
import {screen, waitFor} from '@testing-library/svelte';
import {describe, expect, it} from 'vitest';

import {MockTransport} from '../lib/transport/MockTransport.js';
import {mountApp} from '../testHarness.js';

const GROUPS: DeviceDescription[] = [
    {
        ADDRESS: 'INT0000001',
        CHILDREN: ['INT0000001:0', 'INT0000001:1', 'INT0000001:2'],
        FIRMWARE: '1.3',
        FLAGS: 1,
        INTERFACE: 'VirtualDevices',
        PARAMSETS: ['MASTER'],
        PARENT: '',
        RF_ADDRESS: 0,
        ROAMING: 0,
        RX_MODE: 0,
        TYPE: 'HM-CC-VG-1',
        UPDATABLE: 0,
        VERSION: 3,
    } as DeviceDescription,
    {
        ADDRESS: 'INT0000001:0',
        AES_ACTIVE: 0,
        DIRECTION: 0,
        FLAGS: 3,
        INDEX: 0,
        LINK_SOURCE_ROLES: '',
        LINK_TARGET_ROLES: '',
        PARAMSETS: ['MASTER', 'VALUES'],
        PARENT: 'INT0000001',
        PARENT_TYPE: 'HM-CC-VG-1',
        TYPE: 'MAINTENANCE',
        VERSION: 3,
    } as DeviceDescription,
    {
        ADDRESS: 'INT0000001:1',
        AES_ACTIVE: 0,
        DIRECTION: 1,
        FLAGS: 1,
        INDEX: 1,
        LINK_SOURCE_ROLES: '',
        LINK_TARGET_ROLES: '',
        PARAMSETS: ['MASTER', 'VALUES'],
        PARENT: 'INT0000001',
        PARENT_TYPE: 'HM-CC-VG-1',
        TYPE: 'CLIMATECONTROL_RT_TRANSCEIVER',
        VERSION: 3,
    } as DeviceDescription,
    {
        ADDRESS: 'INT0000001:2',
        AES_ACTIVE: 0,
        DIRECTION: 1,
        FLAGS: 1,
        INDEX: 2,
        LINK_SOURCE_ROLES: '',
        LINK_TARGET_ROLES: '',
        PARAMSETS: ['MASTER', 'VALUES'],
        PARENT: 'INT0000001',
        PARENT_TYPE: 'HM-CC-VG-1',
        TYPE: 'SHUTTER_CONTACT',
        VERSION: 3,
    } as DeviceDescription,
];

describe('the VirtualDevices interface', () => {
    it('lists the heating groups it counts', async () => {
        const transport = new MockTransport({demo: true});
        transport.respond('devices.list', (interfaceName) => (interfaceName === 'VirtualDevices' ? GROUPS : []));
        const {stores} = await mountApp({transport, hash: '#/VirtualDevices/devices'});
        await waitFor(() => {
            expect(stores.devices.devices('VirtualDevices')).toHaveLength(1);
        });
        await waitFor(() => {
            expect(screen.getByText('1 Gerät')).toBeTruthy();
        });
        const row = document.querySelector<HTMLElement>('[data-row-id="INT0000001"]');
        expect(row, 'the group row').not.toBeNull();
        expect(row?.textContent).toContain('HM-CC-VG-1');
    });
});
