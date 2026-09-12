/**
 * Task 38: callback options given at start (`HMM_CALLBACK_*`, `--callback-*`) win over the settings
 * dialog. The dialog shows them read-only with the option that set them, in both languages, and
 * the interface popup shows the callback URL each interface was given.
 *
 * Its own host per test rather than the shared fixture: the options are start options of the web
 * host, and the fixture starts it without them.
 */

import net from 'node:net';

import {startForTest, type TestHost} from 'homematic-manager';

import {expect, SIMULATOR_FIXTURE, simulatorReady, test} from './fixtures.js';

test.beforeAll(async () => {
    test.skip(!(await simulatorReady()), 'hm-simulator is not installed');
});

/** A loopback port that was free a moment ago. */
function freePort(): Promise<number> {
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const address = server.address();
            const port = typeof address === 'object' && address !== null ? address.port : 0;
            server.close(() => {
                resolve(port);
            });
        });
    });
}

async function pinnedHost(language: 'de' | 'en', xmlrpcPort: number): Promise<TestHost> {
    return startForTest({
        simulator: true,
        simulatorOptions: structuredClone(SIMULATOR_FIXTURE),
        connection: {rega: true, language},
        callbackIp: '127.0.0.1',
        callbackXmlrpcPort: xmlrpcPort,
    });
}

const HINTS = {
    en: {
        ip: 'Set at start (HMM_CALLBACK_IP / --callback-ip)',
        xmlrpc: 'Set at start (HMM_CALLBACK_XMLRPC_PORT / --callback-xmlrpc-port)',
        binrpc: '0 picks a free port',
    },
    de: {
        ip: 'Beim Start festgelegt (HMM_CALLBACK_IP / --callback-ip)',
        xmlrpc: 'Beim Start festgelegt (HMM_CALLBACK_XMLRPC_PORT / --callback-xmlrpc-port)',
        binrpc: '0 wählt einen freien Port',
    },
} as const;

for (const language of ['en', 'de'] as const) {
    test(`the callback fields set at start are read-only in the settings, with the option named (${language})`, async ({
        page,
    }) => {
        const xmlrpcPort = await freePort();
        const host = await pinnedHost(language, xmlrpcPort);
        try {
            await page.goto(host.url);
            await expect(page.getByTestId('interface-select-summary')).toHaveAttribute('data-mark', 'ok');

            // the popup names the URL the interface was told; outside a container nothing more
            await page.getByTestId('interface-select-trigger').click();
            await expect(page.getByTestId('interface-callback-HmIP-RF')).toHaveText(
                `http://127.0.0.1:${String(xmlrpcPort)}`,
            );
            await page.keyboard.press('Escape');

            await page.getByTestId('settings-button').click();
            const dialog = page.getByTestId('config-dialog');
            await expect(dialog).toBeVisible();

            const ip = dialog.getByTestId('config-callback-ip');
            const xmlrpc = dialog.getByTestId('config-callback-xmlrpc-port');
            const binrpc = dialog.getByTestId('config-callback-binrpc-port');
            await expect(ip).toBeDisabled();
            await expect(ip).toHaveValue('127.0.0.1');
            await expect(xmlrpc).toBeDisabled();
            await expect(xmlrpc).toHaveValue(String(xmlrpcPort));
            // only what was given is pinned
            await expect(binrpc).toBeEnabled();

            await expect(dialog.getByTestId('config-callback-ip-hint')).toHaveText(HINTS[language].ip);
            await expect(dialog.getByTestId('config-callback-xmlrpc-port-hint')).toHaveText(HINTS[language].xmlrpc);
            await expect(dialog.getByTestId('config-callback-binrpc-port-hint')).toHaveText(HINTS[language].binrpc);

            // and the backend reports the same, whatever the page would send
            const config = await host.backend?.request('config.get');
            expect(config?.callbackPinned).toEqual({ip: true, xmlrpcPort: true});
            expect(config?.connection.callback.xmlrpcPort).toBe(xmlrpcPort);
        } finally {
            await host.close();
        }
    });
}
