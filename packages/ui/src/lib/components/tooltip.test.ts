import {describe, expect, it} from 'vitest';

import {TOOLTIP_MAX_WIDTH, placeTooltip} from './tooltip.js';

/** The placement the toolbar's tooltip and the grid's cut-off cells share (#145, task 40). */
describe('placeTooltip', () => {
    const viewport = {width: 1280, height: 800};

    it('puts the bubble under the anchor, left-aligned with it', () => {
        expect(placeTooltip({left: 100, top: 200, bottom: 230}, viewport)).toEqual({left: 100, top: 234});
    });

    it('keeps a bubble at the right edge inside the window', () => {
        expect(placeTooltip({left: 1250, top: 200, bottom: 230}, viewport).left).toBe(1280 - TOOLTIP_MAX_WIDTH - 4);
        expect(placeTooltip({left: -20, top: 200, bottom: 230}, viewport).left).toBe(4);
    });

    it('goes above an anchor at the bottom of the window once its height is known', () => {
        expect(placeTooltip({left: 100, top: 770, bottom: 800}, viewport, 40)).toEqual({left: 100, top: 726});
        // no room above either: below, where it was
        expect(placeTooltip({left: 100, top: 20, bottom: 790}, viewport, 40).top).toBe(794);
    });
});
