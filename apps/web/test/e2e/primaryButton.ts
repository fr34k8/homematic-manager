/**
 * Tasks 28 and 33: the main action of the Devices tab ("Pair device") and of the Links tab ("Add
 * link") is one captioned, larger button in the accent colour at the start of the grid's band, and
 * a narrow window shrinks it to its icon instead of losing it. Both tabs are checked the same way,
 * so the checks live here once.
 */

import type {Page} from '@playwright/test';

import {expect} from './fixtures.js';

export interface PrimaryButtonCase {
    /** The button's `data-testid`. */
    readonly testId: string;
    /** A plain toolbar icon of the same band, to compare the size and the order with. */
    readonly neighbour: string;
    /** The dialog the button opens. */
    readonly dialog: string;
    readonly captions: {readonly en: string; readonly de: string};
}

/** The colours the two tokens resolve to in the current theme. */
async function accentColours(page: Page): Promise<{background: string; text: string}> {
    return page.evaluate(() => {
        const probe = document.createElement('span');
        probe.style.background = 'var(--hmm-accent)';
        probe.style.color = 'var(--hmm-accent-fg)';
        document.body.append(probe);
        const style = getComputedStyle(probe);
        const colours = {background: style.backgroundColor, text: style.color};
        probe.remove();
        return colours;
    });
}

async function buttonColours(page: Page, testId: string): Promise<{background: string; text: string}> {
    return page.getByTestId(testId).evaluate((element) => {
        const style = getComputedStyle(element);
        return {background: style.backgroundColor, text: style.color};
    });
}

async function opensItsDialog(page: Page, item: PrimaryButtonCase): Promise<void> {
    const dialog = page.getByTestId(item.dialog);
    await page.getByTestId(item.testId).click();
    await expect(dialog).toHaveAttribute('open', '');
    // the title bar's close button: both dialogs are closable, and it says the same in both languages
    await dialog.locator('.hmm-dialog-close').click();
    await expect(dialog).not.toHaveAttribute('open');
}

/**
 * Everything the two tasks ask of the button, on a page that shows its tab: the caption in English
 * and German, larger than a toolbar icon and ahead of the icons, the accent in light and dark, the
 * dialog, and the icon-only form on a phone.
 */
export async function expectPrimaryToolbarButton(page: Page, item: PrimaryButtonCase): Promise<void> {
    await page.setViewportSize({width: 1280, height: 800});
    const button = page.getByTestId(item.testId);
    const caption = page.getByTestId(`${item.testId}-caption`);
    const neighbour = page.getByTestId(item.neighbour);

    // English, captioned, and visibly the bigger thing at the start of the band
    await expect(button).toHaveAttribute('data-compact', 'false');
    await expect(caption).toHaveText(item.captions.en);
    await expect(button.locator('.hmm-primary-icon')).toHaveText('+');
    const own = (await button.boundingBox())!;
    const icon = (await neighbour.boundingBox())!;
    expect(own.height).toBeGreaterThan(icon.height);
    expect(own.width).toBeGreaterThan(icon.width * 2);
    expect(own.x + own.width).toBeLessThanOrEqual(icon.x);
    await opensItsDialog(page, item);

    // the accent, in light and in dark, and the two differ
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
    const light = await buttonColours(page, item.testId);
    expect(light).toEqual(await accentColours(page));
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    const dark = await buttonColours(page, item.testId);
    expect(dark).toEqual(await accentColours(page));
    expect(dark.background).not.toBe(light.background);
    expect(dark.text).not.toBe(light.text);
    await expect(caption).toHaveText(item.captions.en);
    await opensItsDialog(page, item);

    // German, after a reload with the stored language
    await page.evaluate(() => {
        localStorage.setItem('hmm.language', 'de');
    });
    await page.reload();
    await expect(caption).toHaveText(item.captions.de);
    await expect(button).toHaveAttribute('aria-label', item.captions.de);

    // a phone: the shell keeps 2.x's `min-width: 1024px`, so the page scrolls sideways and the band
    // keeps its width - the button is on the screen where it was, and it still works
    await page.setViewportSize({width: 360, height: 640});
    const reachable = (await button.boundingBox())!;
    expect(reachable.x).toBeGreaterThanOrEqual(0);
    expect(reachable.x + reachable.width).toBeLessThanOrEqual(360);
    await opensItsDialog(page, item);

    // a band that really runs out of room: with that floor lifted it gets the phone's width, and the
    // caption goes before anything else - the icon stays on the screen and still works
    await page.addStyleTag({content: 'html, body, #app { min-width: 0 !important; }'});
    await expect(button).toHaveAttribute('data-compact', 'true');
    await expect(caption).toHaveCount(0);
    const phone = (await button.boundingBox())!;
    expect(phone.x).toBeGreaterThanOrEqual(0);
    expect(phone.x + phone.width).toBeLessThanOrEqual(360);
    expect(phone.width).toBeGreaterThanOrEqual(28);
    await opensItsDialog(page, item);

    // and a wide window brings the caption back
    await page.setViewportSize({width: 1280, height: 800});
    await expect(caption).toHaveText(item.captions.de);
}
