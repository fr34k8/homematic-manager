import {fireEvent, screen, waitFor, within} from '@testing-library/svelte';
import {beforeEach, describe, expect, it} from 'vitest';

import {MockTransport} from '../../lib/transport/MockTransport.js';
import {mountApp} from '../../testHarness.js';

/**
 * Task 25: the rooms-and-functions UI against the demo store - the same core `MetaStore` the
 * backend's local provider runs, so every write here is a real write with a revision, and every
 * assertion reads what the event brought back rather than what the dialog believed.
 */

function rowOf(address: string): HTMLElement {
    const row = document.querySelector<HTMLElement>(`[data-row-id="${address}"]`);
    expect(row, `no row for ${address}`).not.toBeNull();
    return row!;
}

function rowIds(): string[] {
    return [...document.querySelectorAll<HTMLElement>('[data-row-id][data-row-kind="row"]')].map(
        (row) => row.getAttribute('data-row-id') ?? '',
    );
}

/** The texts of a row's cells; a device row starts with the icon cell, a channel row with the name. */
function cells(address: string): string[] {
    return [...rowOf(address).querySelectorAll('[role=gridcell]')].map((cell) => cell.textContent.trim());
}

/** The rooms and functions cells of a row, whichever kind of row it is. */
function taxonomyCells(address: string): {rooms: string; functions: string} {
    const texts = cells(address);
    const offset = address.includes(':') ? 2 : 3;
    return {rooms: texts[offset] ?? '', functions: texts[offset + 1] ?? ''};
}

async function expand(address: string): Promise<void> {
    const expander = within(rowOf(address)).queryByRole('button', {name: 'Expand row'});
    if (expander) {
        await fireEvent.click(expander);
    }
}

async function select(address: string, ctrl = false): Promise<void> {
    await fireEvent.click(rowOf(address), {ctrlKey: ctrl});
}

describe('the rooms and functions columns', () => {
    let transport: MockTransport;

    beforeEach(() => {
        transport = new MockTransport({demo: true});
    });

    it('prints the leaf names of a channel, and the union of its channels on the device row', async () => {
        await mountApp({transport, hash: '#/BidCos-RF/devices'});
        // the floor is not printed: the column shows the leaf, the filter knows the tree
        expect(taxonomyCells('MEQ0123456')).toEqual({rooms: 'Küche', functions: 'Licht'});
        expect(taxonomyCells('KEQ0345678')).toEqual({rooms: 'Bad', functions: 'Heizung'});
        expect(taxonomyCells('NEQ1000001')).toEqual({rooms: '', functions: ''});
        await expand('MEQ0123456');
        expect(taxonomyCells('MEQ0123456:1')).toEqual({rooms: 'Küche', functions: 'Licht'});
        expect(taxonomyCells('MEQ0123456:0')).toEqual({rooms: '', functions: ''});
    });

    it('follows a change that arrives as an event', async () => {
        const {stores} = await mountApp({transport, hash: '#/BidCos-RF/devices'});
        transport.emit('meta.objects.changed', {
            ...stores.taxonomy.objects,
            'BidCos-RF.MEQ0123456:1': {name: 'x', enums: ['room/aussen'], rooms: ['Außen'], functions: []},
        });
        await waitFor(() => expect(taxonomyCells('MEQ0123456')).toEqual({rooms: 'Außen', functions: ''}));
    });
});

describe('the filter above the grid', () => {
    let transport: MockTransport;

    beforeEach(() => {
        transport = new MockTransport({demo: true});
    });

    it('narrows the grid to a room, and a floor matches every room below it', async () => {
        await mountApp({transport, hash: '#/BidCos-RF/devices'});
        const room = screen.getByTestId<HTMLSelectElement>('devices-filter-room');
        expect([...room.options].map((option) => option.textContent)).toEqual([
            'Alle Räume',
            'Erdgeschoss',
            ' Küche',
            ' Wohnzimmer',
            ' Flur',
            'Obergeschoss',
            ' Bad',
            ' Schlafzimmer',
            'Außen',
        ]);

        await fireEvent.change(room, {target: {value: 'room/eg'}});
        await waitFor(() => expect(rowIds()).toEqual(['GEQ0567890', 'JEQ0234567', 'MEQ0123456']));

        await fireEvent.change(room, {target: {value: 'room/eg/kueche'}});
        await waitFor(() => expect(rowIds()).toEqual(['MEQ0123456']));
        // under a filtered device only the channels in the room are shown
        await expand('MEQ0123456');
        expect(rowIds()).toEqual(['MEQ0123456', 'MEQ0123456:1']);

        await fireEvent.change(room, {target: {value: ''}});
        await waitFor(() => expect(rowIds().length).toBeGreaterThan(5));
    });

    it('combines the room and the function filter', async () => {
        await mountApp({transport, hash: '#/BidCos-RF/devices'});
        await fireEvent.change(screen.getByTestId('devices-filter-function'), {target: {value: 'function/licht'}});
        await waitFor(() => expect(rowIds()).toEqual(['GEQ0567890', 'MEQ0123456']));
        await fireEvent.change(screen.getByTestId('devices-filter-room'), {target: {value: 'room/eg/wohnzimmer'}});
        await waitFor(() => expect(rowIds()).toEqual(['GEQ0567890']));
    });

    it('falls back to everything when the filtered node is deleted elsewhere', async () => {
        const {stores} = await mountApp({transport, hash: '#/BidCos-RF/devices'});
        await fireEvent.change(screen.getByTestId('devices-filter-room'), {target: {value: 'room/aussen'}});
        await waitFor(() => expect(rowIds()).toEqual([]));
        transport.emit('meta.enums.changed', {
            ...stores.taxonomy.enums,
            room: {name: {en: 'Rooms'}, tree: []},
        });
        await waitFor(() => expect(rowIds().length).toBeGreaterThan(5));
        expect(screen.getByTestId<HTMLSelectElement>('devices-filter-room').value).toBe('');
    });
});

describe('assigning the selection', () => {
    let transport: MockTransport;

    beforeEach(() => {
        transport = new MockTransport({demo: true});
    });

    it('is off without a selection and says so; off with a reason when the store is read-only', async () => {
        await mountApp({transport, hash: '#/BidCos-RF/devices'});
        const button = screen.getByTestId<HTMLButtonElement>('devices-assign-room');
        // #145: the app draws the tooltip now, so the text is on the anchor, not on the button
        const tip = (): string => screen.getByTestId('devices-assign-room-tooltip').getAttribute('data-tooltip') ?? '';
        expect(button.disabled).toBe(true);
        expect(tip()).toContain('Zeilen auswählen');

        await select('MEQ0123456');
        expect(button.disabled).toBe(false);

        transport.emit('meta.changed', {
            provider: 'occulite',
            reachable: true,
            writable: false,
            revision: 1,
            objects: 0,
        });
        await waitFor(() => expect(button.disabled).toBe(true));
        expect(tip()).toContain('keine Änderungen');
    });

    it('puts a multi-selection into a room with one request, and the rows follow', async () => {
        await mountApp({transport, hash: '#/BidCos-RF/devices'});
        await select('KEQ0345678');
        await select('LEQ0456789', true);
        await fireEvent.click(screen.getByTestId('devices-assign-room'));

        await waitFor(() => expect(screen.getByTestId('assign-dialog')).toBeTruthy());
        expect(screen.getByTestId('assign-count').textContent).toBe('2 Zeilen ausgewählt');
        await fireEvent.change(screen.getByTestId('assign-select'), {target: {value: 'room/aussen'}});
        await fireEvent.click(screen.getByTestId('assign-apply'));

        await waitFor(() =>
            expect(transport.lastCall('meta.assign')).toEqual([
                ['BidCos-RF.KEQ0345678', 'BidCos-RF.LEQ0456789'],
                'room/aussen',
                true,
            ]),
        );
        await waitFor(() => expect(taxonomyCells('KEQ0345678').rooms).toBe('Außen'));
        expect(screen.getByTestId('assign-dialog').hasAttribute('open')).toBe(false);
    });

    it('takes the selection out of a function again', async () => {
        await mountApp({transport, hash: '#/BidCos-RF/devices'});
        await expand('MEQ0123456');
        await select('MEQ0123456:1');
        await fireEvent.click(screen.getByTestId('devices-assign-function'));
        await waitFor(() => expect(screen.getByTestId('assign-dialog')).toBeTruthy());
        await fireEvent.click(screen.getByTestId('assign-remove'));
        await fireEvent.change(screen.getByTestId('assign-select'), {target: {value: 'function/licht'}});
        await fireEvent.click(screen.getByTestId('assign-apply'));

        await waitFor(() =>
            expect(transport.lastCall('meta.assign')).toEqual([['BidCos-RF.MEQ0123456:1'], 'function/licht', false]),
        );
        await waitFor(() => expect(taxonomyCells('MEQ0123456:1').functions).toBe(''));
    });

    it('opens from the context menu on the row it was opened on, or on the selection it is part of', async () => {
        await mountApp({transport, hash: '#/BidCos-RF/devices'});
        await fireEvent.contextMenu(rowOf('JEQ0234567'));
        await fireEvent.click(within(screen.getByTestId('devices-menu')).getByText('Raum zuordnen…'));
        await waitFor(() => expect(screen.getByTestId('assign-count').textContent).toBe('Eine Zeile ausgewählt'));
        await fireEvent.click(within(screen.getByTestId('assign-dialog')).getByText('Abbrechen'));

        await select('MEQ0123456');
        await select('JEQ0234567', true);
        await fireEvent.contextMenu(rowOf('JEQ0234567'));
        await fireEvent.click(within(screen.getByTestId('devices-menu')).getByText('Gewerk zuordnen…'));
        await waitFor(() => expect(screen.getByTestId('assign-count').textContent).toBe('2 Zeilen ausgewählt'));
    });

    it('reports a refused assignment and keeps the dialog open', async () => {
        transport.fail('meta.assign', {message: 'forbidden', kind: 'validation'});
        const {stores} = await mountApp({transport, hash: '#/BidCos-RF/devices'});
        await select('MEQ0123456');
        await fireEvent.click(screen.getByTestId('devices-assign-room'));
        await waitFor(() => expect(screen.getByTestId('assign-dialog')).toBeTruthy());
        await fireEvent.click(screen.getByTestId('assign-apply'));
        await waitFor(() => expect(stores.notices.items.at(-1)?.message).toContain('forbidden'));
        expect(screen.getByTestId('assign-dialog').hasAttribute('open')).toBe(true);
    });
});

describe('the tree dialog', () => {
    let transport: MockTransport;

    beforeEach(() => {
        transport = new MockTransport({demo: true});
    });

    async function openDialog(): Promise<Awaited<ReturnType<typeof mountApp>>> {
        const mounted = await mountApp({transport, hash: '#/BidCos-RF/devices'});
        await fireEvent.click(screen.getByTestId('devices-taxonomy'));
        await waitFor(() => expect(screen.getByTestId('taxonomy-dialog')).toBeTruthy());
        return mounted;
    }

    function nodeLabels(): string[] {
        return [...screen.getByTestId('taxonomy-dialog').querySelectorAll('[role=option]')].map(
            (node) => node.querySelector('.hmm-tax-node-name')?.textContent ?? '',
        );
    }

    it('lists the rooms as a tree with their member counts, and the functions as a list', async () => {
        await openDialog();
        expect(nodeLabels()).toEqual([
            'Erdgeschoss',
            'Küche',
            'Wohnzimmer',
            'Flur',
            'Obergeschoss',
            'Bad',
            'Schlafzimmer',
            'Außen',
        ]);
        expect(screen.getByTestId('taxonomy-node-room/eg').textContent).toContain('3');
        expect(screen.getByTestId('taxonomy-node-room/eg/kueche').style.paddingLeft).toBe('26px');
        expect(screen.getByTestId('taxonomy-hint').textContent).toContain('Etage');

        await fireEvent.click(screen.getByTestId('taxonomy-tab-function'));
        expect(nodeLabels()).toEqual(['Licht', 'Heizung', 'Sicherheit']);
        expect(screen.queryByTestId('taxonomy-add-below')).toBeNull();
        expect(screen.queryByTestId('taxonomy-move')).toBeNull();
        expect(screen.queryByTestId('taxonomy-hint')).toBeNull();
    });

    it('adds a room at the top, then a room below it - which is what a floor is', async () => {
        await openDialog();
        await fireEvent.click(screen.getByTestId('taxonomy-add'));
        await fireEvent.input(screen.getByTestId('taxonomy-name'), {target: {value: 'Keller'}});
        await fireEvent.keyDown(screen.getByTestId('taxonomy-name'), {key: 'Enter'});
        await waitFor(() => expect(transport.lastCall('meta.node.create')).toEqual(['room', undefined, 'Keller']));
        await waitFor(() => expect(nodeLabels()).toContain('Keller'));
        // the new node is selected, so "add below" acts on it
        expect(screen.getByTestId('taxonomy-node-room/keller').getAttribute('aria-selected')).toBe('true');

        await fireEvent.click(screen.getByTestId('taxonomy-add-below'));
        expect(screen.getByTestId('taxonomy-form').textContent).toContain('Keller');
        await fireEvent.input(screen.getByTestId('taxonomy-name'), {target: {value: 'Werkstatt'}});
        await fireEvent.click(screen.getByTestId('taxonomy-apply'));
        await waitFor(() =>
            expect(transport.lastCall('meta.node.create')).toEqual(['room', 'room/keller', 'Werkstatt']),
        );
        await waitFor(() => expect(screen.getByTestId('taxonomy-node-room/keller/werkstatt')).toBeTruthy());
    });

    it('renames and moves a room; the members follow the move', async () => {
        const {stores} = await openDialog();
        await fireEvent.click(screen.getByTestId('taxonomy-node-room/eg/kueche'));
        await fireEvent.click(screen.getByTestId('taxonomy-rename'));
        expect(screen.getByTestId<HTMLInputElement>('taxonomy-name').value).toBe('Küche');
        await fireEvent.input(screen.getByTestId('taxonomy-name'), {target: {value: 'Kochen'}});
        await fireEvent.click(screen.getByTestId('taxonomy-apply'));
        await waitFor(() =>
            expect(transport.lastCall('meta.node.update')).toEqual(['room/eg/kueche', {name: 'Kochen'}]),
        );
        await waitFor(() => expect(nodeLabels()).toContain('Kochen'));

        await fireEvent.click(screen.getByTestId('taxonomy-move'));
        const parent = screen.getByTestId<HTMLSelectElement>('taxonomy-parent');
        // not under itself, otherwise anywhere - the top level first
        expect([...parent.options].map((option) => option.value)).toEqual([
            '',
            'room/eg',
            'room/eg/wohnzimmer',
            'room/eg/flur',
            'room/og',
            'room/og/bad',
            'room/og/schlafzimmer',
            'room/aussen',
        ]);
        await fireEvent.change(parent, {target: {value: 'room/og'}});
        await fireEvent.click(screen.getByTestId('taxonomy-apply'));
        await waitFor(() =>
            expect(transport.lastCall('meta.node.update')).toEqual(['room/eg/kueche', {parent: 'room/og'}]),
        );
        await waitFor(() => expect(screen.getByTestId('taxonomy-node-room/og/kueche')).toBeTruthy());
        expect(stores.taxonomy.view('BidCos-RF.MEQ0123456:1')?.enums).toContain('room/og/kueche');
    });

    it('deletes an empty node at once, and lists the members of a full one before detaching them', async () => {
        const {stores} = await openDialog();
        await fireEvent.click(screen.getByTestId('taxonomy-node-room/aussen'));
        await fireEvent.click(screen.getByTestId('taxonomy-delete'));
        // Außen has one member on the HmIP interface
        expect(screen.getByTestId('taxonomy-members').textContent).toContain(
            'Schaltaktor Terrasse:4 (000A1B2C3D4E5F:4)',
        );
        expect(screen.getByTestId('taxonomy-apply').textContent).toBe('Löschen und Zuordnungen entfernen');
        await fireEvent.click(screen.getByTestId('taxonomy-apply'));
        await waitFor(() => expect(transport.lastCall('meta.node.delete')).toEqual(['room/aussen', true]));
        await waitFor(() => expect(nodeLabels()).not.toContain('Außen'));
        expect(stores.taxonomy.view('HmIP-RF.000A1B2C3D4E5F:4')?.rooms).toEqual([]);

        // the floor lists everything below it
        await fireEvent.click(screen.getByTestId('taxonomy-node-room/eg'));
        await fireEvent.click(screen.getByTestId('taxonomy-delete'));
        expect(screen.getByTestId('taxonomy-members').querySelectorAll('li')).toHaveLength(3);
        await fireEvent.click(within(screen.getByTestId('taxonomy-form')).getByText('Abbrechen'));

        await fireEvent.click(screen.getByTestId('taxonomy-tab-function'));
        await fireEvent.click(screen.getByTestId('taxonomy-add'));
        await fireEvent.input(screen.getByTestId('taxonomy-name'), {target: {value: 'Rollladen'}});
        await fireEvent.click(screen.getByTestId('taxonomy-apply'));
        await waitFor(() => expect(screen.getByTestId('taxonomy-node-function/rollladen')).toBeTruthy());
        await fireEvent.click(screen.getByTestId('taxonomy-delete'));
        expect(screen.getByTestId('taxonomy-form').textContent).toContain('nichts zugeordnet');
        expect(screen.getByTestId('taxonomy-apply').textContent).toBe('Löschen');
        await fireEvent.click(screen.getByTestId('taxonomy-apply'));
        await waitFor(() => expect(transport.lastCall('meta.node.delete')).toEqual(['function/rollladen', false]));
    });

    it('reads the store again from the refresh button (task 27: ReGa has no change stream)', async () => {
        await openDialog();
        await fireEvent.click(screen.getByTestId('taxonomy-refresh'));
        await waitFor(() => expect(transport.countOf('meta.refresh')).toBe(1));
    });

    it('hides "add below" and "move" and says why when the store is flat (ReGa)', async () => {
        await openDialog();
        transport.emit('meta.changed', {
            provider: 'local',
            reachable: true,
            writable: true,
            revision: 1,
            objects: 0,
            flat: true,
        });
        await waitFor(() => expect(screen.queryByTestId('taxonomy-add-below')).toBeNull());
        expect(screen.queryByTestId('taxonomy-move')).toBeNull();
        expect(screen.getByTestId('taxonomy-hint').textContent).toContain('flache Liste');
    });

    it('greys every action out when the store does not take writes', async () => {
        await openDialog();
        transport.emit('meta.changed', {
            provider: 'occulite',
            reachable: true,
            writable: false,
            revision: 1,
            objects: 0,
        });
        await waitFor(() => expect(screen.getByTestId<HTMLButtonElement>('taxonomy-add').disabled).toBe(true));
        await fireEvent.click(screen.getByTestId('taxonomy-node-room/aussen'));
        expect(screen.getByTestId<HTMLButtonElement>('taxonomy-delete').disabled).toBe(true);
    });
});

describe('the store indicator and the settings section', () => {
    let transport: MockTransport;

    beforeEach(() => {
        transport = new MockTransport({demo: true});
    });

    it('names the provider in the interface popup and colours its state', async () => {
        await mountApp({transport, hash: '#/BidCos-RF/devices'});
        // 2026-09-10: the line lives inside the interface picker now, under the host
        expect(screen.queryByTestId('meta-indicator')).toBeNull();
        await fireEvent.click(screen.getByTestId('interface-select-trigger'));
        const indicator = screen.getByTestId('meta-indicator');
        // it is read, not clicked
        expect(indicator.tagName).toBe('DIV');
        expect(indicator.textContent.trim()).toBe('Dieses Profil');
        expect(indicator.dataset['mark']).toBe('ok');
        expect(indicator.title).toContain('Revision 7, 6 Objekte');

        transport.emit('meta.changed', {
            provider: 'occulite',
            reachable: true,
            writable: false,
            revision: 3,
            objects: 12,
            implementation: 'occulited 0.1.0',
        });
        await waitFor(() => expect(indicator.dataset['mark']).toBe('readonly'));
        expect(indicator.textContent.trim()).toBe('occulited');
        expect(indicator.title).toContain('occulited 0.1.0');
        expect(indicator.title).toContain('Nur lesen');

        transport.emit('meta.changed', {
            provider: 'occulite',
            reachable: false,
            writable: false,
            revision: 3,
            objects: 12,
            error: 'box off',
        });
        await waitFor(() => expect(indicator.dataset['mark']).toBe('bad'));
        expect(indicator.title).toContain('box off');

        transport.emit('meta.changed', {
            provider: 'rega',
            reachable: true,
            writable: true,
            revision: 2,
            objects: 40,
            flat: true,
        });
        await waitFor(() => expect(indicator.textContent.trim()).toBe('ReGaHSS'));
        expect(indicator.dataset['mark']).toBe('ok');
    });

    it('is not drawn at all without a store', async () => {
        await mountApp({transport: new MockTransport(), hash: ''});
        await fireEvent.click(screen.getByTestId('interface-select-trigger'));
        expect(screen.queryByTestId('meta-indicator')).toBeNull();
    });

    it('has its section in the settings, which stores the provider choice and the token', async () => {
        await mountApp({transport, hash: '#/BidCos-RF/devices'});
        await fireEvent.click(screen.getByTestId('settings-button'));
        await waitFor(() => expect(screen.getByTestId('config-dialog')).toBeTruthy());
        expect(screen.getByTestId('config-meta-state').textContent).toContain('Erreichbar');
        expect(screen.getByTestId('config-meta-state').textContent).toContain('Schreibbar');

        const provider = screen.getByTestId<HTMLSelectElement>('config-meta-provider');
        expect(provider.value).toBe('auto');
        expect([...provider.options].map((option) => option.textContent)).toEqual([
            'Automatisch',
            'Dieses Profil',
            'occulited',
            'ReGaHSS',
        ]);
        await fireEvent.change(provider, {target: {value: 'occulite'}});
        await fireEvent.input(screen.getByTestId('config-meta-token'), {target: {value: 'olt_secret'}});
        await fireEvent.click(screen.getByTestId('config-save'));
        await waitFor(() => expect(transport.lastCall('config.set')?.[0]?.metaProvider).toBe('occulite'));
        expect(transport.lastCall('config.set')?.[0]?.metaToken).toBe('olt_secret');
    });
});
