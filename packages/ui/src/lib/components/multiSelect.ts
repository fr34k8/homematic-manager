/** One entry of {@link MultiSelect}. */
export interface MultiSelectOption {
    readonly value: string;
    readonly label: string;
    readonly disabled?: boolean;
}

/** The entries whose label contains the filter text, case-insensitively. */
export function filterOptions(options: readonly MultiSelectOption[], filter: string): MultiSelectOption[] {
    const needle = filter.trim().toLowerCase();
    if (needle === '') {
        return [...options];
    }
    return options.filter((option) => option.label.toLowerCase().includes(needle));
}

/**
 * The index the highlight moves to: `delta` steps from `from`, skipping disabled entries and
 * stopping at the ends rather than wrapping (a long list is read top to bottom). Added for the
 * keyboard navigation openccu-lite's port of this widget needed (its task 40); one kit.
 */
export function step(options: readonly MultiSelectOption[], from: number, delta: number): number {
    for (let i = from + delta; i >= 0 && i < options.length; i += delta) {
        if (options[i]?.disabled !== true) {
            return i;
        }
    }
    return from;
}
