import {describe, expect, it} from 'vitest';

import {
    FIT_MAX_WIDTH,
    MAX_COLUMN_WIDTH,
    MIN_COLUMN_WIDTH,
    clampColumnWidth,
    fitColumnWidth,
    isResizable,
    sanitizeColumnWidths,
} from './columnWidths.js';

/** Task 40 (#157): the arithmetic of a dragged and a fitted column. */
describe('clampColumnWidth', () => {
    it('keeps a column at least as wide as the minimum, however far it is dragged', () => {
        expect(clampColumnWidth(12)).toBe(MIN_COLUMN_WIDTH);
        expect(clampColumnWidth(-300)).toBe(MIN_COLUMN_WIDTH);
        expect(clampColumnWidth(MIN_COLUMN_WIDTH)).toBe(MIN_COLUMN_WIDTH);
    });

    it('keeps it below the maximum and in whole pixels', () => {
        expect(clampColumnWidth(99_999)).toBe(MAX_COLUMN_WIDTH);
        expect(clampColumnWidth(123.4)).toBe(123);
        expect(clampColumnWidth(123.6)).toBe(124);
    });

    it('makes the minimum of what is not a number', () => {
        expect(clampColumnWidth(Number.NaN)).toBe(MIN_COLUMN_WIDTH);
        expect(clampColumnWidth(Number.POSITIVE_INFINITY)).toBe(MIN_COLUMN_WIDTH);
    });

    it('lets a caller narrow the limits, and never lets the maximum undercut the minimum', () => {
        expect(clampColumnWidth(500, 40, 300)).toBe(300);
        expect(clampColumnWidth(10, 60, 30)).toBe(60);
    });
});

describe('fitColumnWidth', () => {
    it('is the widest measured width, rounded up so no fraction brings the ellipsis back', () => {
        expect(fitColumnWidth([61.2, 140.01, 90])).toBe(141);
    });

    it('stays between the minimum and the fit maximum', () => {
        expect(fitColumnWidth([8, 12])).toBe(MIN_COLUMN_WIDTH);
        expect(fitColumnWidth([2400])).toBe(FIT_MAX_WIDTH);
    });

    it('fits nothing when nothing was measured', () => {
        expect(fitColumnWidth([])).toBeUndefined();
        // a table that is not laid out measures every clone as zero
        expect(fitColumnWidth([0, 0, Number.NaN])).toBeUndefined();
    });
});

describe('isResizable', () => {
    it('leaves the picture, marker and control columns alone', () => {
        expect(isResizable({key: 'name', label: 'Name', width: 170})).toBe(true);
        expect(isResizable({key: 'type', label: 'TYPE'})).toBe(true);
        expect(isResizable({key: 'icon', label: '', width: 32, fixed: true})).toBe(false);
        expect(isResizable({key: 'secret', label: 'S', hidden: true})).toBe(false);
    });
});

describe('sanitizeColumnWidths', () => {
    it('keeps finite numbers, clamped, and drops everything else', () => {
        expect(sanitizeColumnWidths({name: 220, type: '90', address: 3, flags: null, rx: Number.NaN})).toEqual({
            name: 220,
            address: MIN_COLUMN_WIDTH,
        });
        expect(sanitizeColumnWidths([120])).toEqual({});
        expect(sanitizeColumnWidths('wide')).toEqual({});
        expect(sanitizeColumnWidths(null)).toEqual({});
    });
});
