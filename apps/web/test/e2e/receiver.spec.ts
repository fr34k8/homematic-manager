/**
 * Two forum reports against 3.0.0-beta.5 (BUGS.md B-2 / #142 and B-1 / #143), through the whole
 * stack - browser, backend, rfd and the group process of hm-simulator: the receiver a BidCos-RF
 * device is routed through, named in the device grid and put over its Funk columns, changed
 * through the marker; and the VirtualDevices interface listing the group it counts, whatever
 * filter was typed on the interface before.
 */

import {
    BIDCOS_GATEWAY,
    BIDCOS_GATEWAY_NAME,
    BIDCOS_SWITCH,
    HEATING_GROUP,
    expect,
    simulatorReady,
    test,
} from './fixtures.js';

test.beforeAll(async () => {
    test.skip(!(await simulatorReady()), 'hm-simulator is not installed');
});

test('the device grid names the receiver, the Funk tab puts it over its columns and can change it', async ({
    page,
    host,
}) => {
    await page.goto(`${host.url}#/BidCos-RF/devices`);
    const device = page.locator(`[data-row-id="${BIDCOS_SWITCH}"]`);
    await expect(device).toBeVisible();
    // rfd says `INTERFACE: OEQ0123456`; listBidcosInterfaces describes that as HM-MOD-RPI-PCB
    await expect(page.getByTestId(`receiver-${BIDCOS_SWITCH}`)).toHaveText(BIDCOS_GATEWAY_NAME);
    await expect(device.getByLabel('ROAMING')).toHaveCount(0);

    await page.goto(`${host.url}#/BidCos-RF/rssi`);
    const group = page.getByTestId(`radio-table-group-${BIDCOS_GATEWAY}`);
    await expect(group).toContainText(BIDCOS_GATEWAY);
    await expect(group).toContainText(`(${BIDCOS_GATEWAY_NAME})`);
    const marker = page.getByTestId(`receiver-${BIDCOS_SWITCH}-${BIDCOS_GATEWAY}`);
    await expect(marker).toHaveAttribute('aria-pressed', 'true');

    // the marker opens setBidcosInterface on that gateway; roaming goes to rfd and comes back
    await marker.click();
    await expect(page.getByTestId('set-interface-current')).toHaveText(BIDCOS_GATEWAY);
    await expect(page.getByTestId(`set-interface-row-${BIDCOS_GATEWAY}`)).toHaveAttribute('aria-current', 'true');
    await page.getByTestId('set-interface-roaming').check();
    await page.getByTestId('set-interface-confirm').click();
    await expect(page.getByTestId('set-interface-dialog')).toBeHidden();

    await page.goto(`${host.url}#/BidCos-RF/devices`);
    await expect(page.getByTestId(`receiver-${BIDCOS_SWITCH}`)).toHaveText(BIDCOS_GATEWAY_NAME);
    await expect(device.getByLabel('ROAMING')).toBeVisible();
});

test('VirtualDevices lists the group it counts, and a filter typed elsewhere does not hide it', async ({
    page,
    host,
}) => {
    await page.goto(`${host.url}#/BidCos-RF/devices`);
    await expect(page.locator(`[data-row-id="${BIDCOS_SWITCH}"]`)).toBeVisible();
    // the reporter's situation: a filter typed for one interface's addresses, then a switch
    await page.getByLabel('Filter: ADDRESS').fill('LEQ');
    await expect(page.getByTestId('devices-table-count')).toHaveText('Showing 1 of 1');

    const picker = page.getByTestId('interface-select');
    await picker.getByTestId('interface-select-trigger').click();
    await picker.getByTestId('interface-item-VirtualDevices').click();

    const group = page.locator(`[data-row-id="${HEATING_GROUP}"]`);
    await expect(group).toBeVisible();
    await expect(group).toContainText('HM-CC-VG-1');
    await expect(page.getByTestId('devices-table-count')).toHaveText('1 device');
    await expect(page.getByLabel('Filter: ADDRESS')).toHaveValue('');
    // the popup's count and the grid agree
    await picker.getByTestId('interface-select-trigger').click();
    await expect(picker.getByTestId('interface-item-VirtualDevices')).toContainText('1 device');
    await picker.getByTestId('interface-item-VirtualDevices').click();

    // and a filter that leaves nothing says so instead of blaming the interface
    await page.getByLabel('Filter: ADDRESS').fill('LEQ');
    await expect(page.getByTestId('devices-table-count')).toHaveText('Showing 0 of 1');
    await expect(page.getByText('No row matches the filter')).toBeVisible();
    await page.getByTestId('devices-table-clear-filter').click();
    await expect(group).toBeVisible();
});
