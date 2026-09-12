/**
 * "RPC console call". The console is the escape hatch of 2.7: any method of the interface process,
 * with a form generated from the method catalogue. This spec drives one read call end to end and
 * checks that the argument form really built the tuple that went on the wire.
 */

import type {Locator, Page, TestInfo} from '@playwright/test';

import {HMIP_DIMMER, expect, simulatorReady, test} from './fixtures.js';

test.beforeAll(async () => {
    test.skip(!(await simulatorReady()), 'hm-simulator is not installed');
});

async function boxOf(locator: Locator): Promise<{x: number; y: number; width: number; height: number}> {
    const box = await locator.boundingBox();
    expect(box).not.toBeNull();
    return box!;
}

/** Neither the document nor the console's own page scrolls: only the columns inside it may. */
async function expectNoPageScroll(page: Page): Promise<void> {
    const scrolls = await page.getByTestId('console-output').evaluate((column) => {
        const own = column.closest('.hmm-page');
        const root = document.scrollingElement ?? document.documentElement;
        return {
            document: root.scrollHeight > root.clientHeight,
            page: own === null ? true : own.scrollHeight > own.clientHeight,
        };
    });
    expect(scrolls).toEqual({document: false, page: false});
}

/** Light and dark, attached to the report for a human to look at - not compared (see README.md). */
async function attachThemes(page: Page, testInfo: TestInfo, name: string): Promise<void> {
    await page.emulateMedia({colorScheme: 'light'});
    await testInfo.attach(`${name}-light`, {body: await page.screenshot(), contentType: 'image/png'});
    await page.emulateMedia({colorScheme: 'dark'});
    await testInfo.attach(`${name}-dark`, {body: await page.screenshot(), contentType: 'image/png'});
    await page.emulateMedia({colorScheme: 'light'});
}

async function openConsole(page: Page, url: string): Promise<Locator> {
    await page.goto(`${url}#/HmIP-RF/console`);
    const method = page.getByTestId('console-method');
    // The list is what the interface process answered to `system.listMethods`, so it arrives late.
    await expect(method.locator('option')).not.toHaveCount(1);
    return method;
}

test('a method is chosen, its arguments filled in and the answer shown', async ({page, host}) => {
    await page.goto(`${host.url}#/HmIP-RF/console`);

    const method = page.getByTestId('console-method');
    // The list is what the interface process answered to `system.listMethods`, so it arrives late.
    await expect(method.locator('option')).not.toHaveCount(1);

    await method.selectOption('getDeviceDescription');
    await expect(page.getByTestId('arg-address')).toBeVisible();
    await page.locator('#arg-input-address').fill(HMIP_DIMMER);

    // `console-params` is an <output>: it shows the exact tuple the call will send.
    await expect(page.getByTestId('console-params')).toHaveText(`getDeviceDescription("${HMIP_DIMMER}")`);

    await page.getByTestId('console-send-button').click();

    // a <textarea>: the answer is its *value*, its text content stays the empty initial one
    await expect(page.getByTestId('console-response')).toHaveValue(/HmIP-PDT/);
    await expect(page.getByTestId('console-history').getByRole('button')).toHaveCount(1);
    await expect(page.getByTestId('console-error')).toHaveCount(0);
});

test('a fault is shown in the response and never as a toast', async ({page, host}) => {
    await page.goto(`${host.url}#/HmIP-RF/console`);
    const method = page.getByTestId('console-method');
    await expect(method.locator('option')).not.toHaveCount(1);

    await method.selectOption('getDeviceDescription');
    await page.locator('#arg-input-address').fill('NO-SUCH-DEVICE');
    await page.getByTestId('console-send-button').click();

    await expect(page.getByTestId('console-error')).toBeVisible();
    // A console call that faults is an answer, not an application error: no notice pops up.
    await expect(page.getByTestId('notices')).toBeEmpty();
});

/**
 * Task 37: the response takes the height the column has. It was a 220 px box with a 200 px history
 * under it, and everything below that stayed empty however tall the window was.
 */
for (const size of [
    {width: 1280, height: 800},
    {width: 1920, height: 1080},
]) {
    test(`the response and the history fill the column at ${String(size.width)}x${String(size.height)}`, async ({
        page,
        host,
    }, testInfo) => {
        await page.setViewportSize(size);
        const method = await openConsole(page, host.url);
        const column = page.getByTestId('console-output');
        const response = page.getByTestId('console-response');
        const history = page.getByTestId('console-history');
        const historyHeading = column.locator('h3').nth(1);

        // empty history: the list is nothing but its heading, and the response has the rest
        const emptyResponse = await boxOf(response);
        const emptyColumn = await boxOf(column);
        expect(await boxOf(history)).toMatchObject({height: 0});
        expect(Math.abs((await boxOf(history)).y - (emptyColumn.y + emptyColumn.height))).toBeLessThanOrEqual(2);
        // far more than the 220 px it used to be, on either window
        expect(emptyResponse.height).toBeGreaterThan(size.height / 2);

        // ten calls in the history; `getInstallMode` takes no argument
        await method.selectOption('getInstallMode');
        for (let call = 1; call <= 10; call += 1) {
            await page.getByTestId('console-send-button').click();
            await expect(history.getByRole('button')).toHaveCount(call);
        }

        const filled = await boxOf(response);
        const heading = await boxOf(historyHeading);
        const list = await boxOf(history);
        const bottom = await boxOf(column);
        // the response ends where the history starts, and the history ends where the column does
        expect(Math.abs(filled.y + filled.height - heading.y)).toBeLessThanOrEqual(2);
        expect(Math.abs(list.y + list.height - (bottom.y + bottom.height))).toBeLessThanOrEqual(3);
        // ten rows, well under the 200 px cap - and the response gave them the room
        expect(list.height).toBeGreaterThan(100);
        expect(list.height).toBeLessThanOrEqual(200);
        expect(filled.height).toBeLessThan(emptyResponse.height);
        expect(filled.height).toBeGreaterThan(size.height / 3);

        await expectNoPageScroll(page);
        await attachThemes(page, testInfo, `console-${String(size.width)}`);
    });
}

test('a long help text scrolls on its own and leaves the response its floor', async ({page, host}, testInfo) => {
    // hm-simulator's help texts are one line each, so the answer to `rpc.methods` gets a long one
    const LONG_HELP = Array.from({length: 120}, (_entry, index) => `Sentence ${String(index)} of the help.`).join(' ');
    await page.routeWebSocket(/\/api(\?|$)/, (socket) => {
        const server = socket.connectToServer();
        const methodRequests = new Set<number>();
        socket.onMessage((message) => {
            const frame = JSON.parse(String(message)) as {t?: string; id?: number; m?: string};
            if (frame.t === 'req' && frame.m === 'rpc.methods' && typeof frame.id === 'number') {
                methodRequests.add(frame.id);
            }
            server.send(message);
        });
        server.onMessage((message) => {
            const frame = JSON.parse(String(message)) as {t?: string; id?: number; r?: unknown};
            if (frame.t === 'res' && frame.id !== undefined && methodRequests.has(frame.id) && Array.isArray(frame.r)) {
                frame.r = (frame.r as {name: string; help?: string}[]).map((entry) =>
                    entry.name === 'getDeviceDescription' ? {...entry, help: LONG_HELP} : entry,
                );
                socket.send(JSON.stringify(frame));
                return;
            }
            socket.send(message);
        });
    });

    await page.setViewportSize({width: 1280, height: 800});
    const method = await openConsole(page, host.url);
    await method.selectOption('getDeviceDescription');
    const help = page.getByTestId('console-help-section');
    await expect(page.getByTestId('console-help')).toContainText('Sentence 119');

    // the help is capped at a quarter of the window and scrolls inside that
    expect((await boxOf(help)).height).toBeLessThanOrEqual(800 / 4 + 1);
    expect(await help.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
    // the response keeps more than its floor, and the columns end above the help
    const response = await boxOf(page.getByTestId('console-response'));
    expect(response.height).toBeGreaterThanOrEqual(120);
    const column = await boxOf(page.getByTestId('console-output'));
    expect(column.y + column.height).toBeLessThanOrEqual((await boxOf(help)).y);

    await expectNoPageScroll(page);
    await attachThemes(page, testInfo, 'console-long-help');
});
