import {clampColumnWidth, sanitizeColumnWidths, type ColumnWidths} from '../components/columnWidths.js';
import type {ColumnWidthPersistence} from '../components/dataTableContext.js';
import type {StorageLike} from './AppStore.svelte.js';

/** Task 40: where the column widths of every grid are kept. */
export const COLUMN_WIDTHS_STORAGE_KEY = 'hmm.columnWidths';

/**
 * The connection profile a width belongs to: its host, written the way the backend names the
 * profile's cache directory (`hostKey` in `packages/backend/src/config/store.ts`). 2.x kept its grid
 * state per CCU the same way, with the `_<ccuAddress>` suffix on every persisted key.
 */
export function profileKey(host: string): string {
    const key = host
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9._-]/g, '_');
    return key === '' ? 'unconfigured' : key;
}

/** profile -> table id -> column key -> pixels. */
type StoredWidths = Record<string, Record<string, Record<string, number>>>;

const NO_WIDTHS: ColumnWidths = Object.freeze({});

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Whatever is in the storage, reduced to what this store can use; nothing at all when it is garbage. */
function readStored(storage: StorageLike | undefined): StoredWidths {
    let parsed: unknown;
    try {
        const raw = storage?.getItem(COLUMN_WIDTHS_STORAGE_KEY);
        parsed = raw == null ? undefined : JSON.parse(raw);
    } catch {
        return {};
    }
    const stored: StoredWidths = {};
    if (!isRecord(parsed)) {
        return stored;
    }
    for (const [profile, tables] of Object.entries(parsed)) {
        if (!isRecord(tables)) {
            continue;
        }
        const kept: Record<string, Record<string, number>> = {};
        for (const [tableId, widths] of Object.entries(tables)) {
            const clean = sanitizeColumnWidths(widths);
            if (Object.keys(clean).length > 0) {
                kept[tableId] = clean;
            }
        }
        if (Object.keys(kept).length > 0) {
            stored[profile] = kept;
        }
    }
    return stored;
}

/**
 * The column widths a user gave the grids (task 40, #157), per connection profile and per table.
 *
 * Kept in `localStorage` next to the theme and the language choice of this browser, rather than in
 * the backend's `config.json`: `config.set` is "persist and reconnect", and a column width is a
 * property of the screen it was dragged on - the CCU addon is opened from a phone and from a
 * desktop, and one width for both would be wrong on one of them. Keyed by the profile's host, so a
 * profile switched to another CCU starts from the designed widths and gets its own back when it
 * is switched back.
 */
export class ColumnWidthsStore implements ColumnWidthPersistence {
    #stored = $state.raw<StoredWidths>({});
    readonly #storage: StorageLike | undefined;
    readonly #profile: () => string;

    /** `profile` is read on every access, so a configuration that arrives later switches the widths. */
    constructor(storage: StorageLike | undefined, profile: () => string) {
        this.#storage = storage;
        this.#profile = profile;
        this.#stored = readStored(storage);
    }

    /** The widths of one table in the current profile; empty when the user has not resized any. */
    widths(tableId: string): ColumnWidths {
        return this.#stored[this.#profile()]?.[tableId] ?? NO_WIDTHS;
    }

    set(tableId: string, key: string, width: number): void {
        const profile = this.#profile();
        const tables = this.#stored[profile] ?? {};
        const widths = tables[tableId] ?? {};
        const clamped = clampColumnWidth(width);
        if (widths[key] === clamped) {
            return;
        }
        this.#stored = {...this.#stored, [profile]: {...tables, [tableId]: {...widths, [key]: clamped}}};
        this.#write();
    }

    /** Back to the designed widths - every column of this table, in this profile only. */
    reset(tableId: string): void {
        const profile = this.#profile();
        const tables = this.#stored[profile];
        if (tables?.[tableId] === undefined) {
            return;
        }
        const rest = Object.fromEntries(Object.entries(tables).filter(([id]) => id !== tableId));
        const others = Object.fromEntries(Object.entries(this.#stored).filter(([name]) => name !== profile));
        this.#stored = Object.keys(rest).length === 0 ? others : {...others, [profile]: rest};
        this.#write();
    }

    #write(): void {
        try {
            this.#storage?.setItem(COLUMN_WIDTHS_STORAGE_KEY, JSON.stringify(this.#stored));
        } catch {
            // A full or refused storage loses the width on the next reload, and nothing else.
        }
    }
}
