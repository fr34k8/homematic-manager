import type {MessageParams} from '@homematic-manager/core';
import {getContext, hasContext, setContext} from 'svelte';

import type {ColumnWidths} from './columnWidths.js';

/**
 * What a `DataTable` takes from the app around it rather than from each page (task 40).
 *
 * Every grid of the app has the same column handles and the same header menu, so the store the
 * widths are kept in and the translation of the table's own chrome are set once, in `App.svelte`,
 * instead of being threaded through seven pages. A table rendered without it - a component test -
 * keeps its widths for as long as it lives and speaks English.
 */
export interface ColumnWidthPersistence {
    /** The widths of one table; reactive where the implementation is. */
    widths(tableId: string): ColumnWidths;
    set(tableId: string, key: string, width: number): void;
    reset(tableId: string): void;
}

export interface DataTableEnvironment {
    readonly columnWidths?: ColumnWidthPersistence | undefined;
    readonly t?: ((key: string, params?: MessageParams) => string) | undefined;
}

/** The context key; exported for a component test's `render(..., {context})`. */
export const DATA_TABLE_KEY = Symbol('homematic-manager.data-table');

export function setDataTableEnvironment(environment: DataTableEnvironment): void {
    setContext(DATA_TABLE_KEY, environment);
}

export function getDataTableEnvironment(): DataTableEnvironment | undefined {
    return hasContext(DATA_TABLE_KEY) ? getContext<DataTableEnvironment>(DATA_TABLE_KEY) : undefined;
}

/** The key itself with its placeholders filled in: what a table says outside the app. */
export function untranslated(key: string, params: MessageParams = {}): string {
    return key.replace(/\{(\w+)\}/g, (match, name: string) => {
        const value = params[name];
        return value === undefined ? match : String(value);
    });
}
