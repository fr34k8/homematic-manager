/** One entry of {@link MultiSelect}. */
export interface MultiSelectOption {
    readonly value: string;
    readonly label: string;
    readonly disabled?: boolean;
    /**
     * Small, muted text after the label on the first line - the device a channel belongs to
     * (task 31). An entry with a `hint` or a `description` is drawn on two lines; one with neither
     * looks exactly as before.
     */
    readonly hint?: string | undefined;
    /** A small, muted, monospaced second line - `3: VIRTUAL_SWITCH_TRANSMITTER`. */
    readonly description?: string | undefined;
}

/**
 * The entries whose label, hint, description or value contains the filter text, case-insensitively.
 *
 * The value is searched as well because the link dialog no longer prints the address (task 31):
 * someone who works by address types part of it and still finds the channel.
 */
export function filterOptions(options: readonly MultiSelectOption[], filter: string): MultiSelectOption[] {
    const needle = filter.trim().toLowerCase();
    if (needle === '') {
        return [...options];
    }
    return options.filter((option) =>
        [option.label, option.hint, option.description, option.value].some(
            (text) => text !== undefined && text.toLowerCase().includes(needle),
        ),
    );
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
