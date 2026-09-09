<script lang="ts">
    import type {Snippet} from 'svelte';

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
     * for that). Positioned `fixed` from the anchor's rectangle so the toolbar's own `overflow`
     * cannot clip it, and clamped to the viewport.
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

    let {text, delayMs = 300, children, testId = undefined}: Props = $props();

    let open = $state(false);
    let left = $state(0);
    let top = $state(0);
    let anchor = $state<HTMLElement | undefined>(undefined);
    let timer: ReturnType<typeof setTimeout> | undefined;

    /** Below the control, left-aligned with it, kept inside the window. */
    function place(): void {
        if (!anchor) {
            return;
        }
        const rect = anchor.getBoundingClientRect();
        const width = Math.min(280, window.innerWidth - 8);
        left = Math.max(4, Math.min(rect.left, window.innerWidth - width - 4));
        top = rect.bottom + 4;
    }

    function show(): void {
        if (text === '') {
            return;
        }
        place();
        open = true;
    }

    function schedule(): void {
        if (text === '' || open) {
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
        open = false;
    }

    $effect(() => clear);
</script>

<!--
    A span, not a button: it only listens. `focusin`/`focusout` bubble out of the control inside
    it, so the keyboard gets the tooltip without a delay, and Escape closes it the way it closes
    every other transient thing in this app.
-->
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
    {#if open}
        <span class="hmm-tooltip" role="tooltip" style:left={`${String(left)}px`} style:top={`${String(top)}px`}
            >{text}</span
        >
    {/if}
</span>

<style>
    .hmm-tooltip-anchor {
        display: inline-flex;
        align-items: center;
    }

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
        line-height: 1.35;
        white-space: normal;
        pointer-events: none;
        box-shadow: var(--hmm-shadow-menu);
    }
</style>
