import {describe, expect, it} from 'vitest';

import {
    bidcosInterfaceLabel,
    DEFAULT_RECEIVER_MARGIN_DB,
    normaliseRssiInfo,
    normaliseRssiValue,
    proposeReceivers,
    receiverLabel,
    RSSI_UNKNOWN,
    rssiClass,
    rssiColor,
    RssiStore,
} from './index.js';

describe('normaliseRssiValue', () => {
    it('keeps a real measurement', () => {
        expect(normaliseRssiValue(-60)).toBe(-60);
        expect(normaliseRssiValue(0)).toBe(0);
    });

    it('drops the "unknown" placeholder and anything that is not a finite number', () => {
        expect(normaliseRssiValue(RSSI_UNKNOWN)).toBeUndefined();
        expect(normaliseRssiValue(undefined)).toBeUndefined();
        expect(normaliseRssiValue('')).toBeUndefined();
        expect(normaliseRssiValue(Number.NaN)).toBeUndefined();
    });
});

describe('normaliseRssiInfo', () => {
    it('turns the rssiInfo answer into a matrix', () => {
        expect(
            normaliseRssiInfo({
                'BidCoS-RF': {MEQ0123456: [-58, -61]},
                MEQ0123456: {'BidCoS-RF': [-61, -58]},
            }),
        ).toEqual({
            'BidCoS-RF': {MEQ0123456: {rx: -58, tx: -61}},
            MEQ0123456: {'BidCoS-RF': {rx: -61, tx: -58}},
        });
    });

    it('drops the halves the interface does not know', () => {
        expect(normaliseRssiInfo({A: {B: [RSSI_UNKNOWN, -70]}})).toEqual({A: {B: {tx: -70}}});
        expect(normaliseRssiInfo({A: {B: [-70, RSSI_UNKNOWN]}})).toEqual({A: {B: {rx: -70}}});
        expect(normaliseRssiInfo({A: {B: []}})).toEqual({A: {B: {}}});
    });

    it('copes with an empty answer', () => {
        expect(normaliseRssiInfo({})).toEqual({});
        expect(normaliseRssiInfo({A: {}})).toEqual({A: {}});
    });
});

describe('rssiClass', () => {
    it('grades a signal', () => {
        expect(rssiClass(-10)).toBe('good');
        expect(rssiClass(-20)).toBe('good');
        expect(rssiClass(-60)).toBe('medium');
        expect(rssiClass(-100)).toBe('medium');
        expect(rssiClass(-101)).toBe('bad');
        expect(rssiClass(-130)).toBe('bad');
    });

    it('calls a missing value unknown', () => {
        expect(rssiClass(undefined)).toBe('unknown');
        expect(rssiClass(RSSI_UNKNOWN)).toBe('unknown');
    });
});

describe('rssiColor', () => {
    it('reproduces the 2.x gradient', () => {
        expect(rssiColor(-20)).toBe('#00ff00');
        expect(rssiColor(-100)).toBe('#ffff00');
        expect(rssiColor(-120)).toBe('#ff0000');
    });

    it('clamps both channels instead of producing nonsense', () => {
        expect(rssiColor(0)).toBe('#00ff00');
        expect(rssiColor(-200)).toBe('#ff0000');
    });

    it('has no colour for a value there is none for', () => {
        expect(rssiColor(undefined)).toBeUndefined();
        expect(rssiColor(RSSI_UNKNOWN)).toBeUndefined();
    });
});

describe('RssiStore with BidCos', () => {
    it('takes an rssiInfo answer and answers questions about it', () => {
        const store = new RssiStore();
        store.applyRssiInfo({'BidCoS-RF': {MEQ0123456: [-58, -61]}, MEQ0123456: {'BidCoS-RF': [-61, -58]}});
        expect(store.get('BidCoS-RF', 'MEQ0123456')).toEqual({rx: -58, tx: -61});
        expect(store.get('MEQ0123456', 'nope')).toBeUndefined();
        expect(store.get('nope', 'MEQ0123456')).toBeUndefined();
        expect(store.peersOf('MEQ0123456')).toEqual(['BidCoS-RF']);
        expect(store.peersOf('nope')).toEqual([]);
    });

    it('replaces the whole matrix on the next answer', () => {
        const store = new RssiStore();
        store.applyRssiInfo({A: {B: [-1, -2]}});
        store.applyRssiInfo({C: {D: [-3, -4]}});
        expect(Object.keys(store.toJSON())).toEqual(['C']);
    });

    it('hands out a copy', () => {
        const store = new RssiStore();
        store.applyRssiInfo({A: {B: [-1, -2]}});
        const copy = store.toJSON();
        delete copy['A'];
        expect(store.get('A', 'B')).toBeDefined();
    });
});

describe('RssiStore with HmIP', () => {
    const central = '3014F711A000000000000001';
    const device = '0001D3C99C1234';

    function store(): RssiStore {
        return new RssiStore({centralAddress: central});
    }

    it('files RSSI_DEVICE as what the access point receives from the device', () => {
        const rssi = store();
        expect(rssi.applyHmipValue(device, 'RSSI_DEVICE', -58)).toBe(true);
        expect(rssi.get(central, device)).toEqual({rx: -58});
        expect(rssi.get(device, central)).toEqual({tx: -58});
    });

    it('files RSSI_PEER the other way round', () => {
        const rssi = store();
        rssi.applyHmipValue(device, 'RSSI_PEER', -61);
        expect(rssi.get(device, central)).toEqual({rx: -61});
        expect(rssi.get(central, device)).toEqual({tx: -61});
    });

    it('completes both pairs when both values arrive', () => {
        const rssi = store();
        rssi.applyHmipValue(device, 'RSSI_DEVICE', -58);
        rssi.applyHmipValue(device, 'RSSI_PEER', -61);
        expect(rssi.get(central, device)).toEqual({rx: -58, tx: -61});
        expect(rssi.get(device, central)).toEqual({rx: -61, tx: -58});
    });

    it('ignores anything that is not an RSSI datapoint or not a usable value', () => {
        const rssi = store();
        expect(rssi.applyHmipValue(device, 'UNREACH', true)).toBe(false);
        expect(rssi.applyHmipValue(device, 'RSSI_DEVICE', RSSI_UNKNOWN)).toBe(false);
        expect(rssi.toJSON()).toEqual({});
    });

    it('drops values while the access point address is still unknown, and takes them afterwards', () => {
        const rssi = new RssiStore();
        expect(rssi.centralAddress).toBeUndefined();
        expect(rssi.applyHmipValue(device, 'RSSI_DEVICE', -58)).toBe(false);
        rssi.setCentralAddress(central);
        expect(rssi.centralAddress).toBe(central);
        expect(rssi.applyHmipValue(device, 'RSSI_DEVICE', -58)).toBe(true);
    });

    it('reads both values out of a maintenance paramset', () => {
        const rssi = store();
        expect(rssi.applyHmipParamset(device, {RSSI_DEVICE: -58, RSSI_PEER: -61, UNREACH: false})).toBe(true);
        expect(rssi.get(central, device)).toEqual({rx: -58, tx: -61});
    });

    it('reports no change for a maintenance paramset without usable RSSI values', () => {
        const rssi = store();
        expect(rssi.applyHmipParamset(device, {UNREACH: false})).toBe(false);
        expect(rssi.applyHmipParamset(device, {RSSI_DEVICE: RSSI_UNKNOWN})).toBe(false);
    });
});

describe('bestInterfaceFor (input for issue #69)', () => {
    const store = new RssiStore();
    store.applyRssiInfo({
        MEQ0123456: {'BidCoS-RF': [-80, -78], 'LEQ-LGW-01': [-60, -55], 'LEQ-LGW-02': [-90, RSSI_UNKNOWN]},
    });

    it('picks the interface that hears the device best', () => {
        expect(store.bestInterfaceFor('MEQ0123456', ['BidCoS-RF', 'LEQ-LGW-01', 'LEQ-LGW-02'])).toEqual({
            address: 'LEQ-LGW-01',
            rx: -60,
            tx: -55,
        });
    });

    it('keeps the best one whichever order the candidates come in', () => {
        expect(store.bestInterfaceFor('MEQ0123456', ['LEQ-LGW-01', 'BidCoS-RF'])?.address).toBe('LEQ-LGW-01');
        expect(store.bestInterfaceFor('MEQ0123456', ['BidCoS-RF', 'LEQ-LGW-01'])?.address).toBe('LEQ-LGW-01');
    });

    it('skips interfaces with no measurement at all', () => {
        expect(store.bestInterfaceFor('MEQ0123456', ['LEQ-LGW-02', 'BidCoS-RF'])?.address).toBe('BidCoS-RF');
    });

    it('has no answer for a device or a candidate list it knows nothing about', () => {
        expect(store.bestInterfaceFor('nope', ['BidCoS-RF'])).toBeUndefined();
        expect(store.bestInterfaceFor('MEQ0123456', [])).toBeUndefined();
        expect(store.bestInterfaceFor('MEQ0123456', ['LEQ-LGW-02'])).toBeUndefined();
    });
});

describe('the names of the BidCos interfaces (BUGS.md B-2)', () => {
    const coprocessor = {ADDRESS: 'PEQ1098001', DESCRIPTION: 'CCU2-Coprocessor'};
    // a LAN gateway nobody named: the CCU sends an empty description
    const unnamed = {ADDRESS: 'OEQ0328853', DESCRIPTION: ''};
    const bare = {ADDRESS: 'OEQ0328953'};
    const gateways = [coprocessor, unnamed, bare];

    it('names an interface by its description and falls back to the serial', () => {
        expect(bidcosInterfaceLabel(coprocessor)).toBe('CCU2-Coprocessor');
        expect(bidcosInterfaceLabel(unnamed)).toBe('OEQ0328853');
        expect(bidcosInterfaceLabel(bare)).toBe('OEQ0328953');
        expect(bidcosInterfaceLabel({ADDRESS: 'OEQ0000001', DESCRIPTION: '   '})).toBe('OEQ0000001');
    });

    it('labels the receiver of a device with the name of the gateway its INTERFACE names', () => {
        expect(receiverLabel({INTERFACE: 'PEQ1098001'}, gateways)).toBe('CCU2-Coprocessor');
        expect(receiverLabel({INTERFACE: 'OEQ0328853'}, gateways)).toBe('OEQ0328853');
    });

    it('shows the serial when the gateway list does not know it, and nothing for a device without one', () => {
        expect(receiverLabel({INTERFACE: 'OEQ9999999'}, gateways)).toBe('OEQ9999999');
        expect(receiverLabel({INTERFACE: 'PEQ1098001'}, [])).toBe('PEQ1098001');
        expect(receiverLabel({}, gateways)).toBe('');
        expect(receiverLabel({INTERFACE: ''}, gateways)).toBe('');
    });
});

describe('the best-receiver proposal (#69)', () => {
    // three interfaces: the coprocessor, a LAN gateway everything is heard well by, one that hears little
    const gateways = ['BidCoS-RF', 'LEQ-LGW-01', 'LEQ-LGW-02'];
    const store = new RssiStore();
    store.applyRssiInfo({
        // 12 dB better on the gateway: a clear switch
        MEQ0000001: {'BidCoS-RF': [-80, -84], 'LEQ-LGW-01': [-70, -72]},
        // 3 dB better on the gateway: within the noise of two reads
        MEQ0000002: {'BidCoS-RF': [-80, -75], 'LEQ-LGW-01': [-70, -72]},
        // the configured one is the best
        MEQ0000003: {'BidCoS-RF': [-50, -52], 'LEQ-LGW-01': [-70, -72]},
        // the configured receiver has nothing, another one has
        MEQ0000004: {'BidCoS-RF': [RSSI_UNKNOWN, RSSI_UNKNOWN], 'LEQ-LGW-01': [-70, -72]},
        // nothing at all
        MEQ0000005: {'BidCoS-RF': [RSSI_UNKNOWN, RSSI_UNKNOWN]},
        // the same value on both: the configured one stays
        MEQ0000006: {'BidCoS-RF': [-70, -72], 'LEQ-LGW-01': [-70, -72]},
        // roams, and would otherwise be a switch
        MEQ0000007: {'BidCoS-RF': [-90, -95], 'LEQ-LGW-01': [-60, -60]},
    });
    const devices = [
        {ADDRESS: 'MEQ0000001', INTERFACE: 'BidCoS-RF'},
        {ADDRESS: 'MEQ0000001:1', PARENT: 'MEQ0000001', INTERFACE: 'BidCoS-RF'},
        {ADDRESS: 'MEQ0000002', INTERFACE: 'BidCoS-RF'},
        {ADDRESS: 'MEQ0000003', INTERFACE: 'BidCoS-RF'},
        {ADDRESS: 'MEQ0000004', INTERFACE: 'BidCoS-RF'},
        {ADDRESS: 'MEQ0000005', INTERFACE: 'BidCoS-RF'},
        {ADDRESS: 'MEQ0000006', INTERFACE: 'BidCoS-RF'},
        {ADDRESS: 'MEQ0000007', INTERFACE: 'BidCoS-RF', ROAMING: 1},
        // HmIP, Wired and a group have no receiver and are not in the answer
        {ADDRESS: '0001D3C99ABCDE'},
        {ADDRESS: 'INT0000001', INTERFACE: ''},
    ];

    it('gives every device with a receiver a verdict, channels and receiver-less devices none', () => {
        const proposals = proposeReceivers(devices, gateways, store);
        expect(proposals.map((row) => [row.address, row.verdict])).toEqual([
            ['MEQ0000001', 'switch'],
            ['MEQ0000002', 'marginal'],
            ['MEQ0000004', 'unheard'],
            ['MEQ0000003', 'keep'],
            ['MEQ0000006', 'keep'],
            ['MEQ0000005', 'unmeasured'],
            ['MEQ0000007', 'roaming'],
        ]);
    });

    it('measures what the interfaces receive from the device, and says by how much', () => {
        const [first] = proposeReceivers(devices, gateways, store);
        expect(first).toEqual({
            address: 'MEQ0000001',
            configured: 'BidCoS-RF',
            configuredTx: -84,
            best: 'LEQ-LGW-01',
            bestTx: -72,
            gain: 12,
            verdict: 'switch',
        });
        const unheard = proposeReceivers(devices, gateways, store).find((row) => row.address === 'MEQ0000004');
        expect(unheard?.configuredTx).toBeUndefined();
        expect(unheard?.gain).toBeUndefined();
        expect(unheard?.best).toBe('LEQ-LGW-01');
    });

    it('takes the margin from the caller: at 3 dB the marginal one switches, at 20 dB nothing does', () => {
        expect(DEFAULT_RECEIVER_MARGIN_DB).toBe(6);
        const at3 = proposeReceivers(devices, gateways, store, {marginDb: 3});
        expect(at3.find((row) => row.address === 'MEQ0000002')?.verdict).toBe('switch');
        // a switch by more sorts first
        expect(at3.slice(0, 2).map((row) => row.address)).toEqual(['MEQ0000001', 'MEQ0000002']);
        const at20 = proposeReceivers(devices, gateways, store, {marginDb: 20});
        expect(at20.filter((row) => row.verdict === 'switch')).toEqual([]);
        expect(at20.find((row) => row.address === 'MEQ0000001')?.verdict).toBe('marginal');
        // a negative margin is no margin
        expect(proposeReceivers(devices, gateways, store, {marginDb: -5})[0]?.verdict).toBe('switch');
    });

    it('keeps a device whose configured receiver is not in the interface list, unless another hears it', () => {
        const stale = [{ADDRESS: 'MEQ0000001', INTERFACE: 'OEQ-GONE'}];
        expect(proposeReceivers(stale, gateways, store)[0]?.verdict).toBe('unheard');
        expect(proposeReceivers(stale, [], store)[0]?.verdict).toBe('unmeasured');
    });
});
