/**
 * "Service message acknowledge". A service message is a datapoint with the SERVICE flag that is
 * set; acknowledging one writes `false` back, and only `STICKY_UNREACH` and `SABOTAGE` can be
 * acknowledged at all - `LOWBAT` and `UNREACH` are states of the device, not of the CCU's list.
 */

import {BIDCOS_SWITCH, HMIP_DIMMER, expect, simulatorReady, test} from './fixtures.js';

const MAINTENANCE = `${HMIP_DIMMER}:0`;
const BIDCOS_MAINTENANCE = `${BIDCOS_SWITCH}:0`;

test.beforeAll(async () => {
    test.skip(!(await simulatorReady()), 'hm-simulator is not installed');
});

test('a pending message is listed, acknowledged and gone', async ({page, host, sim}) => {
    await page.goto(`${host.url}#/HmIP-RF/messages`);
    await expect(page.getByTestId('messages-table')).toBeVisible();

    // The device reports it: an event from the interface process is how a service message really
    // comes into existence, and it has to reach the open page without a reload.
    sim.fireEvent('hmip', MAINTENANCE, 'STICKY_UNREACH', true);

    const row = page.locator(`[data-row-id="${MAINTENANCE}/STICKY_UNREACH"]`);
    await expect(row).toBeVisible();
    // The tab carries the count in brackets (2.7 did the same).
    await expect(page.getByRole('tab', {name: /Service messages/})).toContainText('1');

    // Refresh asks the backend for every interface - which it does by leaving the interface name
    // out. Over JSON that argument arrives as `null`, and until task 14 the backend read it as a
    // filter and answered with nothing, so this button emptied the grid.
    await page.getByTestId('messages-refresh').click();
    await expect(row).toBeVisible();

    await row.click();
    await expect(page.getByTestId('messages-ack')).toBeEnabled();
    await page.getByTestId('messages-ack').click();

    await expect(row).toHaveCount(0);
    expect(sim.getValue('hmip', MAINTENANCE, 'STICKY_UNREACH')).toBe(false);
});

/**
 * Task 36 (#150): the list stays per interface, the band counts the box. The reporter saw seven
 * messages in the CCU WebUI and four in the HMM because one of them sat on the other interface.
 */
test('the band counts the other interfaces too, and its total switches to them', async ({page, host, sim}) => {
    await page.goto(`${host.url}#/HmIP-RF/messages`);
    await expect(page.getByTestId('messages-table')).toBeVisible();

    sim.fireEvent('hmip', MAINTENANCE, 'STICKY_UNREACH', true);
    await expect(page.locator(`[data-row-id="${MAINTENANCE}/STICKY_UNREACH"]`)).toBeVisible();
    // one interface with messages: the count as it always was, and no total
    await expect(page.getByTestId('messages-table-count')).toHaveText('1 service message');
    await expect(page.getByTestId('messages-total')).toHaveCount(0);

    sim.fireEvent('rfd', BIDCOS_MAINTENANCE, 'LOWBAT', true);
    sim.fireEvent('rfd', BIDCOS_MAINTENANCE, 'UNREACH', true);
    const total = page.getByTestId('messages-total');
    await expect(total).toHaveText('1 of 3 on this box');
    await expect(page.getByTestId('messages-table-count')).toHaveCount(0);
    await expect(page.getByTestId('messages-total-tooltip')).toHaveAttribute('data-tooltip', /BidCos-RF \(2\)/);
    // the list and the tab badge stay the selected interface's
    await expect(page.locator(`[data-row-id="${BIDCOS_MAINTENANCE}/LOWBAT"]`)).toHaveCount(0);
    await expect(page.getByRole('tab', {name: /Service messages/})).toContainText('1');

    await total.click();
    await expect(page).toHaveURL(/#\/BidCos-RF\/messages$/);
    await expect(page.locator(`[data-row-id="${BIDCOS_MAINTENANCE}/LOWBAT"]`)).toBeVisible();
    await expect(page.getByTestId('messages-total')).toHaveText('2 of 3 on this box');
    await expect(page.getByRole('tab', {name: /Service messages/})).toContainText('2');
});
