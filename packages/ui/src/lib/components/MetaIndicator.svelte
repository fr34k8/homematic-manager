<script lang="ts">
    import type {MetaState} from '@homematic-manager/core';

    interface Props {
        /** `undefined` before a store answered at all; the indicator is then not drawn. */
        state: MetaState | undefined;
        /** The provider as the user should read it: "ReGa", "openccu-lite", "this profile". */
        providerLabel: (provider: MetaState['provider']) => string;
        reachableText?: string;
        unreachableText?: string;
        readOnlyText?: string;
        writableText?: string;
        /** `revision {revision}, {count} objects` */
        detailText?: (state: MetaState) => string;
        onclick?: (() => void) | undefined;
        testId?: string | undefined;
    }

    let {
        state,
        providerLabel,
        reachableText = 'Reachable',
        unreachableText = 'Unreachable',
        readOnlyText = 'Read-only',
        writableText = 'Writable',
        detailText = (entry: MetaState) => `${String(entry.revision)}, ${String(entry.objects)}`,
        onclick = undefined,
        testId = undefined,
    }: Props = $props();

    type Mark = 'ok' | 'readonly' | 'bad';

    const mark = $derived<Mark>(state === undefined || !state.reachable ? 'bad' : state.writable ? 'ok' : 'readonly');
    const label = $derived(state === undefined ? '' : providerLabel(state.provider));
    const title = $derived.by(() => {
        if (state === undefined) {
            return '';
        }
        const parts = [
            label,
            state.reachable ? reachableText : unreachableText,
            state.reachable ? (state.writable ? writableText : readOnlyText) : undefined,
            detailText(state),
            state.implementation,
            state.error,
        ];
        return parts.filter((part): part is string => part !== undefined && part !== '').join(' · ');
    });
</script>

<!--
    D-40, task 25: where the names, rooms and functions come from, beside the interface mark - so a
    user sees where the name in the grid came from before they wonder why renaming it did not
    change anything in the other application. One short word and one coloured dot: green when the
    store takes writes, amber when it only answers reads, red when it does not answer at all.
-->
{#if state !== undefined}
    <button
        type="button"
        class="hmm-meta hmm-meta-{mark}"
        {title}
        aria-label={title}
        data-mark={mark}
        data-provider={state.provider}
        data-testid={testId}
        onclick={() => onclick?.()}
    >
        <span class="hmm-meta-dot" aria-hidden="true"></span>
        <span class="hmm-meta-label">{label}</span>
    </button>
{/if}

<style>
    .hmm-meta {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        flex: 0 0 auto;
        height: 22px;
        padding: 0 6px;
        border: 1px solid transparent;
        border-radius: var(--hmm-radius);
        background: none;
        color: var(--hmm-fg-muted);
        font: inherit;
        font-size: var(--hmm-font-size-small);
        cursor: pointer;
        white-space: nowrap;
    }

    .hmm-meta:hover {
        background: var(--hmm-control-bg-hover);
        color: var(--hmm-fg);
    }

    .hmm-meta-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--hmm-fg-muted);
    }

    .hmm-meta-ok .hmm-meta-dot {
        background: var(--hmm-ok);
    }

    .hmm-meta-readonly .hmm-meta-dot {
        background: var(--hmm-warn);
    }

    .hmm-meta-bad .hmm-meta-dot {
        background: var(--hmm-error);
    }
</style>
