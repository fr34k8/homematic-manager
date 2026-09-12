<script lang="ts">
    import {placeTooltip, type TooltipAnchor} from './tooltip.js';

    /**
     * The bubble of the app's own tooltip (#145, B-7): what `Tooltip` shows next to a toolbar
     * button, and what a grid shows next to a cell whose text is cut off (task 40, #157).
     *
     * Positioned `fixed` from the anchor's rectangle so no `overflow` of a toolbar or a table clips
     * it, below the anchor unless that runs past the bottom of the window. The caller must render it
     * outside anything with a `transform` - the grid's row window has one, and a fixed element
     * inside a transformed one is positioned against that instead of the window.
     */
    interface Props {
        text: string;
        anchor: TooltipAnchor;
        testId?: string | undefined;
    }

    let {text, anchor, testId = undefined}: Props = $props();

    let bubble = $state<HTMLSpanElement | undefined>(undefined);
    let height = $state(0);

    const position = $derived(placeTooltip(anchor, {width: window.innerWidth, height: window.innerHeight}, height));

    $effect(() => {
        // measured again whenever the text changes, because that is what changes the height
        void text;
        if (bubble) {
            height = bubble.offsetHeight;
        }
    });
</script>

<span
    class="hmm-tooltip"
    role="tooltip"
    bind:this={bubble}
    data-testid={testId}
    style:left={`${String(position.left)}px`}
    style:top={`${String(position.top)}px`}>{text}</span
>

<style>
    .hmm-tooltip {
        position: fixed;
        z-index: 1000;
        max-width: 280px;
        padding: 3px 6px;
        border: 1px solid var(--hmm-border-strong);
        border-radius: var(--hmm-radius);
        background: var(--hmm-bg);
        color: var(--hmm-fg);
        font-size: var(--hmm-font-size-small);
        font-weight: normal;
        letter-spacing: normal;
        line-height: 1.35;
        text-align: left;
        white-space: normal;
        /* an address or a type has no space to wrap at */
        overflow-wrap: anywhere;
        pointer-events: none;
        box-shadow: var(--hmm-shadow-menu);
    }
</style>
