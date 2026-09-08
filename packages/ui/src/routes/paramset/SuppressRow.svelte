<script lang="ts">
    /**
     * Task 26 (openccu-lite 28.9): one service parameter of channel 0 in the MASTER dialog, where
     * the parameter itself is not in the paramset (it is a VALUES datapoint) and only its
     * suppression is edited. The same three columns as `ParameterRow`, so the rows line up under
     * the MASTER parameters: the name on the left, the "suppressed" checkbox as the control.
     */
    interface Props {
        name: string;
        suppressed: boolean;
        /** The checkbox text, translated by the dialog. */
        label: string;
        /** The one-line explanation of what suppression does, as the tooltip. */
        title?: string | undefined;
        /** Marked when the checkbox differs from what the interface reports. */
        changed?: boolean;
        onchange: (suppressed: boolean) => void;
    }

    let {name, suppressed, label, title = undefined, changed = false, onchange}: Props = $props();
</script>

<div class="hmm-param" class:hmm-param-changed={changed} data-testid={`suppress-row-${name}`}>
    <div class="hmm-param-label">
        <span>{name}</span>
        <span class="hmm-param-id">{name}</span>
    </div>

    <div class="hmm-param-control">
        <label class="hmm-param-suppress" {title}>
            <input
                type="checkbox"
                checked={suppressed}
                data-testid={`suppress-${name}`}
                onchange={(event) => onchange(event.currentTarget.checked)}
            />
            <span>{label}</span>
        </label>
    </div>

    <div class="hmm-param-meta"></div>
</div>

<style>
    /* The grid of ParameterRow, repeated: a scoped style cannot be shared, and the rows must line up. */
    .hmm-param {
        display: grid;
        grid-template-columns: 240px minmax(0, 1fr) 200px;
        gap: 8px;
        align-items: center;
        padding: 2px 4px;
        border-bottom: 1px solid var(--hmm-border-muted);
    }

    .hmm-param-changed {
        background: var(--hmm-accent-bg);
    }

    .hmm-param-label {
        display: flex;
        flex-direction: column;
        min-width: 0;
    }

    .hmm-param-id {
        font-family: var(--hmm-font-mono);
        font-size: var(--hmm-font-size-small);
        color: var(--hmm-fg-faint);
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .hmm-param-control {
        display: flex;
        align-items: center;
        gap: 6px;
        min-width: 0;
    }

    .hmm-param-suppress {
        display: flex;
        align-items: center;
        gap: 4px;
    }
</style>
