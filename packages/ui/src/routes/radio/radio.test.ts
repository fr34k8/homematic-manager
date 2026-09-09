import type {RssiInfo} from '@homematic-manager/core';
import {fireEvent, render, screen, waitFor, within} from '@testing-library/svelte';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import RssiCell from '../../lib/components/RssiCell.svelte';
import {MockTransport} from '../../lib/transport/MockTransport.js';
import {mountApp} from '../../testHarness.js';

describe('the RSSI cell', () => {
    afterEach(() => {
        document.documentElement.removeAttribute('data-theme');
    });

    it('prints the value with its unit, and a dash for what the interface does not know', () => {
        const {container} = render(RssiCell, {props: {value: -52}});
        expect(container.textContent).toBe('-52 dBm');

        const empty = render(RssiCell, {props: {}});
        expect(empty.container.textContent).toBe('—');
    });

    // D-22: the RSSI colours carry meaning, so they are asserted in both themes. The class is what
    // the theme switches, never the structure - the 2.x inline `#rrgg00` could not do that.
    for (const theme of ['light', 'dark'] as const) {
        it(`keeps the four RSSI classes apart in the ${theme} theme`, () => {
            document.documentElement.setAttribute('data-theme', theme);
            const cases = [
                {value: -10, expected: 'good'},
                {value: -60, expected: 'medium'},
                {value: -110, expected: 'bad'},
                {value: undefined, expected: 'unknown'},
                // 65536 is the interface process' placeholder for "not known".
                {value: 65_536, expected: 'unknown'},
            ];
            for (const {value, expected} of cases) {
                const {container} = render(RssiCell, {props: {value}});
                const cell = container.querySelector('.hmm-rssi');
                expect(cell?.getAttribute('data-rssi'), String(value)).toBe(expected);
                expect(cell?.classList.contains(`hmm-rssi-${expected}`), String(value)).toBe(true);
            }
        });
    }
});

describe('the radio tab', () => {
    let transport: MockTransport;

    beforeEach(() => {
        transport = new MockTransport({demo: true});
    });

    it('lists the BidCos interfaces with the columns of the 2.7 interface grid', async () => {
        await mountApp({transport, hash: '#/BidCos-RF/rssi'});

        const gateways = await waitFor(() => screen.getByTestId('radio-gateways'));
        const labels = within(gateways)
            .getAllByRole('columnheader')
            .map((header) => header.textContent.trim());
        expect(labels).toEqual([
            'ADDRESS',
            'DESCRIPTION',
            'TYPE',
            'FIRMWARE_VERSION',
            'CONNECTED',
            'DEFAULT',
            'DUTY_CYCLE',
            'CARRIER_SENSE_LEVEL',
        ]);
        const row = within(gateways).getByText('CCU2-Coprocessor').closest('[data-row-id]');
        expect(row?.textContent).toContain('2.8.6');
        expect(row?.textContent).toContain('1 %');
    });

    it('draws a receive/send pair per gateway, coloured by the core classes', async () => {
        await mountApp({transport, hash: '#/BidCos-RF/rssi'});

        await waitFor(() => {
            expect(screen.getByTestId('rssi-MEQ0123456-BidCoS-RF-rx')).toBeTruthy();
        });
        expect(screen.getByTestId('rssi-MEQ0123456-BidCoS-RF-rx').textContent).toBe('-52 dBm');
        expect(screen.getByTestId('rssi-MEQ0123456-BidCoS-RF-rx').getAttribute('data-rssi')).toBe('medium');
        // LEQ0456789 is at -112 dBm: bad. Its tx is 65536 and therefore unknown.
        expect(screen.getByTestId('rssi-LEQ0456789-BidCoS-RF-rx').getAttribute('data-rssi')).toBe('bad');
        expect(screen.getByTestId('rssi-LEQ0456789-BidCoS-RF-tx').getAttribute('data-rssi')).toBe('unknown');
    });

    it('names each interface over its own columns - serial, description, configured marker (B-2, #142)', async () => {
        await mountApp({transport, hash: '#/BidCos-RF/rssi'});
        await waitFor(() => {
            expect(document.querySelector('[data-row-id="MEQ0123456"]')).toBeTruthy();
        });
        // the 2.x group header: the serial, the description in small print under it
        const group = screen.getByTestId('radio-table-group-BidCoS-RF');
        expect(group.textContent).toContain('BidCoS-RF');
        expect(group.textContent).toContain('(CCU2-Coprocessor)');
        expect(group.getAttribute('aria-colspan')).toBe('3');
        // the dBm labels no longer carry the serial (it was cut off at every width)
        const labels = within(screen.getByTestId('radio-table'))
            .getAllByRole('columnheader')
            .map((header) => header.textContent.trim());
        expect(labels).toContain('← dBm');
        expect(labels).not.toContain('← dBm BidCoS-RF');
        // MEQ0123456 is configured for BidCoS-RF: its marker is filled
        const marker = screen.getByTestId('receiver-MEQ0123456-BidCoS-RF');
        expect(marker.getAttribute('aria-pressed')).toBe('true');
        expect(marker.textContent).toBe('◉');
    });

    it('opens the setBidcosInterface dialog on the gateway whose marker was clicked', async () => {
        transport.result('bidcos.interfaces', [
            {ADDRESS: 'BidCoS-RF', TYPE: 'CCU2', DESCRIPTION: 'CCU2-Coprocessor', DEFAULT: true},
            // a LAN gateway nobody named: the header shows the serial alone
            {ADDRESS: 'OEQ0328853', TYPE: 'HMLGW2', DESCRIPTION: ''},
        ]);
        await mountApp({transport, hash: '#/BidCos-RF/rssi'});
        await waitFor(() => {
            expect(screen.getByTestId('receiver-MEQ0123456-OEQ0328853')).toBeTruthy();
        });
        expect(screen.getByTestId('radio-table-group-OEQ0328853').textContent.trim()).toBe('OEQ0328853');
        const other = screen.getByTestId('receiver-MEQ0123456-OEQ0328853');
        expect(other.getAttribute('aria-pressed')).toBe('false');
        expect(other.textContent).toBe('○');

        await fireEvent.click(other);
        await waitFor(() => {
            expect(screen.getByTestId('set-interface-confirm')).toBeTruthy();
        });
        // the dialog proposes the gateway that was clicked and marks the one that is configured
        expect(screen.getByTestId<HTMLSelectElement>('set-interface-select').value).toBe('OEQ0328853');
        expect(screen.getByTestId('set-interface-current').textContent).toBe('BidCoS-RF');
        expect(screen.getByTestId('set-interface-row-BidCoS-RF').getAttribute('aria-current')).toBe('true');
        expect(screen.getByTestId('set-interface-row-BidCoS-RF').textContent).toContain('◉');
        expect(screen.getByTestId('set-interface-row-OEQ0328853').getAttribute('aria-current')).toBeNull();
    });

    it('opens the peers of a device as the 2.7 RSSI sub-grid', async () => {
        await mountApp({transport, hash: '#/BidCos-RF/rssi'});
        await waitFor(() => {
            expect(document.querySelector('[data-row-id="MEQ0123456"]')).toBeTruthy();
        });

        const row = document.querySelector<HTMLElement>('[data-row-id="MEQ0123456"]')!;
        await fireEvent.click(within(row).getByRole('button', {name: 'Expand row'}));

        await waitFor(() => {
            expect(screen.getByTestId('rssi-MEQ0123456-JEQ0234567-rx')).toBeTruthy();
        });
        expect(screen.getByTestId('rssi-MEQ0123456-JEQ0234567-rx').textContent).toBe('-70 dBm');
    });

    it('builds the HmIP matrix from the RSSI_DEVICE and RSSI_PEER events', async () => {
        transport.result('bidcos.interfaces', [{ADDRESS: 'HmIP-RCV-50', TYPE: 'HMIP_CCU', DEFAULT: true}]);
        const {stores} = await mountApp({transport, hash: '#/HmIP-RF/rssi'});
        await waitFor(() => {
            expect(stores.radio.gateways('HmIP-RF')).toHaveLength(1);
        });

        transport.emit('rpc.event', {
            timestamp: Date.now(),
            interfaceName: 'HmIP-RF',
            method: 'event',
            address: '000A1B2C3D4E5F:0',
            datapoint: 'RSSI_DEVICE',
            value: -61,
        });

        await waitFor(() => {
            expect(stores.radio.pair('HmIP-RF', 'HmIP-RCV-50', '000A1B2C3D4E5F')?.rx).toBe(-61);
        });
        // The same value the other way round: what the device receives from the access point.
        expect(stores.radio.pair('HmIP-RF', '000A1B2C3D4E5F', 'HmIP-RCV-50')?.tx).toBe(-61);
    });

    it('names the interface a device is heard best by (#69)', async () => {
        const {stores} = await mountApp({transport, hash: '#/BidCos-RF/rssi'});
        await waitFor(() => {
            expect(stores.radio.gateways('BidCos-RF')).toHaveLength(1);
        });
        expect(stores.radio.bestGatewayFor('BidCos-RF', 'JEQ0234567')).toEqual({
            address: 'BidCoS-RF',
            rx: -60,
            tx: -36,
        });
        expect(stores.radio.bestGatewayFor('BidCos-RF', 'LEQ0456789')).toBeUndefined();
    });
});

describe('setBidcosInterface', () => {
    let transport: MockTransport;

    beforeEach(() => {
        transport = new MockTransport({demo: true});
        transport.result('bidcos.setInterface', null);
    });

    it('shows the assignment the interface reports now, not the one read at start-up (#122)', async () => {
        await mountApp({transport, hash: '#/BidCos-RF/rssi'});
        await waitFor(() => {
            expect(document.querySelector('[data-row-id="MEQ0123456"]')).toBeTruthy();
        });
        await fireEvent.click(document.querySelector('[data-row-id="MEQ0123456"]')!);
        await fireEvent.click(screen.getByTestId('radio-set-interface'));

        await waitFor(() => {
            expect(screen.getByTestId('set-interface-current').textContent).toBe('BidCoS-RF');
        });
        expect(screen.getByTestId<HTMLSelectElement>('set-interface-select').value).toBe('BidCoS-RF');
    });

    it('sends the gateway and the roaming flag, then re-reads the device list', async () => {
        await mountApp({transport, hash: '#/BidCos-RF/rssi'});
        await waitFor(() => {
            expect(document.querySelector('[data-row-id="MEQ0123456"]')).toBeTruthy();
        });
        await fireEvent.click(document.querySelector('[data-row-id="MEQ0123456"]')!);
        await fireEvent.click(screen.getByTestId('radio-set-interface'));
        await waitFor(() => {
            expect(screen.getByTestId('set-interface-confirm')).toBeTruthy();
        });

        await fireEvent.click(screen.getByTestId('set-interface-roaming'));
        const before = transport.countOf('devices.list');
        await fireEvent.click(screen.getByTestId('set-interface-confirm'));

        await waitFor(() => {
            expect(transport.lastCall('bidcos.setInterface')).toEqual(['BidCos-RF', 'MEQ0123456', 'BidCoS-RF', true]);
        });
        await waitFor(() => {
            expect(transport.countOf('devices.list')).toBeGreaterThan(before);
        });
    });

    it('shows the unreach counter of #26 next to the receive levels, and resets it', async () => {
        // "für jedes Gerät einen Unreach-Counter speichern (Anzeige im Tab Funk)": the demo has
        // one device that dropped out seven times and one that is away right now
        const {stores} = await mountApp({transport, hash: '#/BidCos-RF/rssi'});
        await waitFor(() => {
            expect(stores.unreach.counters.length).toBeGreaterThan(0);
        });
        const row = document.querySelector<HTMLElement>('[data-row-id="MEQ0123456"]');
        await waitFor(() => {
            expect(row?.textContent).toContain('7');
        });
        // a device that never failed shows nothing at all rather than a zero
        expect(document.querySelector('[data-row-id="GEQ0567890"]')?.textContent).not.toContain('0 dBm7');

        await fireEvent.click(screen.getByTestId('radio-reset-unreach'));
        await waitFor(() => {
            expect(transport.lastCall('unreach.reset')).toEqual(['BidCos-RF', undefined]);
        });
    });

    it('reports a refused setBidcosInterface and keeps the dialog open', async () => {
        transport.fail('bidcos.setInterface', {message: 'Failure', kind: 'rpc', faultCode: -1});
        const {stores} = await mountApp({transport, hash: '#/BidCos-RF/rssi'});
        await waitFor(() => {
            expect(document.querySelector('[data-row-id="MEQ0123456"]')).toBeTruthy();
        });
        await fireEvent.click(document.querySelector('[data-row-id="MEQ0123456"]')!);
        await fireEvent.click(screen.getByTestId('radio-set-interface'));
        await waitFor(() => {
            expect(screen.getByTestId('set-interface-confirm')).toBeTruthy();
        });
        await fireEvent.click(screen.getByTestId('set-interface-confirm'));

        await waitFor(() => {
            expect(stores.notices.items.at(-1)?.message).toContain('Failure');
        });
        expect(screen.getByTestId('set-interface-dialog').hasAttribute('open')).toBe(true);
    });
});

describe('the best receiver (#69)', () => {
    let transport: MockTransport;
    const gateways = [
        {ADDRESS: 'BidCoS-RF', TYPE: 'CCU2', DESCRIPTION: 'CCU2-Coprocessor', DEFAULT: true},
        {ADDRESS: 'OEQ0328853', TYPE: 'HMLGW2', DESCRIPTION: 'Keller'},
    ];
    // every demo device is configured for BidCoS-RF; the gateway in the cellar hears some better
    const rssi: RssiInfo = {
        // 12 dB better on the gateway: a clear switch
        MEQ0123456: {'BidCoS-RF': [-80, -84], OEQ0328853: [-70, -72]},
        // 3 dB better: within the noise of two reads
        JEQ0234567: {'BidCoS-RF': [-80, -75], OEQ0328853: [-70, -72]},
        // the coprocessor hears it best
        KEQ0345678: {'BidCoS-RF': [-50, -52], OEQ0328853: [-70, -72]},
        // the configured receiver has no level of it, the gateway has
        LEQ0456789: {'BidCoS-RF': [-112, 65_536], OEQ0328853: [-70, -72]},
        // nothing at all
        GEQ0567890: {'BidCoS-RF': [65_536, 65_536]},
    };

    beforeEach(() => {
        transport = new MockTransport({demo: true});
        transport.result('bidcos.interfaces', gateways);
        transport.result('rssi.get', rssi);
        transport.result('bidcos.setInterface', null);
    });

    async function openDialog(): Promise<Awaited<ReturnType<typeof mountApp>>> {
        const mounted = await mountApp({transport, hash: '#/BidCos-RF/rssi'});
        await waitFor(() => {
            expect(screen.getByTestId('receiver-MEQ0123456-OEQ0328853')).toBeTruthy();
        });
        await fireEvent.click(screen.getByTestId('radio-best-receivers'));
        await waitFor(() => {
            expect(screen.getByTestId('best-receiver-confirm')).toBeTruthy();
        });
        return mounted;
    }

    // the demo profile chooses German (D-36), so the texts asserted here are the German ones
    it('is a dry run: the clear switch ticked, the marginal and the unheard one unticked with their reason, the rest counted', async () => {
        await openDialog();

        const clear = screen.getByTestId('best-receiver-row-MEQ0123456');
        expect(clear.getAttribute('data-verdict')).toBe('switch');
        expect(screen.getByTestId<HTMLInputElement>('best-receiver-check-MEQ0123456').checked).toBe(true);
        expect(screen.getByTestId('best-receiver-gain-MEQ0123456').textContent.trim()).toBe('+12 dB');
        // the receivers are named as listBidcosInterfaces describes them (B-2)
        expect(clear.textContent).toContain('CCU2-Coprocessor');
        expect(clear.textContent).toContain('Keller');

        const marginal = screen.getByTestId('best-receiver-row-JEQ0234567');
        expect(marginal.getAttribute('data-verdict')).toBe('marginal');
        expect(screen.getByTestId<HTMLInputElement>('best-receiver-check-JEQ0234567').checked).toBe(false);
        expect(marginal.textContent).toContain('Unter dem Mindestabstand');

        const unheard = screen.getByTestId('best-receiver-row-LEQ0456789');
        expect(unheard.getAttribute('data-verdict')).toBe('unheard');
        expect(screen.getByTestId<HTMLInputElement>('best-receiver-check-LEQ0456789').checked).toBe(false);
        expect(unheard.textContent).toContain('Vom konfigurierten Empfänger nicht gehört');
        expect(screen.getByTestId('best-receiver-gain-LEQ0456789').textContent.trim()).toBe('—');

        // the one on its best receiver and the one without a measurement are a line of counts
        expect(screen.queryByTestId('best-receiver-row-KEQ0345678')).toBeNull();
        expect(screen.queryByTestId('best-receiver-row-GEQ0567890')).toBeNull();
        expect(screen.getByTestId('best-receiver-rest').textContent).toContain(
            'Nicht aufgeführt: 1 auf ihrem besten Empfänger, 1 ohne Messwert, 0 mit Roaming',
        );
        expect(screen.getByTestId('best-receiver-confirm').textContent).toBe('Zuweisen (1)');
        // nothing was written by opening it
        expect(transport.countOf('bidcos.setInterface')).toBe(0);
    });

    it('writes one setBidcosInterface per ticked device with roaming off, re-reads, and closes', async () => {
        await openDialog();
        await fireEvent.click(screen.getByTestId('best-receiver-check-JEQ0234567'));
        expect(screen.getByTestId('best-receiver-confirm').textContent).toBe('Zuweisen (2)');
        const devicesBefore = transport.countOf('devices.list');
        const rssiBefore = transport.countOf('rssi.get');

        await fireEvent.click(screen.getByTestId('best-receiver-confirm'));

        await waitFor(() => {
            expect(screen.getByTestId('best-receiver-dialog').hasAttribute('open')).toBe(false);
        });
        const writes = transport.calls
            .filter((call) => call.method === 'bidcos.setInterface')
            .map((call) => call.params);
        expect(writes).toEqual([
            ['BidCos-RF', 'MEQ0123456', 'OEQ0328853', false],
            ['BidCos-RF', 'JEQ0234567', 'OEQ0328853', false],
        ]);
        expect(transport.countOf('devices.list')).toBeGreaterThan(devicesBefore);
        expect(transport.countOf('rssi.get')).toBeGreaterThan(rssiBefore);
    });

    it('lets the margin decide: at 3 dB the marginal device switches, at 20 dB nothing is a clear switch', async () => {
        await openDialog();
        await fireEvent.input(screen.getByTestId('best-receiver-margin'), {target: {value: '3'}});
        await waitFor(() => {
            expect(screen.getByTestId('best-receiver-row-JEQ0234567').getAttribute('data-verdict')).toBe('switch');
        });
        expect(screen.getByTestId<HTMLInputElement>('best-receiver-check-JEQ0234567').checked).toBe(true);
        expect(screen.getByTestId('best-receiver-confirm').textContent).toBe('Zuweisen (2)');

        await fireEvent.input(screen.getByTestId('best-receiver-margin'), {target: {value: '20'}});
        await waitFor(() => {
            expect(screen.getByTestId('best-receiver-row-MEQ0123456').getAttribute('data-verdict')).toBe('marginal');
        });
        expect(screen.getByTestId('best-receiver-confirm').textContent).toBe('Zuweisen (0)');
        expect(screen.getByTestId<HTMLButtonElement>('best-receiver-confirm').disabled).toBe(true);
    });

    it('keeps the dialog open when a write is refused', async () => {
        transport.fail('bidcos.setInterface', {message: 'Failure', kind: 'rpc', faultCode: -1});
        const {stores} = await openDialog();
        await fireEvent.click(screen.getByTestId('best-receiver-confirm'));

        await waitFor(() => {
            expect(stores.notices.items.at(-1)?.message).toContain('Failure');
        });
        await waitFor(() => {
            expect(screen.getByTestId<HTMLButtonElement>('best-receiver-confirm').disabled).toBe(false);
        });
        expect(screen.getByTestId('best-receiver-dialog').hasAttribute('open')).toBe(true);
        expect(screen.getByTestId('best-receiver-row-MEQ0123456')).toBeTruthy();
    });

    it('has nothing to propose with a single interface', async () => {
        transport = new MockTransport({demo: true});
        await mountApp({transport, hash: '#/BidCos-RF/rssi'});
        await waitFor(() => {
            expect(screen.getByTestId('receiver-MEQ0123456-BidCoS-RF')).toBeTruthy();
        });
        const button = screen.getByTestId<HTMLButtonElement>('radio-best-receivers');
        expect(button.disabled).toBe(true);
        expect(button.title).toContain('Nur eine Schnittstelle');
    });
});
