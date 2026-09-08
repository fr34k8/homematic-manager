<script lang="ts">
    import type {ServiceMessage} from '@homematic-manager/core';
    import {deviceAddress, isAcknowledgeable} from '@homematic-manager/core';

    import DataTable from '../lib/components/DataTable.svelte';
    import DeviceImage from '../lib/components/DeviceImage.svelte';
    import {ICON_COLUMN_WIDTH} from '../lib/components/metrics.js';
    import ToolbarButton from '../lib/components/ToolbarButton.svelte';
    import type {DataTableColumn} from '../lib/components/tableModel.js';
    import {getStores} from '../lib/stores/context.js';
    import {isHmipInterface} from '../lib/stores/suppression.js';
    import {serviceMessageExplanation} from '../lib/util/deviceGrid.js';
    import {formatDateTime, formatRpcValue} from '../lib/util/format.js';

    const stores = getStores();
    const t = stores.i18n.t;

    let selected = $state<string[]>([]);
    let busy = $state(false);

    const interfaceName = $derived(stores.app.selectedInterface);
    const isBidcos = $derived(stores.interfaces.typeOf(interfaceName).startsWith('BidCos'));
    /** Task 26: eQ-3's suppression exists on the HmIP interface only; the action is hidden elsewhere. */
    const hmip = $derived(!isBidcos && isHmipInterface(interfaceName, stores.interfaces.typeOf(interfaceName)));
    const messages = $derived(stores.serviceMessages.of(interfaceName));
    const acknowledgeable = $derived(stores.serviceMessages.acknowledgeable(interfaceName));
    const selectedMessages = $derived(messages.filter((message) => selected.includes(idOf(message))));
    const selectedAckable = $derived(selectedMessages.filter((message) => isAcknowledgeable(message.datapoint)));

    function idOf(message: ServiceMessage): string {
        return `${message.address}/${message.datapoint}`;
    }

    function deviceTypeOf(address: string): string {
        return stores.devices.index(interfaceName)?.get(deviceAddress(address))?.TYPE ?? '';
    }

    /** The suppressed lists of the channels in view, read once per channel (`getSuppressedServiceMessages`). */
    $effect(() => {
        if (hmip && messages.length > 0) {
            void stores.serviceMessages.loadSuppressed(interfaceName);
        }
    });

    async function suppress(message: ServiceMessage, value: boolean): Promise<void> {
        busy = true;
        const ok = await stores.serviceMessages.suppress(interfaceName, message.address, message.datapoint, value);
        busy = false;
        if (ok) {
            stores.notices.push(
                'info',
                `suppressServiceMessages ${message.address} ${message.datapoint} = ${value ? 'true' : 'false'}`,
            );
        }
    }

    const columns = $derived<DataTableColumn<ServiceMessage>[]>([
        {
            key: 'icon',
            label: '',
            width: ICON_COLUMN_WIDTH,
            fixed: true,
            sortable: false,
            filterable: false,
            align: 'center',
            value: () => '',
        },
        {key: 'name', label: t('Name'), width: 220, value: (message) => stores.nameOf(message.address)},
        {key: 'address', label: 'ADDRESS', width: 160, mono: true},
        {
            key: 'device',
            label: `${t('Device')} ADDRESS`,
            width: 140,
            mono: true,
            value: (message) => deviceAddress(message.address),
        },
        {key: 'datapoint', label: t('Message'), width: 180},
        {key: 'value', label: t('Value'), width: 90, value: (message) => formatRpcValue(message.value)},
        {
            key: 'explanation',
            label: '',
            sortable: false,
            value: (message) => {
                const key = serviceMessageExplanation(message.datapoint, !isBidcos);
                return key === undefined ? '' : t(key);
            },
        },
        {key: 'since', label: t('Since'), width: 170, value: (message) => formatDateTime(message.since)},
        ...(hmip
            ? [
                  {
                      key: 'suppress',
                      label: '',
                      width: 150,
                      fixed: true,
                      sortable: false,
                      filterable: false,
                      value: (message: ServiceMessage) =>
                          stores.serviceMessages.isSuppressed(message) ? t('suppressed') : '',
                  },
              ]
            : []),
    ]);

    async function acknowledge(list: readonly ServiceMessage[]): Promise<void> {
        busy = true;
        const done = await stores.serviceMessages.acknowledgeMany(list);
        busy = false;
        stores.notices.push('info', t('{count} service messages', {}, done));
    }
</script>

<div class="hmm-page">
    <div class="hmm-page-grid">
        <DataTable
            rows={messages}
            {columns}
            getId={idOf}
            bind:selected
            caption={t('Service messages')}
            filterLabel={t('Filter')}
            emptyText={t('No data')}
            toolbarLabel={t('Service messages')}
            countText={t('{count} service messages', {}, messages.length)}
            testId="messages-table"
        >
            {#snippet toolbar()}
                <ToolbarButton
                    title={t('Refresh')}
                    icon="⟳"
                    testId="messages-refresh"
                    onclick={() => void stores.serviceMessages.load()}
                />
                <ToolbarButton
                    title={t('Acknowledge service messages')}
                    icon="✔"
                    disabled={busy || selectedAckable.length === 0}
                    reason={t('Only STICKY_UNREACH and SABOTAGE can be acknowledged')}
                    testId="messages-ack"
                    onclick={() => void acknowledge(selectedAckable)}
                />
                <ToolbarButton
                    title={t('Acknowledge all service messages')}
                    icon="✔✔"
                    disabled={busy || acknowledgeable.length === 0}
                    reason={t('Only STICKY_UNREACH and SABOTAGE can be acknowledged')}
                    testId="messages-ack-all"
                    onclick={() => void acknowledge(acknowledgeable)}
                />
            {/snippet}

            {#snippet cell(row, column)}
                {#if column.key === 'icon'}
                    <DeviceImage
                        deviceType={deviceTypeOf(row.address)}
                        src={stores.host.deviceImageUrl(deviceTypeOf(row.address))}
                    />
                {:else if column.key === 'datapoint'}
                    <span
                        class="hmm-msg-name"
                        class:hmm-msg-ackable={isAcknowledgeable(row.datapoint)}
                        data-testid={`message-${row.address}-${row.datapoint}`}>{row.datapoint}</span
                    >
                {:else if column.key === 'suppress'}
                    {@const suppressed = stores.serviceMessages.isSuppressed(row)}
                    <!-- task 26: the suppression of this one parameter on its channel, HmIP only -->
                    <button
                        type="button"
                        class="hmm-inline-button"
                        disabled={busy}
                        title={t(
                            'A suppressed one reports a value that raises no message; the CCU shows it as inactive.',
                        )}
                        data-testid={`suppress-${row.address}-${row.datapoint}`}
                        onclick={(event) => {
                            event.stopPropagation();
                            void suppress(row, !suppressed);
                        }}>{suppressed ? t('Unsuppress') : t('Suppress')}</button
                    >
                {:else}
                    {column.value
                        ? (column.value(row) ?? '')
                        : ((row as unknown as Record<string, string>)[column.key] ?? '')}
                {/if}
            {/snippet}
        </DataTable>
    </div>
</div>

<style>
    .hmm-page {
        display: flex;
        flex-direction: column;
        gap: 6px;
        height: 100%;
        min-height: 0;
    }

    .hmm-page-grid {
        flex: 1 1 auto;
        min-height: 0;
    }

    .hmm-msg-name {
        font-family: var(--hmm-font-mono);
    }

    /* The two the CCU lets an application clear; the rest go away when their cause does. */
    .hmm-msg-ackable {
        color: var(--hmm-accent);
    }

    /* The row action of task 26, styled like the PARAMSETS buttons of the devices grid. */
    .hmm-inline-button {
        height: 18px;
        padding: 0 4px;
        border: 1px solid var(--hmm-border);
        border-radius: var(--hmm-radius);
        background: var(--hmm-control-bg);
        color: var(--hmm-fg-muted);
        cursor: pointer;
        font-size: var(--hmm-font-size-small);
        line-height: 1;
        vertical-align: middle;
    }

    .hmm-inline-button:hover:not(:disabled) {
        background: var(--hmm-control-bg-hover);
        color: var(--hmm-fg);
    }
</style>
