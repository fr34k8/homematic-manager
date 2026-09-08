<script lang="ts">
    import {parseRef} from '@homematic-manager/core';

    import Dialog from '../../lib/components/Dialog.svelte';
    import ToolbarButton from '../../lib/components/ToolbarButton.svelte';
    import {getStores} from '../../lib/stores/context.js';
    import {canMoveUnder, TAXONOMY_IDS, type TaxonomyId} from '../../lib/util/taxonomy.js';

    interface Props {
        open?: boolean;
        /** The taxonomy the dialog opens on; the user may switch inside. */
        enumId?: TaxonomyId;
    }

    let {open = $bindable(false), enumId = 'room'}: Props = $props();

    const stores = getStores();
    const t = stores.i18n.t;

    type Mode = 'add' | 'add-below' | 'rename' | 'move' | 'delete';

    let current = $state<TaxonomyId>('room');
    let selected = $state('');
    let mode = $state<Mode | undefined>(undefined);
    let name = $state('');
    /** The target of a move: `''` is the top level. */
    let parent = $state('');
    let busy = $state(false);

    const options = $derived(stores.taxonomy.options(current));
    const selectedOption = $derived(options.find((option) => option.path === selected));
    /**
     * Rooms are a tree, so a floor is a room with rooms below it (the maintainer's clarification
     * of task 25); functions are a list in every store, and a provider whose rooms are flat says so
     * through `flat` in its state (ReGa, task 27).
     */
    const treeAllowed = $derived(current === 'room' && !stores.taxonomy.flatOnly);
    const writable = $derived(stores.taxonomy.writable);
    const members = $derived(mode === 'delete' && selected !== '' ? stores.taxonomy.members(selected) : []);
    const moveTargets = $derived(options.filter((option) => canMoveUnder(selected, option.path)));

    $effect(() => {
        if (open) {
            current = enumId;
            selected = '';
            mode = undefined;
        }
    });

    $effect(() => {
        // a node that vanished under us (deleted elsewhere, or by the delete below)
        if (selected !== '' && !options.some((option) => option.path === selected)) {
            selected = '';
            mode = undefined;
        }
    });

    function switchTo(id: TaxonomyId): void {
        current = id;
        selected = '';
        mode = undefined;
    }

    function start(next: Mode): void {
        mode = next;
        name = next === 'rename' ? (selectedOption?.label ?? '') : '';
        parent = '';
    }

    function labelOf(ref: string): string {
        const address = parseRef(ref)?.address ?? ref;
        const known = stores.names.name(address);
        return known === undefined ? address : `${known} (${address})`;
    }

    async function apply(): Promise<void> {
        if (mode === undefined) {
            return;
        }
        busy = true;
        let ok = false;
        switch (mode) {
            case 'add':
            case 'add-below': {
                const created = await stores.taxonomy.createNode(
                    current,
                    mode === 'add-below' ? selected : undefined,
                    name.trim(),
                );
                ok = created !== undefined;
                if (created !== undefined) {
                    selected = created;
                }
                break;
            }
            case 'rename':
                ok = await stores.taxonomy.renameNode(selected, name.trim());
                break;
            case 'move':
                ok = await stores.taxonomy.moveNode(selected, parent === '' ? null : parent);
                break;
            case 'delete':
                ok = await stores.taxonomy.deleteNode(selected, members.length > 0);
                if (ok) {
                    selected = '';
                }
                break;
        }
        busy = false;
        if (ok) {
            mode = undefined;
        }
    }

    async function refresh(): Promise<void> {
        busy = true;
        await stores.taxonomy.refresh();
        busy = false;
    }

    function onKey(event: KeyboardEvent): void {
        if (event.key === 'Enter') {
            void apply();
        }
    }
</script>

<!--
    The tree dialog of task 25: add, rename, move and delete on the nodes of one taxonomy, with the
    members listed before a node that has any is removed. No browser prompt anywhere - every
    question is a small form inside the dialog, and every answer is the backend's event: the list
    is drawn from the store, never from what this dialog believes it just did.
-->
<Dialog bind:open title={t('Rooms and functions')} width="600px" height="560px" testId="taxonomy-dialog">
    <div class="hmm-tax">
        <div class="hmm-tax-tabs">
            <div class="hmm-tax-tablist" role="tablist" aria-label={t('Rooms and functions')}>
                {#each TAXONOMY_IDS as id (id)}
                    <button
                        type="button"
                        class="hmm-button hmm-tax-tab"
                        class:hmm-tax-tab-active={current === id}
                        role="tab"
                        aria-selected={current === id}
                        data-testid={`taxonomy-tab-${id}`}
                        onclick={() => switchTo(id)}>{id === 'room' ? t('Rooms') : t('Functions')}</button
                    >
                {/each}
            </div>
            <!-- task 27: ReGa has no change stream, so a room made in the WebUI arrives on request -->
            <ToolbarButton
                title={t('Refresh')}
                icon="⟳"
                disabled={busy || !stores.taxonomy.available}
                testId="taxonomy-refresh"
                onclick={() => void refresh()}
            />
        </div>

        {#if current === 'room'}
            <p class="hmm-tax-hint" data-testid="taxonomy-hint">
                {stores.taxonomy.flatOnly
                    ? t('Rooms are a flat list on this system: no floors, no room below another.')
                    : t('A floor is a room with rooms below it: add one, then add rooms below it.')}
            </p>
        {/if}

        <div class="hmm-tax-list" role="listbox" aria-label={current === 'room' ? t('Rooms') : t('Functions')}>
            {#if options.length === 0}
                <p class="hmm-tax-empty">{current === 'room' ? t('No rooms yet') : t('No functions yet')}</p>
            {/if}
            {#each options as option (option.path)}
                <button
                    type="button"
                    class="hmm-tax-node"
                    class:hmm-tax-node-selected={option.path === selected}
                    role="option"
                    aria-selected={option.path === selected}
                    style={`padding-left: ${String(8 + (option.depth - 1) * 18)}px`}
                    data-testid={`taxonomy-node-${option.path}`}
                    onclick={() => {
                        selected = option.path;
                        mode = undefined;
                    }}
                >
                    <span class="hmm-tax-node-name">{option.label}</span>
                    <span class="hmm-tax-node-count">{stores.taxonomy.members(option.path).length}</span>
                </button>
            {/each}
        </div>

        <div class="hmm-tax-actions">
            <button
                type="button"
                class="hmm-button"
                disabled={!writable || busy}
                data-testid="taxonomy-add"
                onclick={() => start('add')}>{t('Add')}</button
            >
            {#if treeAllowed}
                <button
                    type="button"
                    class="hmm-button"
                    disabled={!writable || busy || selected === ''}
                    data-testid="taxonomy-add-below"
                    onclick={() => start('add-below')}>{t('Add below')}</button
                >
            {/if}
            <button
                type="button"
                class="hmm-button"
                disabled={!writable || busy || selected === ''}
                data-testid="taxonomy-rename"
                onclick={() => start('rename')}>{t('Rename')}</button
            >
            {#if treeAllowed}
                <button
                    type="button"
                    class="hmm-button"
                    disabled={!writable || busy || selected === ''}
                    data-testid="taxonomy-move"
                    onclick={() => start('move')}>{t('Move')}</button
                >
            {/if}
            <button
                type="button"
                class="hmm-button hmm-tax-danger"
                disabled={!writable || busy || selected === ''}
                data-testid="taxonomy-delete"
                onclick={() => start('delete')}>{t('Delete')}</button
            >
        </div>

        {#if mode === 'add' || mode === 'add-below' || mode === 'rename'}
            <div class="hmm-tax-form" data-testid="taxonomy-form">
                <label class="hmm-tax-form-row">
                    <span
                        >{mode === 'rename'
                            ? t('New name')
                            : mode === 'add-below'
                              ? `${t('Add below')}: ${selectedOption?.label ?? ''}`
                              : t('Name')}</span
                    >
                    <input
                        class="hmm-input hmm-tax-form-input"
                        bind:value={name}
                        aria-label={t('Name')}
                        data-testid="taxonomy-name"
                        onkeydown={onKey}
                    />
                </label>
                <button
                    type="button"
                    class="hmm-button"
                    disabled={busy || name.trim() === ''}
                    data-testid="taxonomy-apply"
                    onclick={() => void apply()}>{t('Apply')}</button
                >
                <button type="button" class="hmm-button" onclick={() => (mode = undefined)}>{t('Cancel')}</button>
            </div>
        {:else if mode === 'move'}
            <div class="hmm-tax-form" data-testid="taxonomy-form">
                <label class="hmm-tax-form-row">
                    <span>{t('Move to')}</span>
                    <select class="hmm-select hmm-tax-form-input" bind:value={parent} data-testid="taxonomy-parent">
                        <option value="">{t('Top level')}</option>
                        {#each moveTargets as option (option.path)}
                            <option value={option.path}>{' '.repeat(option.depth - 1)}{option.label}</option>
                        {/each}
                    </select>
                </label>
                <button
                    type="button"
                    class="hmm-button"
                    disabled={busy}
                    data-testid="taxonomy-apply"
                    onclick={() => void apply()}>{t('Apply')}</button
                >
                <button type="button" class="hmm-button" onclick={() => (mode = undefined)}>{t('Cancel')}</button>
            </div>
        {:else if mode === 'delete'}
            <div class="hmm-tax-form hmm-tax-form-column" data-testid="taxonomy-form">
                {#if members.length === 0}
                    <p class="hmm-tax-empty">{t('Nothing is assigned here')}</p>
                {:else}
                    <p class="hmm-tax-members-title">
                        {t('Still assigned here - the assignments are removed with the node:')}
                    </p>
                    <ul class="hmm-tax-members" data-testid="taxonomy-members">
                        {#each members as ref (ref)}
                            <li>{labelOf(ref)}</li>
                        {/each}
                    </ul>
                {/if}
                <div class="hmm-tax-form-buttons">
                    <button
                        type="button"
                        class="hmm-button hmm-tax-danger"
                        disabled={busy}
                        data-testid="taxonomy-apply"
                        onclick={() => void apply()}
                        >{members.length === 0 ? t('Delete') : t('Delete and detach')}</button
                    >
                    <button type="button" class="hmm-button" onclick={() => (mode = undefined)}>{t('Cancel')}</button>
                </div>
            </div>
        {/if}
    </div>

    {#snippet buttons()}
        <button type="button" class="hmm-button" data-testid="taxonomy-close" onclick={() => (open = false)}
            >{t('Close')}</button
        >
    {/snippet}
</Dialog>

<style>
    .hmm-tax {
        display: flex;
        flex-direction: column;
        gap: 8px;
        height: 100%;
        min-height: 0;
    }

    .hmm-tax-tabs {
        display: flex;
        align-items: center;
        justify-content: space-between;
    }

    .hmm-tax-tablist {
        display: flex;
        gap: 4px;
    }

    .hmm-tax-tab-active {
        background: var(--hmm-control-bg-hover);
        color: var(--hmm-fg);
        font-weight: 600;
    }

    .hmm-tax-hint {
        margin: 0;
        color: var(--hmm-fg-muted);
        font-size: var(--hmm-font-size-small);
    }

    .hmm-tax-list {
        flex: 1 1 auto;
        min-height: 120px;
        overflow: auto;
        border: 1px solid var(--hmm-border);
        border-radius: var(--hmm-radius);
        background: var(--hmm-control-bg);
    }

    .hmm-tax-node {
        display: flex;
        justify-content: space-between;
        align-items: center;
        width: 100%;
        padding: 3px 8px;
        border: 0;
        background: none;
        color: var(--hmm-fg);
        text-align: left;
        cursor: pointer;
        font: inherit;
    }

    .hmm-tax-node:hover {
        background: var(--hmm-control-bg-hover);
    }

    .hmm-tax-node-selected,
    .hmm-tax-node-selected:hover {
        background: var(--hmm-row-selected);
        color: var(--hmm-row-selected-text);
    }

    .hmm-tax-node-count {
        color: var(--hmm-fg-muted);
        font-size: var(--hmm-font-size-small);
        font-family: var(--hmm-font-mono);
    }

    .hmm-tax-empty {
        margin: 6px 8px;
        color: var(--hmm-fg-muted);
    }

    .hmm-tax-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
    }

    .hmm-tax-form {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 8px;
        border: 1px solid var(--hmm-border);
        border-radius: var(--hmm-radius);
    }

    .hmm-tax-form-column {
        flex-direction: column;
        align-items: stretch;
    }

    .hmm-tax-form-row {
        display: flex;
        align-items: center;
        gap: 6px;
        flex: 1 1 auto;
        min-width: 0;
    }

    .hmm-tax-form-row > span {
        white-space: nowrap;
    }

    .hmm-tax-form-input {
        flex: 1 1 auto;
        min-width: 0;
    }

    .hmm-tax-form-buttons {
        display: flex;
        gap: 6px;
    }

    .hmm-tax-members-title {
        margin: 0;
    }

    .hmm-tax-members {
        margin: 0;
        padding-left: 20px;
        max-height: 120px;
        overflow: auto;
    }

    .hmm-tax-danger {
        color: var(--hmm-error);
    }
</style>
