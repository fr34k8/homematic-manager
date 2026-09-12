import type {ServiceMessage} from '@homematic-manager/core';
import {describe, expect, it} from 'vitest';

import {serviceMessageTotal} from './serviceMessageTotal.js';

function message(interfaceName: string, address: string, datapoint = 'UNREACH'): ServiceMessage {
    return {interfaceName, address, datapoint, value: true, since: 0};
}

const ORDER = ['BidCos-RF', 'HmIP-RF', 'VirtualDevices'];

describe('the total of the service messages tab (task 36, #150)', () => {
    /** The reporter's box: four on BidCos-RF, three more under HmIP-RF. */
    const box = [
        message('BidCos-RF', 'A:0'),
        message('BidCos-RF', 'B:0'),
        message('BidCos-RF', 'C:0'),
        message('BidCos-RF', 'D:0', 'STICKY_UNREACH'),
        message('HmIP-RF', 'E:0'),
        message('HmIP-RF', 'F:0', 'LOW_BAT'),
        message('HmIP-RF', 'G:0', 'CONFIG_PENDING'),
    ];

    it('adds up every interface and says which others have messages', () => {
        expect(serviceMessageTotal(box, 'BidCos-RF', ORDER)).toEqual({
            own: 4,
            total: 7,
            others: [{interfaceName: 'HmIP-RF', count: 3}],
            next: 'HmIP-RF',
        });
    });

    it('has no others with one interface holding every message', () => {
        const total = serviceMessageTotal(box.slice(0, 4), 'BidCos-RF', ORDER);
        expect(total.others).toEqual([]);
        expect(total.next).toBeUndefined();
        expect(total.own).toBe(total.total);
    });

    it('has no others and nothing to count on a box without messages', () => {
        expect(serviceMessageTotal([], 'HmIP-RF', ORDER)).toEqual({own: 0, total: 0, others: [], next: undefined});
    });

    it('counts the box for an interface that has none of its own', () => {
        const total = serviceMessageTotal(box, 'VirtualDevices', ORDER);
        expect(total.own).toBe(0);
        expect(total.total).toBe(7);
        // wraps round: after VirtualDevices comes BidCos-RF again
        expect(total.next).toBe('BidCos-RF');
    });

    it('walks every interface with messages in header order, wrapping round', () => {
        const three = [...box, message('VirtualDevices', 'INT0000001:0')];
        expect(serviceMessageTotal(three, 'BidCos-RF', ORDER).next).toBe('HmIP-RF');
        expect(serviceMessageTotal(three, 'HmIP-RF', ORDER).next).toBe('VirtualDevices');
        expect(serviceMessageTotal(three, 'VirtualDevices', ORDER).next).toBe('BidCos-RF');
        expect(serviceMessageTotal(three, 'HmIP-RF', ORDER).others.map((entry) => entry.interfaceName)).toEqual([
            'BidCos-RF',
            'VirtualDevices',
        ]);
    });

    it('takes an interface the header does not list after the ones it does', () => {
        const total = serviceMessageTotal([...box, message('CUxD', 'CUX0000001:0')], 'HmIP-RF', ORDER);
        expect(total.others.map((entry) => entry.interfaceName)).toEqual(['BidCos-RF', 'CUxD']);
        expect(total.next).toBe('CUxD');
    });

    it('works without an interface order, and for a selection nobody knows', () => {
        expect(serviceMessageTotal(box, 'BidCos-RF').next).toBe('HmIP-RF');
        const unknown = serviceMessageTotal(box, '', ORDER);
        expect(unknown.own).toBe(0);
        expect(unknown.next).toBe('BidCos-RF');
    });
});
