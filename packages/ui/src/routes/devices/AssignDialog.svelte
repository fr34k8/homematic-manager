<script lang="ts">
    import Dialog from '../../lib/components/Dialog.svelte';
    import {getStores} from '../../lib/stores/context.js';
    import {indentedLabel, type TaxonomyId} from '../../lib/util/taxonomy.js';

    interface Props {
        open?: boolean;
        /** Which taxonomy the dialog assigns to; the title and the list follow it. */
        enumId?: TaxonomyId;
        /** The refs of the selected rows (`<interface>.<address>`). */
        refs?: readonly string[];
    }

    let {open = $bindable(false), enumId = 'room', refs = []}: Props = $props();

    const stores = getStores();
    const t = stores.i18n.t;

    let path = $state('');
    let mode = $state<'add' | 'remove'>('add');
    let saving = $state(false);

    const options = $derived(stores.taxonomy.options(enumId));
    const title = $derived(enumId === 'room' ? t('Assign to room') : t('Assign to function'));
    const emptyText = $derived(enumId === 'room' ? t('No rooms yet') : t('No functions yet'));

    $effect(() => {
        if (open) {
            mode = 'add';
            // keep a still-existing choice from the last time; the first entry otherwise
            if (!options.some((option) => option.path === path)) {
                path = options[0]?.path ?? '';
            }
        }
    });

    /**
     * One request for the whole selection: the backend makes one revision of it, and on a box a
     * consumer of the change stream sees one change rather than one per row.
     */
    async function apply(): Promise<void> {
        if (path === '' || refs.length === 0) {
            return;
        }
        saving = true;
        const ok = await stores.taxonomy.assign(refs, path, mode === 'add');
        saving = false;
        if (ok) {
            open = false;
        }
    }
</script>

<Dialog bind:open {title} width="480px" testId="assign-dialog">
    <p class="hmm-assign-count" data-testid="assign-count">{t('{count} rows selected', {}, refs.length)}</p>

    <div class="hmm-assign-mode" role="radiogroup" aria-label={title}>
        <label>
            <input type="radio" name="assign-mode" value="add" bind:group={mode} data-testid="assign-add" />
            <span>{t('Add to')}</span>
        </label>
        <label>
            <input type="radio" name="assign-mode" value="remove" bind:group={mode} data-testid="assign-remove" />
            <span>{t('Remove from')}</span>
        </label>
    </div>

    {#if options.length === 0}
        <p class="hmm-assign-empty">{emptyText}</p>
    {:else}
        <!--
            A plain select with the depth drawn as indentation: a floor is a parent node, and the
            room under it stands one step in. The `size` turns it into a list, so the tree is
            visible at a glance rather than one entry at a time.
        -->
        <select
            class="hmm-select hmm-assign-select"
            size={Math.min(12, Math.max(4, options.length))}
            bind:value={path}
            aria-label={enumId === 'room' ? t('Room') : t('Function')}
            data-testid="assign-select"
            ondblclick={() => void apply()}
        >
            {#each options as option (option.path)}
                <option value={option.path}>{indentedLabel(option, ' ')}</option>
            {/each}
        </select>
    {/if}

    {#snippet buttons()}
        <button type="button" class="hmm-button" onclick={() => (open = false)}>{t('Cancel')}</button>
        <button
            type="button"
            class="hmm-button"
            disabled={saving || path === '' || refs.length === 0}
            data-testid="assign-apply"
            onclick={() => void apply()}>{t('Apply')}</button
        >
    {/snippet}
</Dialog>

<style>
    .hmm-assign-count {
        margin: 0 0 8px;
        color: var(--hmm-fg-muted);
    }

    .hmm-assign-mode {
        display: flex;
        gap: 16px;
        margin-bottom: 8px;
    }

    .hmm-assign-mode label {
        display: flex;
        align-items: center;
        gap: 6px;
    }

    .hmm-assign-select {
        width: 100%;
        font-family: inherit;
    }

    .hmm-assign-empty {
        margin: 0;
        color: var(--hmm-fg-muted);
    }
</style>
