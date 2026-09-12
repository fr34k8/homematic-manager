<script lang="ts">
    import Tooltip from './Tooltip.svelte';

    /**
     * The main action of a tab, in its header band: an icon **and** a caption, larger than the
     * toolbar icons and in the accent colour (tasks 28 and 33, maintainer 2026-09-11/12).
     *
     * "Pair device" on the Devices tab and "Add link" on the Links tab were a bare `+` among nine
     * other icons, named only by their tooltip - the one action a new user comes to the tab for was
     * the easiest one to miss. Both tabs use this component, so the two read as the same kind of
     * thing.
     *
     * A narrow window takes the caption away before anything else in the band overflows, and the
     * button never disappears. The slot the button sits in is a flex item whose basis is the width
     * the captioned button needs (measured on a hidden copy) and whose minimum is the icon: when the
     * band has less room than that, the flex layout shrinks the slot, and the button follows with
     * its compact form. `contain: inline-size` keeps the button out of the slot's intrinsic size, so
     * the band never has to grow to make room for a caption it cannot fit - and since the slot's
     * width does not depend on which form the button is in, the two forms cannot chase each other.
     */
    interface Props {
        /** The caption, and the accessible name in both forms. */
        caption: string;
        icon?: string;
        disabled?: boolean;
        /** Why the button is disabled - shown in the tooltip, as `ToolbarButton` does (#145). */
        reason?: string | undefined;
        /** `true` icon only, `false` always captioned; left out, the space in the band decides. */
        compact?: boolean | undefined;
        onclick?: (() => void) | undefined;
        testId?: string | undefined;
    }

    let {
        caption,
        icon = '+',
        disabled = false,
        reason = undefined,
        compact = undefined,
        onclick = undefined,
        testId = undefined,
    }: Props = $props();

    let slot = $state<HTMLElement | undefined>(undefined);
    let measure = $state<HTMLElement | undefined>(undefined);
    /** What the captioned button needs, and what the band gave its slot; 0 until measured. */
    let captionedWidth = $state(0);
    let slotWidth = $state(0);

    $effect(() => {
        const box = slot;
        const copy = measure;
        if (compact !== undefined || !box || !copy) {
            return;
        }
        const update = (): void => {
            captionedWidth = Math.ceil(copy.getBoundingClientRect().width);
            slotWidth = box.getBoundingClientRect().width;
        };
        update();
        const observer = new ResizeObserver(update);
        observer.observe(box);
        observer.observe(copy);
        return () => {
            observer.disconnect();
        };
    });

    /**
     * One pixel of slack, so a sub-pixel rounding never turns a fitting caption into an icon. A slot
     * of no width at all has not been laid out yet (a tab that is still hidden, the first frame) -
     * that is no reason to drop the caption, and dropping it there flashed the icon on every mount.
     */
    const isCompact = $derived(compact ?? (captionedWidth > 0 && slotWidth > 0 && slotWidth < captionedWidth - 1));
    const tooltip = $derived(disabled && reason !== undefined ? `${caption} — ${reason}` : isCompact ? caption : '');
    const tooltipTestId = $derived(testId === undefined ? undefined : `${testId}-tooltip`);
</script>

<span
    class="hmm-primary-slot"
    bind:this={slot}
    style:flex-basis={captionedWidth > 0 ? `${String(captionedWidth)}px` : undefined}
>
    <Tooltip text={tooltip} testId={tooltipTestId}>
        <button
            type="button"
            class="hmm-primary-button"
            class:hmm-primary-compact={isCompact}
            aria-label={caption}
            data-testid={testId}
            data-compact={isCompact ? 'true' : 'false'}
            {disabled}
            onclick={() => onclick?.()}
        >
            <span class="hmm-primary-icon" aria-hidden="true">{icon}</span>
            {#if !isCompact}
                <span class="hmm-primary-caption" data-testid={testId === undefined ? undefined : `${testId}-caption`}
                    >{caption}</span
                >
            {/if}
        </button>
    </Tooltip>
    {#if compact === undefined}
        <!-- The captioned form, never seen: only its width is read. -->
        <span class="hmm-primary-button hmm-primary-measure" aria-hidden="true" bind:this={measure}>
            <span class="hmm-primary-icon">{icon}</span>
            <span class="hmm-primary-caption">{caption}</span>
        </span>
    {/if}
</span>

<style>
    /* 28 px tall where the toolbar icons are 26, and still the band's 33 px of task 20: the slot
       reaches one pixel into the band's padding above and below instead of pushing the band open. */
    .hmm-primary-slot {
        position: relative;
        display: flex;
        align-items: center;
        flex: 0 1 auto;
        min-width: 30px;
        margin-block: -1px;
        margin-right: 6px;
        contain: inline-size;
    }

    /* The accent colour is the app's one signal for "this is the action"; the pressed toolbar
       toggle uses the same token. */
    .hmm-primary-button {
        box-sizing: border-box;
        display: inline-flex;
        align-items: center;
        gap: 5px;
        height: 28px;
        min-width: 30px;
        padding: 0 11px 0 8px;
        border: 1px solid var(--hmm-accent);
        border-radius: var(--hmm-radius);
        background: var(--hmm-accent);
        color: var(--hmm-accent-fg);
        font: inherit;
        font-weight: 600;
        line-height: 1;
        white-space: nowrap;
        cursor: pointer;
    }

    .hmm-primary-button:hover:not(:disabled) {
        filter: brightness(1.12);
    }

    .hmm-primary-button:focus-visible {
        outline: 2px solid var(--hmm-focus);
        outline-offset: 1px;
    }

    /* As in `ToolbarButton`: out of the hit test, so the tooltip anchor gets the pointer and the
       reason can be read (issue 145). */
    .hmm-primary-button:disabled {
        opacity: 0.45;
        cursor: default;
        pointer-events: none;
    }

    .hmm-primary-compact {
        justify-content: center;
        width: 30px;
        padding: 0;
    }

    .hmm-primary-icon {
        font-size: 17px;
        line-height: 1;
    }

    .hmm-primary-measure {
        position: absolute;
        top: 0;
        left: 0;
        visibility: hidden;
        pointer-events: none;
    }
</style>
