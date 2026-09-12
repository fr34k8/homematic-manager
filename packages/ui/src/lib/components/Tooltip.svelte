<script lang="ts">
    import type {Snippet} from 'svelte';

    import {TOOLTIP_DELAY_MS, type TooltipAnchor} from './tooltip.js';
    import TooltipBubble from './TooltipBubble.svelte';

    /**
     * The tooltip of the toolbar buttons (#145).
     *
     * 2.x and 3.0 up to `3.0.0-beta.8` used the `title` attribute, which hands the whole job to
     * the browser - and the browser decides when to show it. On macOS that wait was measured at
     * four to five seconds by the reporter while it is a few hundred milliseconds elsewhere, and
     * on a **disabled** button there is no tooltip at all: a disabled control dispatches no
     * pointer events, so the `reason` a button is greyed out - the one text the user needs there -
     * was exactly the one that never appeared.
     *
     * So the delay is ours: {@link delayMs} after the pointer arrives, or at once on keyboard
     * focus, and the anchor is a span around the control, which receives the pointer even when the
     * control inside it is disabled (`.hmm-toolbar-button:disabled` has `pointer-events: none`
     * for that). The bubble, its placement and its delay are shared with the grid's cut-off cells
     * (task 40, `TooltipBubble`, `tooltip.ts`).
     *
     * The text is also on the anchor as `data-tooltip`, which is what a test that only wants to
     * know *what* a control would say reads - the `title` attribute used to be that seam.
     */
    interface Props {
        /** What the tooltip says; empty means no tooltip at all. */
        text: string;
        /** How long the pointer has to rest before it appears. */
        delayMs?: number;
        children: Snippet;
        testId?: string | undefined;
    }

    let {text, delayMs = TOOLTIP_DELAY_MS, children, testId = undefined}: Props = $props();

    let rect = $state<TooltipAnchor | undefined>(undefined);
    let anchor = $state<HTMLElement | undefined>(undefined);
    let timer: ReturnType<typeof setTimeout> | undefined;

    function show(): void {
        if (text === '' || !anchor) {
            return;
        }
        const {left, top, bottom} = anchor.getBoundingClientRect();
        rect = {left, top, bottom};
    }

    function schedule(): void {
        if (text === '' || rect !== undefined) {
            return;
        }
        clear();
        timer = setTimeout(show, delayMs);
    }

    function clear(): void {
        if (timer !== undefined) {
            clearTimeout(timer);
            timer = undefined;
        }
    }

    function hide(): void {
        clear();
        rect = undefined;
    }

    $effect(() => clear);
</script>

<!--
    A span, not a button: it only listens, and it must not become a tab stop or a second control -
    the interactive thing is the button inside it, which keeps its own role and label. `focusin`/`focusout` bubble out of the control inside
    it, so the keyboard gets the tooltip without a delay, and Escape closes it the way it closes
    every other transient thing in this app.
-->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<span
    class="hmm-tooltip-anchor"
    bind:this={anchor}
    data-testid={testId}
    data-tooltip={text === '' ? undefined : text}
    onpointerenter={schedule}
    onpointerleave={hide}
    onpointerdown={hide}
    onfocusin={show}
    onfocusout={hide}
    onkeydown={(event) => {
        if (event.key === 'Escape') {
            hide();
        }
    }}
>
    {@render children()}
    {#if rect !== undefined && text !== ''}
        <TooltipBubble {text} anchor={rect} />
    {/if}
</span>

<style>
    .hmm-tooltip-anchor {
        display: inline-flex;
        align-items: center;
    }
</style>
