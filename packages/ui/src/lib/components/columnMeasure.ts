/**
 * The two things the grid has to ask the browser about a cell (task 40, #157): is its text cut
 * off, and how wide would it be if it were not. Both only ever run for the cells at hand - the one
 * under the pointer, the rendered window of one column - never for every row of a table.
 */

/** Marks an element that must not count when a cell is measured - the resize handle. */
export const MEASURE_SKIP_ATTRIBUTE = 'data-measure-skip';

/**
 * Is the browser drawing an ellipsis? A cell clips (`overflow: hidden`) and does not wrap, so its
 * content is wider than its box exactly when some of it is not shown.
 */
export function isTruncated(element: HTMLElement): boolean {
    return element.scrollWidth > element.clientWidth;
}

/** The text of a cell as one line - what its tooltip says. */
export function fullText(element: HTMLElement): string {
    return (element.innerText || element.textContent || '').replace(/\s+/g, ' ').trim();
}

/**
 * The natural width of each element - its content on one line plus its own padding - in the order
 * given.
 *
 * The elements are cloned into one hidden `max-content` box inside `host`, so that the clones keep
 * the classes, the scoped styles and the inherited font of the originals while nothing clips them,
 * then measured in one layout pass and removed again before anything is painted. The originals
 * are not touched: the table does not reflow under the user's pointer.
 */
export function measureNaturalWidths(host: HTMLElement, elements: readonly HTMLElement[]): number[] {
    if (elements.length === 0) {
        return [];
    }
    const box = document.createElement('div');
    box.setAttribute('aria-hidden', 'true');
    Object.assign(box.style, {
        position: 'absolute',
        left: '0',
        top: '0',
        width: 'max-content',
        height: '0',
        overflow: 'visible',
        visibility: 'hidden',
        pointerEvents: 'none',
    });
    const clones = elements.map((element) => {
        const clone = element.cloneNode(true) as HTMLElement;
        for (const skipped of clone.querySelectorAll(`[${MEASURE_SKIP_ATTRIBUTE}]`)) {
            skipped.remove();
        }
        // a clone must never be what a test - or an assistive technology - finds
        for (const node of [clone, ...clone.querySelectorAll<HTMLElement>('[data-testid], [id]')]) {
            node.removeAttribute('data-testid');
            node.removeAttribute('id');
        }
        Object.assign(clone.style, {
            display: 'block',
            position: 'static',
            width: 'max-content',
            minWidth: '0',
            maxWidth: 'none',
            height: 'auto',
            overflow: 'visible',
        });
        box.append(clone);
        return clone;
    });
    host.append(box);
    try {
        return clones.map((clone) => clone.getBoundingClientRect().width);
    } finally {
        box.remove();
    }
}
