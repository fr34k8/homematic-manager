/**
 * Task 40 (#157): resizable grid columns and the full text of a cut-off cell.
 *
 * "In den Spalten Räume / Gewerke / RX-Mode sind die Namen teilweise abgeschnitten. Es wäre schön,
 * wenn die Spaltenbreite anpassbar wäre. Oder es erscheint ein MouseOver mit dem vollständigen
 * Inhalt des Feldes." Both are in the shared `DataTable`, so the Devices tab stands in for every
 * grid here; what is driven is the real mouse on the real handle, and a real reload of the page.
 *
 * Task 42 adds what task 40 left out: the handle of a column only the channel sub-grid has, and the
 * tooltip of a cut-off cell reached with the keyboard.
 */

import type {Locator, Page} from '@playwright/test';

import {HMIP_BUTTON, HMIP_DIMMER, expect, simulatorReady, test} from './fixtures.js';

test.beforeAll(async () => {
    test.skip(!(await simulatorReady()), 'hm-simulator is not installed');
});

async function widthOf(locator: Locator): Promise<number> {
    const box = await locator.boundingBox();
    return Math.round(box?.width ?? 0);
}

/** Presses the handle, moves the mouse by `dx` in steps, as a hand would, and lets go. */
async function drag(page: Page, handle: Locator, dx: number): Promise<void> {
    const box = await handle.boundingBox();
    expect(box).not.toBeNull();
    const x = box!.x + box!.width / 2;
    const y = box!.y + box!.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + dx / 2, y, {steps: 6});
    await page.mouse.move(x + dx, y, {steps: 6});
    await page.mouse.up();
}

async function openDevices(page: Page, url: string): Promise<Locator> {
    await page.goto(`${url}#/HmIP-RF/devices`);
    const table = page.getByTestId('devices-table');
    await expect(table.locator(`[data-row-id="${HMIP_DIMMER}"]`)).toBeVisible();
    return table;
}

test('a column is dragged wider, fitted by a double click, kept over a reload and reset', async ({page, host}) => {
    let table = await openDevices(page, host.url);
    const typeHeader = (): Locator => table.getByRole('columnheader', {name: 'TYPE', exact: true});
    const handle = (): Locator => table.getByTestId('devices-table-resize-TYPE');
    const designed = await widthOf(typeHeader());

    await drag(page, handle(), 140);
    // the column is as much wider as the mouse moved; the columns nobody sized share the rest
    await expect.poll(() => widthOf(typeHeader())).toBeGreaterThanOrEqual(designed + 137);
    const dragged = await widthOf(typeHeader());
    expect(dragged).toBeLessThanOrEqual(designed + 143);

    await handle().dblclick();
    await expect.poll(() => widthOf(typeHeader())).toBeLessThan(dragged);
    const cutOff = await table
        .locator('.hmm-td[data-column-key="TYPE"]')
        .evaluateAll((cells) => cells.filter((cell) => cell.scrollWidth > cell.clientWidth).length);
    expect(cutOff).toBe(0);
    const fitted = await widthOf(typeHeader());

    await page.reload();
    table = await openDevices(page, host.url);
    await expect.poll(() => widthOf(typeHeader())).toBe(fitted);

    await typeHeader().click({button: 'right'});
    await page.getByTestId('devices-table-columns-menu').getByRole('menuitem', {name: 'Reset column widths'}).click();
    await expect.poll(() => widthOf(typeHeader())).toBe(designed);

    await page.reload();
    table = await openDevices(page, host.url);
    await expect.poll(() => widthOf(typeHeader())).toBe(designed);
});

test('a cut-off cell shows its full text on hover, a cell that fits shows nothing, in both themes', async ({
    page,
    host,
}) => {
    const table = await openDevices(page, host.url);
    await drag(page, table.getByTestId('devices-table-resize-name'), -600);

    const row = table.locator(`[data-row-id="${HMIP_BUTTON}"]`);
    const nameCell = row.locator('.hmm-td[data-column-key="name"]');
    await expect.poll(() => nameCell.evaluate((cell) => cell.scrollWidth > cell.clientWidth)).toBe(true);
    const tooltip = page.getByRole('tooltip');

    const grounds: Record<string, string> = {};
    for (const theme of ['light', 'dark'] as const) {
        await page.evaluate((value) => {
            document.documentElement.setAttribute('data-theme', value);
        }, theme);
        await nameCell.hover();
        await expect(tooltip).toHaveText('Wandtaster');
        const paint = await tooltip.evaluate((element) => {
            const style = getComputedStyle(element);
            return {background: style.backgroundColor, color: style.color};
        });
        // legible: text and ground are not the same colour
        expect(paint.color).not.toBe(paint.background);
        grounds[theme] = paint.background;

        // off the grid, and the tooltip is gone
        await page.mouse.move(1, 1);
        await expect(tooltip).toHaveCount(0);
    }
    // and the bubble follows the theme rather than keeping one colour for both
    expect(grounds['dark']).not.toBe(grounds['light']);

    const addressCell = row.locator('.hmm-td[data-column-key="ADDRESS"]');
    expect(await addressCell.evaluate((cell) => cell.scrollWidth <= cell.clientWidth)).toBe(true);
    await addressCell.hover();
    // longer than the tooltip delay: a tooltip that was going to appear has appeared by now
    await page.waitForTimeout(900);
    await expect(tooltip).toHaveCount(0);
});

test('a column only the channel sub-grid has is dragged, kept over a reload and reset on its own', async ({
    page,
    host,
}) => {
    let table = await openDevices(page, host.url);
    const typeHeader = (): Locator => table.getByRole('columnheader', {name: 'TYPE', exact: true});
    const direction = (): Locator => table.locator('.hmm-tr-subhead .hmm-td[data-column-key="DIRECTION"]');
    const channelDirection = (): Locator =>
        table.locator(`[data-row-id="${HMIP_DIMMER}:3"] .hmm-td[data-column-key="DIRECTION"]`);
    const expand = async (): Promise<void> => {
        await table.locator(`[data-row-id="${HMIP_DIMMER}"]`).getByRole('button', {name: 'Expand row'}).click();
        await expect(direction()).toHaveCount(1);
    };

    // a width in the head first, so that the sub-grid's reset can be seen to leave it alone
    await drag(page, table.getByTestId('devices-table-resize-TYPE'), 60);
    await expand();
    const typeWidth = await widthOf(typeHeader());
    const designed = await widthOf(direction());

    await drag(page, table.getByTestId('devices-table-sub-resize-DIRECTION'), 120);
    await expect.poll(() => widthOf(direction())).toBeGreaterThanOrEqual(designed + 117);
    const dragged = await widthOf(direction());
    expect(dragged).toBeLessThanOrEqual(designed + 123);
    // the channel's cell stands under its label, and the head's column kept its pixels
    expect(Math.abs((await widthOf(channelDirection())) - dragged)).toBeLessThanOrEqual(1);
    expect(await widthOf(typeHeader())).toBe(typeWidth);

    // kept like the head's widths, per profile, under the sub-grid's own table id
    const stored = await page.evaluate(
        () =>
            JSON.parse(localStorage.getItem('hmm.columnWidths') ?? '{}') as Record<
                string,
                Record<string, Record<string, number>>
            >,
    );
    const profiles = Object.values(stored);
    expect(profiles).toHaveLength(1);
    expect(profiles[0]?.['devices-channels']).toEqual({DIRECTION: dragged});
    expect(Object.keys(profiles[0]?.['devices'] ?? {})).toEqual(['TYPE']);

    await page.reload();
    table = await openDevices(page, host.url);
    await expand();
    await expect.poll(() => widthOf(direction())).toBe(dragged);

    await direction().click({button: 'right'});
    await page.getByTestId('devices-table-columns-menu').getByRole('menuitem', {name: 'Reset column widths'}).click();
    await expect.poll(() => widthOf(direction())).toBe(designed);
    expect(await widthOf(typeHeader())).toBe(typeWidth);
});

test.describe('on a touch screen (B-29)', () => {
    test.use({hasTouch: true});

    test('a tap on the right edge of a label sorts, a drag of a finger resizes', async ({page, host}) => {
        const table = await openDevices(page, host.url);
        const typeHeader = table.getByRole('columnheader', {name: 'TYPE', exact: true});
        // the emulated touch screen is what gives the handle its finger-sized area
        expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
        const designed = await widthOf(typeHeader);
        const box = (await typeHeader.boundingBox())!;
        const y = box.y + box.height / 2;

        // 20 px in from the edge: on the label, and inside the handle's 24 px for a finger
        await page.touchscreen.tap(box.x + box.width - 20, y);
        await expect(typeHeader).toHaveAttribute('aria-sort', 'ascending');
        expect(await widthOf(typeHeader)).toBe(designed);

        // Playwright's touchscreen only taps; a drag goes through the protocol it emulates touch with
        const session = await page.context().newCDPSession(page);
        const x = box.x + box.width - 3;
        await session.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [{x, y}]});
        for (let step = 1; step <= 6; step += 1) {
            await session.send('Input.dispatchTouchEvent', {type: 'touchMove', touchPoints: [{x: x + step * 20, y}]});
        }
        await session.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
        await expect.poll(() => widthOf(typeHeader)).toBeGreaterThanOrEqual(designed + 115);
        // and the drag did not sort
        await expect(typeHeader).toHaveAttribute('aria-sort', 'ascending');
    });
});

test('Tab onto a cut-off column label shows its full text; Escape and moving on hide it', async ({page, host}) => {
    const table = await openDevices(page, host.url);
    await drag(page, table.getByTestId('devices-table-resize-ADDRESS'), -600);
    const header = table.getByRole('columnheader', {name: 'ADDRESS', exact: true});
    await expect.poll(() => header.evaluate((cell) => cell.scrollWidth > cell.clientWidth)).toBe(true);
    const tooltip = page.getByRole('tooltip');
    // the mouse off the grid, so that only the keyboard can show anything
    await page.mouse.move(1, 1);
    await expect(tooltip).toHaveCount(0);

    await table.getByTestId('devices-table-resize-name').focus();
    await page.keyboard.press('Tab');
    await expect(header.getByRole('button')).toBeFocused();
    await expect(tooltip).toHaveText('ADDRESS');

    await page.keyboard.press('Escape');
    await expect(tooltip).toHaveCount(0);

    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    await expect(tooltip).toHaveText('ADDRESS');
    // on to the column's handle, which names itself
    await page.keyboard.press('Tab');
    await expect(table.getByTestId('devices-table-resize-ADDRESS')).toBeFocused();
    await expect(tooltip).toHaveCount(0);
});
