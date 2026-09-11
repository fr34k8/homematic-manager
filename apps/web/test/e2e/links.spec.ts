/**
 * "Links": add, edit the link paramset, remove. Three workflows in one file because they are one
 * story - a link that is not created cannot be edited, and one that is not removed leaves the next
 * test a grid that is not empty.
 *
 * The pair is the HmIP wall button (`KEY_TRANSCEIVER`, `LINK_SOURCE_ROLES: SWITCH`) and the HmIP
 * dimmer's virtual receiver (`SWITCH_VIRTUAL_RECEIVER`, `LINK_TARGET_ROLES: SWITCH`); the role
 * matrix is what decides that these two may be linked and the BidCos actor may not.
 */

import type {Locator} from '@playwright/test';

import {HMIP_BUTTON, HMIP_DIMMER, expect, simulatorReady, test} from './fixtures.js';

const SENDER = `${HMIP_BUTTON}:1`;
const RECEIVER = `${HMIP_DIMMER}:3`;
const LINK_ROW = `${SENDER}->${RECEIVER}`;

test.beforeAll(async () => {
    test.skip(!(await simulatorReady()), 'hm-simulator is not installed');
});

test('a link is created, its paramset written and the link removed again', async ({page, host, sim}) => {
    await page.goto(`${host.url}#/HmIP-RF/links`);
    await expect(page.getByTestId('links-table')).toBeVisible();
    await expect(page.locator(`[data-row-id="${LINK_ROW}"]`)).toHaveCount(0);

    /* --- add --------------------------------------------------------------------------- */

    await page.getByTestId('links-add').click();
    await expect(page.getByTestId('add-link-dialog')).toHaveAttribute('open', '');

    const senders = page.getByTestId('add-link-senders');
    const sendersToggle = senders.getByRole('button').first();
    await sendersToggle.click();
    await senders.getByRole('option', {name: new RegExp(SENDER)}).click();
    // A multi-select popup stays open after a pick, and it covers the row below it - so it has to
    // be closed before the receiver picker can be clicked at all.
    await sendersToggle.click();
    await expect(sendersToggle).toHaveAttribute('aria-expanded', 'false');

    // The receiver picker is disabled until a sender exists: the offered receivers are the ones the
    // role matrix allows for *that* sender.
    const receivers = page.getByTestId('add-link-receivers');
    const receiversToggle = receivers.getByRole('button').first();
    await receiversToggle.click();
    await receivers.getByRole('option', {name: new RegExp(RECEIVER)}).click();
    await receiversToggle.click();

    await page.getByTestId('add-link-create').click();
    await expect(page.getByTestId('add-link-dialog')).not.toHaveAttribute('open');

    await page.getByTestId('links-refresh').click();
    const row = page.locator(`[data-row-id="${LINK_ROW}"]`);
    await expect(row).toBeVisible();
    expect(sim.getLinks('hmip', [])).toHaveLength(1);

    /* --- edit -------------------------------------------------------------------------- */

    await row.click();
    await page.getByTestId('links-edit').click();
    const editor = page.getByTestId('link-paramset-dialog');
    await expect(editor).toHaveAttribute('open', '');
    await expect(page.getByTestId('param-SHORT_ON_TIME')).toBeVisible();

    await page.getByTestId('link-name').fill('Button to dimmer');
    await page.getByTestId('link-description').fill('short press');
    await page.getByTestId('link-info-save').click();

    await page.getByTestId('param-SHORT_ON_TIME').getByRole('spinbutton').fill('12');
    await page.getByTestId('link-preview').click();
    await expect(page.getByTestId('write-preview')).toHaveAttribute('open', '');
    await expect(page.getByTestId('preview-SHORT_ON_TIME')).toBeVisible();
    await page.getByTestId('write-confirm').click();
    await expect(page.getByTestId('link-results')).toBeVisible();

    // The LINK paramset of a link is stored under the peer's address, not under a paramset name.
    // The value has to arrive as the float it is: until task 19 the dialog cast it into
    // `{explicitDouble: 12}` and the backend cast that a second time into `0`, so every float in a
    // paramset write reached the interface process as zero.
    const linkWrites = sim.getWriteLog().filter((entry) => entry.values['SHORT_ON_TIME'] !== undefined);
    expect(linkWrites.length).toBeGreaterThan(0);
    expect(linkWrites.at(-1)?.values['SHORT_ON_TIME']).toBe(12);

    // The preview closes itself once the write succeeded and the read-back agrees with it; only
    // the editor underneath is left to close.
    await expect(page.getByTestId('write-preview')).not.toHaveAttribute('open');
    await editor.getByRole('button', {name: 'Close'}).first().click();
    await expect(editor).not.toHaveAttribute('open');

    /* --- remove ------------------------------------------------------------------------ */

    await row.click();
    await page.getByTestId('links-delete').click();
    const remove = page.getByTestId('remove-link-dialog');
    await expect(remove).toContainText(SENDER);
    await page.getByTestId('remove-link-confirm').click();
    await expect(remove).not.toHaveAttribute('open');

    await page.getByTestId('links-refresh').click();
    await expect(page.locator(`[data-row-id="${LINK_ROW}"]`)).toHaveCount(0);
});

/** `inner` is drawn inside `outer`, and `outer` did not have to scroll to show it. */
async function expectInside(inner: Locator, outer: Locator): Promise<void> {
    const a = await inner.boundingBox();
    const b = await outer.boundingBox();
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(a!.y).toBeGreaterThanOrEqual(b!.y - 1);
    expect(a!.y + a!.height).toBeLessThanOrEqual(b!.y + b!.height + 1);
    expect(a!.x + a!.width).toBeLessThanOrEqual(b!.x + b!.width + 1);
    expect(await outer.evaluate((element) => element.scrollHeight <= element.clientHeight)).toBe(true);
}

/**
 * Task 30: the dialog opened a few rows tall and the channel lists unfolded inside that small box.
 * At 1280x800 it is 650 px tall at least and wider than the 760 px it was, and both lists open
 * inside it; on a phone the window bounds it and the buttons stay on the screen.
 */
test('the create-link dialog is tall and wide enough for its lists, and fits a phone', async ({page, host}) => {
    await page.setViewportSize({width: 1280, height: 800});
    await page.goto(`${host.url}#/HmIP-RF/links`);
    await page.getByTestId('links-add').click();
    const dialog = page.getByTestId('add-link-dialog');
    await expect(dialog).toHaveAttribute('open', '');
    const frame = await dialog.boundingBox();
    expect(frame!.height).toBeGreaterThanOrEqual(650);
    expect(frame!.width).toBeGreaterThan(760);
    const body = dialog.locator('.hmm-dialog-body');

    const senders = page.getByTestId('add-link-senders');
    const sendersToggle = senders.getByRole('button').first();
    await sendersToggle.click();
    await expectInside(senders.locator('.hmm-multiselect-menu'), body);
    await senders.getByRole('option', {name: new RegExp(SENDER)}).click();
    await sendersToggle.click();

    const receivers = page.getByTestId('add-link-receivers');
    await receivers.getByRole('button').first().click();
    await expect(receivers.getByRole('option').first()).toBeVisible();
    await expectInside(receivers.locator('.hmm-multiselect-menu'), body);
    await receivers.getByRole('button').first().click();
    await dialog.getByRole('button', {name: 'Cancel'}).click();
    await expect(dialog).not.toHaveAttribute('open');

    await page.setViewportSize({width: 360, height: 640});
    await page.getByTestId('links-add').click();
    await expect(dialog).toHaveAttribute('open', '');
    const phone = await dialog.boundingBox();
    expect(phone!.x).toBeGreaterThanOrEqual(0);
    expect(phone!.y).toBeGreaterThanOrEqual(0);
    expect(phone!.x + phone!.width).toBeLessThanOrEqual(360);
    expect(phone!.y + phone!.height).toBeLessThanOrEqual(640);
    for (const button of await dialog.locator('.hmm-dialog-buttons button').all()) {
        const place = await button.boundingBox();
        expect(place!.x).toBeGreaterThanOrEqual(0);
        expect(place!.x + place!.width).toBeLessThanOrEqual(360);
        expect(place!.y + place!.height).toBeLessThanOrEqual(640);
    }
});

test('a sender with no possible receiver says so', async ({page, host}) => {
    await page.goto(`${host.url}#/HmIP-RF/links`);
    await page.getByTestId('links-add').click();

    const senders = page.getByTestId('add-link-senders');
    await senders.getByRole('button').first().click();
    // The dimmer's receiver channel is not a sender at all, so it is not in the list.
    await expect(senders.getByRole('option', {name: new RegExp(`${HMIP_DIMMER}:3`)})).toHaveCount(0);
    await expect(senders.getByRole('option', {name: new RegExp(SENDER)})).toHaveCount(1);
});
