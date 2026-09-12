import {fireEvent, render, screen, waitFor, within} from '@testing-library/svelte';
import type {Component} from 'svelte';
import {describe, expect, it, vi} from 'vitest';
import {userEvent} from 'vitest/browser';

import {ColumnWidthsStore} from '../stores/ColumnWidthsStore.svelte.js';
import type {StorageLike} from '../stores/AppStore.svelte.js';
import {FIT_MAX_WIDTH, MIN_COLUMN_WIDTH} from './columnWidths.js';
import DataTableComponent from './DataTable.svelte';
import {DATA_TABLE_KEY, type DataTableEnvironment} from './dataTableContext.js';
import type {DataTableColumn} from './tableModel.js';
import {TOOLTIP_DELAY_MS} from './tooltip.js';

/**
 * A generic Svelte component resolves its type parameter to `unknown` when it is handed to
 * `render()`, which `exactOptionalPropertyTypes` then rejects. The props are checked by the
 * component's own signature where it is really used; here they only have to be passed through.
 */
const DataTable = DataTableComponent as unknown as Component<Record<string, unknown>>;

interface Row {
    address: string;
    name: string;
    type: string;
    channels?: Row[];
}

const columns: DataTableColumn<Row>[] = [
    {key: 'name', label: 'Name', width: 140},
    {key: 'address', label: 'ADDRESS', width: 120, mono: true},
    {key: 'type', label: 'TYPE'},
];

function makeRows(count: number): Row[] {
    return Array.from({length: count}, (_unused, index) => ({
        address: `ADDR${String(index).padStart(5, '0')}`,
        name: `Device ${index}`,
        type: index % 2 === 0 ? 'HM-LC-Sw1' : 'HM-LC-Dim1',
        channels: [
            {
                address: `ADDR${String(index).padStart(5, '0')}:1`,
                name: `Device ${index}:1`,
                type: 'SWITCH',
            },
        ],
    }));
}

const base = {
    columns,
    getId: (row: Row) => row.address,
    height: 230,
    rowHeight: 23,
};

function rowsInDom(): HTMLElement[] {
    return screen.getAllByRole('row').filter((element) => element.dataset['rowId'] !== undefined);
}

describe('DataTable', () => {
    it('draws the headers and the rows of the window only', () => {
        render(DataTable, {props: {...base, rows: makeRows(2000)}});

        expect(screen.getByRole('columnheader', {name: /Name/})).toBeTruthy();
        const drawn = rowsInDom();
        // 230 px of body at 23 px per row plus 6 rows of overscan on both sides.
        expect(drawn.length).toBeLessThan(30);
        expect(drawn.length).toBeGreaterThan(10);
        expect(screen.getByRole('grid').getAttribute('aria-rowcount')).toBe('2000');
        expect(screen.getByText('Device 0')).toBeTruthy();
        expect(screen.queryByText('Device 500')).toBeNull();
    });

    it('renders rows further down after a scroll', async () => {
        const {container} = render(DataTable, {props: {...base, rows: makeRows(2000)}});
        const body = container.querySelector('.hmm-table-body');
        expect(body).toBeTruthy();

        Object.defineProperty(body, 'scrollTop', {value: 23 * 500, writable: true, configurable: true});
        await fireEvent.scroll(body!);

        expect(screen.getByText('Device 500')).toBeTruthy();
        expect(screen.queryByText('Device 0')).toBeNull();
    });

    it('filters per column and shows a parent whose channel matches', async () => {
        render(DataTable, {props: {...base, rows: makeRows(20), subRows: (row: Row) => row.channels ?? []}});

        await fireEvent.input(screen.getByLabelText('Filter: Name'), {target: {value: 'Device 7:1'}});
        expect(rowsInDom()).toHaveLength(1);
        expect(screen.getByText('Device 7')).toBeTruthy();
    });

    it('filters per column, as the 2.x filter toolbar did', async () => {
        render(DataTable, {props: {...base, rows: makeRows(20)}});
        await fireEvent.input(screen.getByLabelText('Filter: TYPE'), {target: {value: 'Dim'}});
        expect(rowsInDom()).toHaveLength(10);
    });

    /**
     * The tab-wide "filter everything" box is gone (task 20), but the needle behind it is still a
     * prop: the Links tab is opened pre-filtered on a channel from the Devices tab (#25), and no
     * column field means "sender or receiver".
     */
    it('still searches every filterable column when a filter is set from outside', () => {
        render(DataTable, {props: {...base, rows: makeRows(20), filter: 'HM-LC-Dim1'}});
        expect(rowsInDom()).toHaveLength(10);
        expect(screen.queryByLabelText('Filter')).toBeNull();
    });

    it('sorts ascending, descending and back to unsorted', async () => {
        render(DataTable, {props: {...base, rows: makeRows(5)}});
        const header = screen.getByRole('columnheader', {name: /Name/});
        const button = within(header).getByRole('button');

        await fireEvent.click(button);
        expect(header.getAttribute('aria-sort')).toBe('ascending');
        expect(rowsInDom()[0]?.textContent).toContain('Device 0');

        await fireEvent.click(button);
        expect(header.getAttribute('aria-sort')).toBe('descending');
        expect(rowsInDom()[0]?.textContent).toContain('Device 4');

        await fireEvent.click(button);
        expect(header.getAttribute('aria-sort')).toBe('none');
    });

    it('expands a row into its sub-rows and collapses it again', async () => {
        render(DataTable, {props: {...base, rows: makeRows(3), subRows: (row: Row) => row.channels ?? []}});
        expect(rowsInDom()).toHaveLength(3);

        const expander = screen.getAllByRole('button', {name: 'Expand row'})[0];
        await fireEvent.click(expander!);
        expect(rowsInDom()).toHaveLength(4);
        expect(screen.getByText('Device 0:1')).toBeTruthy();

        await fireEvent.click(screen.getByRole('button', {name: 'Collapse row'}));
        expect(rowsInDom()).toHaveLength(3);
    });

    it('selects single, with ctrl and with shift', async () => {
        render(DataTable, {props: {...base, rows: makeRows(5)}});
        const rows = rowsInDom();

        await fireEvent.click(rows[1]!);
        expect(rows[1]?.getAttribute('aria-selected')).toBe('true');

        await fireEvent.click(rows[3]!, {ctrlKey: true});
        expect(rowsInDom().filter((row) => row.getAttribute('aria-selected') === 'true')).toHaveLength(2);

        await fireEvent.click(rows[0]!, {shiftKey: true});
        expect(rowsInDom().filter((row) => row.getAttribute('aria-selected') === 'true')).toHaveLength(4);

        await fireEvent.click(rows[2]!);
        expect(rowsInDom().filter((row) => row.getAttribute('aria-selected') === 'true')).toHaveLength(1);
    });

    it('moves the selection with the keyboard and activates with Enter', async () => {
        const onactivate = vi.fn();
        render(DataTable, {props: {...base, rows: makeRows(5), onactivate}});
        const grid = screen.getByRole('grid');

        await fireEvent.keyDown(grid, {key: 'ArrowDown'});
        expect(rowsInDom()[1]?.getAttribute('aria-selected')).toBe('true');

        await fireEvent.keyDown(grid, {key: 'ArrowDown', shiftKey: true});
        expect(rowsInDom().filter((row) => row.getAttribute('aria-selected') === 'true')).toHaveLength(2);

        await fireEvent.keyDown(grid, {key: 'End'});
        expect(rowsInDom().at(-1)?.getAttribute('aria-selected')).toBe('true');

        await fireEvent.keyDown(grid, {key: 'Home'});
        expect(rowsInDom()[0]?.getAttribute('aria-selected')).toBe('true');

        await fireEvent.keyDown(grid, {key: 'Enter'});
        expect(onactivate).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({address: 'ADDR00000'}));

        await fireEvent.keyDown(grid, {key: ' '});
        expect(rowsInDom()[0]?.getAttribute('aria-selected')).toBe('false');

        await fireEvent.keyDown(grid, {key: 'x'});
    });

    it('expands and collapses with the arrow keys', async () => {
        render(DataTable, {props: {...base, rows: makeRows(3), subRows: (row: Row) => row.channels ?? []}});
        const grid = screen.getByRole('grid');

        await fireEvent.keyDown(grid, {key: 'ArrowRight'});
        expect(rowsInDom()).toHaveLength(4);
        await fireEvent.keyDown(grid, {key: 'ArrowRight'});
        expect(rowsInDom()).toHaveLength(4);
        await fireEvent.keyDown(grid, {key: 'ArrowLeft'});
        expect(rowsInDom()).toHaveLength(3);
        await fireEvent.keyDown(grid, {key: 'ArrowLeft'});
        expect(rowsInDom()).toHaveLength(3);
    });

    it('activates on a double click', async () => {
        const onactivate = vi.fn();
        render(DataTable, {props: {...base, rows: makeRows(3), onactivate}});
        await fireEvent.dblClick(rowsInDom()[2]!);
        expect(onactivate).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({address: 'ADDR00002'}));
    });

    it('offers a context menu hook and selects the row it was opened on', async () => {
        const onrowcontextmenu = vi.fn();
        render(DataTable, {props: {...base, rows: makeRows(3), onrowcontextmenu}});

        await fireEvent.contextMenu(rowsInDom()[1]!);
        expect(onrowcontextmenu).toHaveBeenCalledOnce();
        expect(rowsInDom()[1]?.getAttribute('aria-selected')).toBe('true');

        // A right click inside an existing selection keeps it, so "delete these five" works.
        await fireEvent.contextMenu(rowsInDom()[1]!);
        expect(onrowcontextmenu).toHaveBeenCalledTimes(2);
    });

    it('ignores a right click when nobody wants it', async () => {
        render(DataTable, {props: {...base, rows: makeRows(3)}});
        await fireEvent.contextMenu(rowsInDom()[1]!);
        expect(rowsInDom()[1]?.getAttribute('aria-selected')).toBe('false');
    });

    it('shows the caption, the count and the empty text', () => {
        render(DataTable, {
            props: {...base, rows: [], caption: 'Geräte', countText: 'Showing 0 of 0', emptyText: 'Keine Daten'},
        });
        expect(screen.getByText('Geräte')).toBeTruthy();
        expect(screen.getByText('Showing 0 of 0')).toBeTruthy();
        expect(screen.getByText('Keine Daten')).toBeTruthy();
        expect(rowsInDom()).toHaveLength(0);
    });

    it('can hide the column filter row and a column', () => {
        const {container} = render(DataTable, {
            props: {
                ...base,
                columns: [...columns, {key: 'secret', label: 'Secret', hidden: true}],
                rows: makeRows(2),
                columnFilterRow: false,
                caption: undefined,
            },
        });
        expect(container.querySelector('.hmm-table-filters')).toBeNull();
        expect(screen.queryByLabelText('Filter: TYPE')).toBeNull();
        expect(screen.queryByRole('columnheader', {name: 'Secret'})).toBeNull();
    });

    /**
     * Task 20, after the maintainer's correction: the per-column fields are what a table filters
     * with, and the single "filter everything" box above them is gone. So every input a table draws
     * belongs to a column, and there is none in the header band.
     */
    it('draws one filter field per filterable column and no box above them', () => {
        const {container} = render(DataTable, {props: {...base, rows: makeRows(5), caption: 'Geräte'}});
        expect(container.querySelector('.hmm-table-band input')).toBeNull();
        expect(container.querySelectorAll('.hmm-table-filters input')).toHaveLength(columns.length);
        expect(container.querySelectorAll('input')).toHaveLength(columns.length);
        expect(screen.getByLabelText('Filter: TYPE')).toBeTruthy();
    });

    it('measures its body when no height is given', () => {
        const {container} = render(DataTable, {props: {...base, height: undefined, rows: makeRows(4)}});
        expect(container.querySelector('.hmm-table-body')).toBeTruthy();
        expect(rowsInDom().length).toBeGreaterThan(0);
    });

    it('renders a custom cell snippet where the caller supplies one', () => {
        // The devices grid draws the firmware update button and the icon this way; the snippet is
        // exercised through the Devices page test, here only the default path is asserted.
        render(DataTable, {props: {...base, rows: makeRows(1)}});
        expect(screen.getByText('HM-LC-Sw1')).toBeTruthy();
    });
});

describe('the channel sub-grid', () => {
    const subColumns: DataTableColumn<Row>[] = [
        {key: 'address', label: 'ADDRESS', width: 120, mono: true},
        {key: 'type', label: 'CHANNEL TYPE'},
    ];

    it('draws the sub-rows with their own columns under their own label row', async () => {
        render(DataTable, {props: {...base, rows: makeRows(1), subRows: (row: Row) => row.channels ?? [], subColumns}});

        await fireEvent.click(screen.getByRole('button', {name: 'Expand row'}));

        const rows = rowsInDom();
        expect(rows[1]?.dataset['rowKind']).toBe('header');
        expect(within(rows[1]!).getByText('CHANNEL TYPE')).toBeTruthy();
        expect(rows[2]?.dataset['rowId']).toBe('ADDR00000:1');
        // The channel row has the two sub-columns, not the three device ones.
        expect(rows[2]?.querySelectorAll('[role="gridcell"]')).toHaveLength(2);
        expect(within(rows[2]!).getByText('SWITCH')).toBeTruthy();
    });

    it('does not select the label row, and does not activate on a double click', async () => {
        const onactivate = vi.fn();
        render(DataTable, {
            props: {...base, rows: makeRows(1), subRows: (row: Row) => row.channels ?? [], subColumns, onactivate},
        });
        await fireEvent.click(screen.getByRole('button', {name: 'Expand row'}));

        const header = rowsInDom()[1]!;
        await fireEvent.click(header);
        await fireEvent.dblClick(header);

        expect(header.classList.contains('hmm-tr-selected')).toBe(false);
        expect(onactivate).not.toHaveBeenCalled();
    });
});

/**
 * D-34, after the maintainer's first look: "table columns are not regularly sized when the channel
 * sub-grid is expanded". The whole table is drawn on one set of tracks now, so this measures
 * pixels rather than class names - which is what browser mode is for. jsdom has no layout and
 * reports every box as zero, so the file skips these there rather than asserting nothing.
 */
const hasLayout = document.body.getBoundingClientRect().width > 0;

describe('the group header row', () => {
    const grouped: DataTableColumn<Row>[] = [
        ...columns,
        {key: 'rx:A', label: '← dBm', width: 60, filterable: false},
        {key: 'tx:A', label: '→ dBm', width: 60, filterable: false},
    ];

    it('draws one cell per group over the columns it spans, with the second line', () => {
        render(DataTable, {
            props: {
                ...base,
                columns: grouped,
                rows: makeRows(3),
                columnGroups: [
                    {key: 'A', label: 'PEQ1098001', sublabel: '(CCU2-Coprocessor)', columns: ['rx:A', 'tx:A']},
                ],
                testId: 'grid',
            },
        });
        const cell = screen.getByTestId('grid-group-A');
        expect(cell.textContent).toContain('PEQ1098001');
        expect(cell.textContent).toContain('(CCU2-Coprocessor)');
        expect(cell.getAttribute('aria-colspan')).toBe('2');
        // no expander here: Name, ADDRESS, TYPE are tracks 1-3, the pair sits on 4 and 5
        expect(cell.style.gridColumn).toBe('4 / 6');
    });

    it('draws no group row without groups', () => {
        render(DataTable, {props: {...base, rows: makeRows(3), testId: 'grid'}});
        expect(document.querySelector('.hmm-table-groups')).toBeNull();
    });
});

describe('filters and the scope (BUGS.md B-1)', () => {
    it('says how many rows the filter leaves and offers to clear it when it leaves none', async () => {
        render(DataTable, {
            props: {
                ...base,
                rows: makeRows(31),
                countText: '31 devices',
                showingText: (shown: number, total: number) => `Showing ${String(shown)} of ${String(total)}`,
                noMatchText: 'Nothing matches',
                clearFilterLabel: 'Clear',
                emptyText: 'No devices at all',
                testId: 'grid',
            },
        });
        expect(screen.getByTestId('grid-count').textContent).toBe('31 devices');

        const address = screen.getByLabelText('Filter: ADDRESS');
        await fireEvent.input(address, {target: {value: 'ADDR0000'}});
        expect(screen.getByTestId('grid-count').textContent).toBe('Showing 10 of 31');

        await fireEvent.input(address, {target: {value: 'LEQ'}});
        expect(screen.getByTestId('grid-count').textContent).toBe('Showing 0 of 31');
        expect(screen.getByText('Nothing matches')).toBeTruthy();
        expect(screen.queryByText('No devices at all')).toBeNull();

        await fireEvent.click(screen.getByTestId('grid-clear-filter'));
        expect(screen.getByTestId('grid-count').textContent).toBe('31 devices');
        expect((address as HTMLInputElement).value).toBe('');
        expect(rowsInDom().length).toBeGreaterThan(5);
    });

    it('clears the column filters when the scope changes', async () => {
        const {rerender} = render(DataTable, {
            props: {...base, rows: makeRows(31), scope: 'BidCos-RF', testId: 'grid'},
        });
        await fireEvent.input(screen.getByLabelText('Filter: ADDRESS'), {target: {value: 'LEQ'}});
        expect(rowsInDom()).toHaveLength(0);

        await rerender({...base, rows: makeRows(5), scope: 'VirtualDevices', testId: 'grid'});
        expect(rowsInDom()).toHaveLength(5);
        expect((screen.getByLabelText('Filter: ADDRESS') as HTMLInputElement).value).toBe('');
    });
});

/**
 * Issue #148: the receiver marker of the Funk grid is a 22 px button in a track that was 30 px
 * wide, so the cell overflowed and the browser drew the ellipsis of `text-overflow` behind every
 * marker - "ein überflüssiger Punkt in der Ansicht", in every row. A fixed column carries a
 * picture, a glyph or a control and has nothing to abbreviate, so its cells clip.
 */
describe('cells of a fixed column (#148)', () => {
    it('marks them so that they do not abbreviate', () => {
        const withIcon: DataTableColumn<Row>[] = [
            {key: 'icon', label: '', width: 32, fixed: true, sortable: false, filterable: false, value: () => '◉'},
            ...columns,
        ];
        render(DataTable, {props: {...base, columns: withIcon, rows: makeRows(3)}});

        const cells = [...rowsInDom()[0]!.querySelectorAll('[role="gridcell"]')];
        expect(cells[0]!.classList.contains('hmm-td-fixed')).toBe(true);
        expect(cells[1]!.classList.contains('hmm-td-fixed')).toBe(false);
    });
});

describe('column tracks at 1280 px', () => {
    const deviceColumns: DataTableColumn<Row>[] = [
        {key: 'icon', label: '', width: 24, fixed: true, sortable: false, filterable: false, value: () => ''},
        {key: 'name', label: 'Name', width: 200},
        {key: 'address', label: 'ADDRESS', width: 160, mono: true},
        {key: 'type', label: 'TYPE', width: 150},
    ];
    const channelColumns: DataTableColumn<Row>[] = [
        {key: 'name', label: 'Name', width: 200},
        {key: 'address', label: 'ADDRESS', width: 160, mono: true},
        {key: 'direction', label: 'DIRECTION', width: 110},
    ];

    /** Left edge of every header cell, expander included, in order. */
    function headerXs(): number[] {
        return screen.getAllByRole('columnheader').map((cell) => Math.round(cell.getBoundingClientRect().left));
    }

    function cellXs(row: HTMLElement): number[] {
        return [...row.querySelectorAll('[role="gridcell"]')].map((cell) =>
            Math.round(cell.getBoundingClientRect().left),
        );
    }

    function renderTable(): HTMLElement {
        render(DataTable, {
            props: {
                ...base,
                columns: deviceColumns,
                subColumns: channelColumns,
                subRows: (row: Row) => row.channels ?? [],
                rows: makeRows(40),
            },
        });
        const table = document.querySelector<HTMLElement>('.hmm-table')!;
        // Pinned rather than inherited: the assertion is about the layout, not about whatever size
        // the test runner gives its iframe.
        table.style.width = '1280px';
        return table;
    }

    it.skipIf(!hasLayout)('does not move a device column when a device is expanded', async () => {
        renderTable();
        const before = headerXs();
        const deviceBefore = cellXs(rowsInDom()[0]!);
        expect(before).toHaveLength(5);

        await fireEvent.click(screen.getAllByRole('button', {name: 'Expand row'})[0]!);

        expect(headerXs()).toEqual(before);
        expect(cellXs(rowsInDom()[0]!)).toEqual(deviceBefore);
    });

    it.skipIf(!hasLayout)('puts every channel column under the device column of the same name', async () => {
        renderTable();
        const header = headerXs();
        await fireEvent.click(screen.getAllByRole('button', {name: 'Expand row'})[0]!);

        const rows = rowsInDom();
        // 0 device, 1 the sub-grid's label row, 2 the channel.
        const labels = cellXs(rows[1]!);
        const channel = cellXs(rows[2]!);
        expect(channel).toEqual(labels);
        // Name and ADDRESS are columns both depths have: same track, same pixel.
        expect(channel[0]).toBe(header[2]);
        expect(channel[1]).toBe(header[3]);
        // DIRECTION belongs to the sub-grid alone and gets a track of its own, between ADDRESS and
        // TYPE - after the device's ADDRESS column and before its TYPE column.
        expect(channel[2]).toBeGreaterThan(header[3]!);
        expect(channel[2]).toBeLessThan(header[4]!);
    });

    it.skipIf(!hasLayout)('keeps the head over the rows although only the body scrolls', () => {
        renderTable();
        const body = document.querySelector<HTMLElement>('.hmm-table-body')!;
        // 40 rows at 23 px in a 230 px body: the body really does have a scrollbar here.
        expect(body.scrollHeight).toBeGreaterThan(body.clientHeight);
        expect(cellXs(rowsInDom()[0]!)).toEqual(headerXs().slice(1));
    });

    it.skipIf(!hasLayout)('fills the width exactly instead of scrolling sideways', () => {
        const table = renderTable();
        const body = document.querySelector<HTMLElement>('.hmm-table-body')!;
        expect(body.scrollWidth).toBeLessThanOrEqual(body.clientWidth);
        const last = screen.getAllByRole('columnheader').at(-1)!.getBoundingClientRect();
        expect(Math.round(last.right)).toBeLessThanOrEqual(Math.round(table.getBoundingClientRect().right));
    });
});

/**
 * Task 40 (#157): "in den Spalten Räume / Gewerke / RX-Mode sind die Namen teilweise abgeschnitten.
 * Es wäre schön, wenn die Spaltenbreite anpassbar wäre. Oder es erscheint ein MouseOver mit dem
 * vollständigen Inhalt des Feldes" - both, in every grid.
 */
describe('column widths and the full text of a cut-off cell (#157)', () => {
    class MemoryStorage implements StorageLike {
        readonly map = new Map<string, string>();
        getItem(key: string): string | null {
            return this.map.get(key) ?? null;
        }
        setItem(key: string, value: string): void {
            this.map.set(key, value);
        }
    }

    const LONG = 'Wohnzimmer Stehlampe neben dem Sofa am Fenster';

    const resizable: DataTableColumn<Row>[] = [
        {key: 'icon', label: '', width: 32, fixed: true, sortable: false, filterable: false, value: () => '◉'},
        ...columns,
    ];

    function rowsWithOneLongName(): Row[] {
        return makeRows(8).map((row, index) => (index === 2 ? {...row, name: LONG} : row));
    }

    function renderGrid(props: Record<string, unknown> = {}, environment?: DataTableEnvironment): HTMLElement {
        render(DataTable, {
            props: {...base, columns: resizable, rows: rowsWithOneLongName(), testId: 'grid', ...props},
            ...(environment === undefined ? {} : {context: new Map([[DATA_TABLE_KEY, environment]])}),
        });
        const table = document.querySelector<HTMLElement>('.hmm-table')!;
        table.style.width = '1280px';
        return table;
    }

    function header(name: string): HTMLElement {
        return screen.getByRole('columnheader', {name});
    }

    function widthOf(element: HTMLElement): number {
        return Math.round(element.getBoundingClientRect().width);
    }

    /** Presses the handle, moves the pointer by `dx` and lets go - a real drag, in events. */
    async function drag(key: string, dx: number): Promise<void> {
        const handle = screen.getByTestId(`grid-resize-${key}`);
        const x = handle.getBoundingClientRect().right - 2;
        await fireEvent.pointerDown(handle, {pointerId: 1, button: 0, clientX: x});
        await fireEvent.pointerMove(handle, {pointerId: 1, clientX: x + dx / 2});
        await fireEvent.pointerMove(handle, {pointerId: 1, clientX: x + dx});
        await fireEvent.pointerUp(handle, {pointerId: 1, clientX: x + dx});
    }

    it('draws a handle on every resizable column and none on a fixed one', () => {
        renderGrid();
        expect(screen.getByTestId('grid-resize-name').getAttribute('role')).toBe('separator');
        expect(screen.getByTestId('grid-resize-name').getAttribute('aria-label')).toBe('Resize column Name');
        expect(screen.getByTestId('grid-resize-type')).toBeTruthy();
        expect(screen.queryByTestId('grid-resize-icon')).toBeNull();
        // the handle's label does not become part of the header's name
        expect(header('Name')).toBeTruthy();
    });

    it.skipIf(!hasLayout)('makes a dragged column wider by as much as the pointer moved', async () => {
        renderGrid();
        const before = widthOf(header('ADDRESS'));

        await drag('address', 120);

        expect(Math.abs(widthOf(header('ADDRESS')) - (before + 120))).toBeLessThanOrEqual(2);
        // the rows follow the head: same track, same pixels
        const cell = document.querySelector<HTMLElement>('.hmm-td[data-column-key="address"]')!;
        expect(Math.abs(widthOf(cell) - widthOf(header('ADDRESS')))).toBeLessThanOrEqual(1);
    });

    it.skipIf(!hasLayout)('stops at the minimum width however far it is dragged', async () => {
        renderGrid();
        await drag('type', -2000);
        expect(widthOf(header('TYPE'))).toBe(MIN_COLUMN_WIDTH);
    });

    it.skipIf(!hasLayout)('leaves the column alone on a click without a move', async () => {
        const store = new ColumnWidthsStore(new MemoryStorage(), () => 'ccu');
        renderGrid({tableId: 'devices'}, {columnWidths: store});
        await drag('name', 1);
        expect(store.widths('devices')).toEqual({});
    });

    it.skipIf(!hasLayout)('fits a column to its widest rendered cell on a double click', async () => {
        renderGrid();
        await drag('name', -2000);
        const cells = (): HTMLElement[] => [
            ...document.querySelectorAll<HTMLElement>('.hmm-td[data-column-key="name"]'),
        ];
        expect(cells().some((cell) => cell.scrollWidth > cell.clientWidth)).toBe(true);

        await fireEvent.dblClick(screen.getByTestId('grid-resize-name'));

        const width = widthOf(header('Name'));
        expect(width).toBeGreaterThan(MIN_COLUMN_WIDTH);
        expect(width).toBeLessThan(FIT_MAX_WIDTH);
        // nothing of the column is cut off any more, and it is not wider than it has to be
        expect(cells().filter((cell) => cell.scrollWidth > cell.clientWidth)).toEqual([]);
        const longest = cells().find((cell) => cell.textContent.includes(LONG))!;
        expect(width - longest.scrollWidth).toBeLessThanOrEqual(3);
    });

    it.skipIf(!hasLayout)('caps a fit at the fit maximum', async () => {
        render(DataTable, {
            props: {
                ...base,
                columns: resizable,
                rows: [{address: 'A', name: LONG.repeat(10), type: 'x'}],
                testId: 'grid',
            },
        });
        document.querySelector<HTMLElement>('.hmm-table')!.style.width = '1280px';
        await fireEvent.dblClick(screen.getByTestId('grid-resize-name'));
        expect(widthOf(header('Name'))).toBe(FIT_MAX_WIDTH);
    });

    it.skipIf(!hasLayout)('steps a focused handle with the arrow keys and fits it with Enter', async () => {
        renderGrid();
        const handle = screen.getByTestId('grid-resize-address');
        const before = widthOf(header('ADDRESS'));

        await fireEvent.keyDown(handle, {key: 'ArrowRight'});
        await fireEvent.keyDown(handle, {key: 'ArrowRight'});
        expect(Math.abs(widthOf(header('ADDRESS')) - (before + 20))).toBeLessThanOrEqual(2);
        // the keys stayed with the handle: the grid did not move a row selection on them
        expect(rowsInDom().some((row) => row.getAttribute('aria-selected') === 'true')).toBe(false);

        await fireEvent.keyDown(handle, {key: 'Enter'});
        expect(widthOf(header('ADDRESS'))).toBeLessThan(before + 20);
    });

    it.skipIf(!hasLayout)('keeps the widths per table in the store and brings them back', async () => {
        const storage = new MemoryStorage();
        const store = new ColumnWidthsStore(storage, () => 'ccu');
        const first = render(DataTable, {
            props: {...base, columns: resizable, rows: makeRows(3), tableId: 'devices', testId: 'grid'},
            context: new Map([[DATA_TABLE_KEY, {columnWidths: store}]]),
        });
        document.querySelector<HTMLElement>('.hmm-table')!.style.width = '1280px';
        await drag('name', 90);
        const dragged = widthOf(header('Name'));
        expect(store.widths('devices')['name']).toBe(dragged);
        expect(store.widths('links')).toEqual({});
        first.unmount();

        // a new table on the same storage - a reload - and another table id that has nothing stored
        const reloaded = new ColumnWidthsStore(storage, () => 'ccu');
        render(DataTable, {
            props: {...base, columns: resizable, rows: makeRows(3), tableId: 'devices', testId: 'grid'},
            context: new Map([[DATA_TABLE_KEY, {columnWidths: reloaded}]]),
        });
        document.querySelector<HTMLElement>('.hmm-table')!.style.width = '1280px';
        expect(widthOf(header('Name'))).toBe(dragged);
    });

    it.skipIf(!hasLayout)('resets every width of the table from the menu of the column labels', async () => {
        const store = new ColumnWidthsStore(new MemoryStorage(), () => 'ccu');
        store.set('links', 'name', 300);
        renderGrid({tableId: 'devices'}, {columnWidths: store, t: (key) => `«${key}»`});
        const designed = widthOf(header('TYPE'));
        await drag('type', 150);
        expect(widthOf(header('TYPE'))).not.toBe(designed);

        await fireEvent.contextMenu(header('TYPE'));
        const menu = screen.getByTestId('grid-columns-menu');
        // the table's chrome is translated by the app it is in
        expect(within(menu).getByRole('menuitem', {name: '«Fit column to content»'})).toBeTruthy();
        await fireEvent.click(within(menu).getByRole('menuitem', {name: '«Reset column widths»'}));

        expect(store.widths('devices')).toEqual({});
        expect(store.widths('links')).toEqual({name: 300});
        expect(widthOf(header('TYPE'))).toBe(designed);
        expect(screen.queryByTestId('grid-columns-menu')).toBeNull();
    });

    it('offers no reset while nothing was resized, and no fit on a fixed column', async () => {
        renderGrid();
        await fireEvent.contextMenu(document.querySelector('.hmm-table-head [data-column-key="icon"]')!);
        const menu = screen.getByTestId('grid-columns-menu');
        expect(within(menu).getByRole('menuitem', {name: 'Reset column widths'}).hasAttribute('disabled')).toBe(true);
        expect(within(menu).getByRole('menuitem', {name: 'Fit column to content'}).hasAttribute('disabled')).toBe(true);
    });

    it.skipIf(!hasLayout)('shows the full text of a cut-off cell, and nothing for a cell that fits', async () => {
        const store = new ColumnWidthsStore(new MemoryStorage(), () => 'ccu');
        store.set('devices', 'name', 80);
        renderGrid({tableId: 'devices'}, {columnWidths: store});
        const cut = [...document.querySelectorAll<HTMLElement>('.hmm-td[data-column-key="name"]')].find((cell) =>
            cell.textContent.includes(LONG),
        )!;
        expect(cut.scrollWidth).toBeGreaterThan(cut.clientWidth);

        // The real pointer, not a synthetic event: the browser sends its own `pointerover` for
        // wherever its mouse really is as soon as the layout changes under it, and that one wins.
        await userEvent.hover(cut);
        const tip = await screen.findByRole('tooltip');
        expect(tip.textContent).toBe(LONG);
        expect(tip.dataset['testid']).toBe('grid-tooltip');

        await userEvent.unhover(cut);
        await waitFor(() => {
            expect(screen.queryByRole('tooltip')).toBeNull();
        });

        const fits = document.querySelector<HTMLElement>('.hmm-td[data-column-key="address"]')!;
        expect(fits.scrollWidth).toBeLessThanOrEqual(fits.clientWidth);
        await userEvent.hover(fits);
        await new Promise((resolve) => setTimeout(resolve, TOOLTIP_DELAY_MS + 150));
        expect(screen.queryByRole('tooltip')).toBeNull();
    });

    it.skipIf(!hasLayout)('shows the label of a cut-off column header, without the sort mark', async () => {
        const store = new ColumnWidthsStore(new MemoryStorage(), () => 'ccu');
        store.set('devices', 'address', 40);
        renderGrid({tableId: 'devices', sort: {key: 'address', direction: 'asc'}}, {columnWidths: store});

        await userEvent.hover(header('ADDRESS'));
        expect((await screen.findByRole('tooltip')).textContent).toBe('ADDRESS');
    });

    it.skipIf(!hasLayout)('has no tooltip for a fixed column, whose cells clip on purpose', async () => {
        renderGrid();
        const icon = document.querySelector<HTMLElement>('.hmm-td[data-column-key="icon"]')!;
        await userEvent.hover(icon);
        await new Promise((resolve) => setTimeout(resolve, TOOLTIP_DELAY_MS + 150));
        expect(screen.queryByRole('tooltip')).toBeNull();
    });

    it.skipIf(!hasLayout)('scrolls the head with the body once the columns are wider than the window', async () => {
        const store = new ColumnWidthsStore(new MemoryStorage(), () => 'ccu');
        store.set('devices', 'name', 1100);
        store.set('devices', 'type', 900);
        renderGrid({tableId: 'devices'}, {columnWidths: store});
        const body = document.querySelector<HTMLElement>('.hmm-table-body')!;
        expect(body.scrollWidth).toBeGreaterThan(body.clientWidth);

        body.scrollLeft = 300;
        await fireEvent.scroll(body);

        const cell = document.querySelector<HTMLElement>('.hmm-td[data-column-key="type"]')!;
        expect(Math.round(cell.getBoundingClientRect().left)).toBe(
            Math.round(header('TYPE').getBoundingClientRect().left),
        );
        // the row's box goes as far as its cells, so its background scrolls along with them
        const row = rowsInDom()[0]!;
        expect(Math.round(row.getBoundingClientRect().right)).toBeGreaterThanOrEqual(
            Math.round(cell.getBoundingClientRect().right),
        );
    });
});
