/**
 * The app's own tooltip (#145, B-7), shared by the toolbar's `Tooltip` anchor and the grid's
 * cut-off cells (task 40, #157).
 *
 * `title` hands the delay to the browser, which on macOS waited four to five seconds; so the delay
 * and the placement are ours, and they are the same wherever a tooltip appears.
 */

/** How long the pointer has to rest before a tooltip appears. */
export const TOOLTIP_DELAY_MS = 300;

/** The bubble wraps beyond this; `.hmm-tooltip` has the same `max-width`. */
export const TOOLTIP_MAX_WIDTH = 280;

/** The gap between the anchor and the bubble, and the margin kept to the window's edges. */
const GAP = 4;

export interface TooltipAnchor {
    readonly left: number;
    readonly top: number;
    readonly bottom: number;
}

export interface TooltipPlacement {
    readonly left: number;
    readonly top: number;
}

/**
 * Below the anchor and left-aligned with it, kept inside the window horizontally. When the bubble
 * is known to be `height` tall and would run past the bottom of the window, it goes above the
 * anchor instead - a grid row near the bottom edge is where that happens.
 */
export function placeTooltip(
    anchor: TooltipAnchor,
    viewport: {readonly width: number; readonly height: number},
    height = 0,
): TooltipPlacement {
    const width = Math.min(TOOLTIP_MAX_WIDTH, viewport.width - 2 * GAP);
    const left = Math.max(GAP, Math.min(anchor.left, viewport.width - width - GAP));
    const below = anchor.bottom + GAP;
    if (height > 0 && below + height > viewport.height - GAP && anchor.top - GAP - height >= GAP) {
        return {left, top: anchor.top - GAP - height};
    }
    return {left, top: below};
}
