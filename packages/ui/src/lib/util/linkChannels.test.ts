import type {DeviceDescription} from '@homematic-manager/core';
import {describe, expect, it} from 'vitest';

import {channelOption} from './linkChannels.js';

const channel: DeviceDescription = {
    ADDRESS: '000A1B2C3D4E5F:3',
    TYPE: 'VIRTUAL_SWITCH_TRANSMITTER',
    PARENT: '000A1B2C3D4E5F',
    INDEX: 3,
};

const names: Record<string, string> = {
    '000A1B2C3D4E5F:3': 'Living room light',
    '000A1B2C3D4E5F': 'Wall switch',
};

describe('channelOption (task 31)', () => {
    it('gives the channel name, the device name and index: TYPE, with the address as the value', () => {
        expect(channelOption(channel, (address) => names[address])).toEqual({
            value: '000A1B2C3D4E5F:3',
            label: 'Living room light',
            hint: 'Wall switch',
            description: '3: VIRTUAL_SWITCH_TRANSMITTER',
        });
    });

    it('falls back to the channel address and the device address when nothing is named', () => {
        expect(channelOption(channel, () => undefined)).toEqual({
            value: '000A1B2C3D4E5F:3',
            label: '000A1B2C3D4E5F:3',
            hint: '000A1B2C3D4E5F',
            description: '3: VIRTUAL_SWITCH_TRANSMITTER',
        });
        // only the device named, or only the channel
        expect(channelOption(channel, (address) => (address.includes(':') ? undefined : 'Wall switch'))).toMatchObject({
            label: '000A1B2C3D4E5F:3',
            hint: 'Wall switch',
        });
        expect(channelOption(channel, (address) => (address.includes(':') ? 'Light' : undefined))).toMatchObject({
            label: 'Light',
            hint: '000A1B2C3D4E5F',
        });
    });

    it('takes device and index from the address when the description leaves them out', () => {
        expect(channelOption({ADDRESS: 'A:1', TYPE: 'KEY'}, () => undefined)).toEqual({
            value: 'A:1',
            label: 'A:1',
            hint: 'A',
            description: '1: KEY',
        });
    });

    it('prints an index of 0 rather than dropping it', () => {
        expect(channelOption({...channel, INDEX: 0}, () => undefined).description).toBe(
            '0: VIRTUAL_SWITCH_TRANSMITTER',
        );
    });
});
