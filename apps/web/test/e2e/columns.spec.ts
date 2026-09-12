/**
 * Task 40 (#157): resizable grid columns and the full text of a cut-off cell.
 *
 * "In den Spalten Räume / Gewerke / RX-Mode sind die Namen teilweise abgeschnitten. Es wäre schön,
 * wenn die Spaltenbreite anpassbar wäre. Oder es erscheint ein MouseOver mit dem vollständigen
 * Inhalt des Feldes." Both are in the shared `DataTable`, so the Devices tab stands in for every
 * grid here; what is driven is the real mouse on the real handle, and a real reload of the page.
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
