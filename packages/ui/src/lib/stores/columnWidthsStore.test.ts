import type {AppConfig} from '@homematic-manager/core';
import {describe, expect, it} from 'vitest';

import {DEMO_CONFIG} from '../transport/demoData.js';
import {MockTransport} from '../transport/MockTransport.js';

import {AppStore, type StorageLike} from './AppStore.svelte.js';
import {COLUMN_WIDTHS_STORAGE_KEY, ColumnWidthsStore, profileKey} from './ColumnWidthsStore.svelte.js';
import {NoticesStore} from './NoticesStore.svelte.js';

class MemoryStorage implements StorageLike {
    readonly map = new Map<string, string>();
    getItem(key: string): string | null {
        return this.map.get(key) ?? null;
    }
    setItem(key: string, value: string): void {
        this.map.set(key, value);
    }
}

/**
 * Task 40 (#157): the widths a user dragged are kept per table and per connection profile, survive
 * a reload, and go back to the designed ones on request.
 */
describe('ColumnWidthsStore', () => {
    it('keeps the widths of each table apart', () => {
        const store = new ColumnWidthsStore(new MemoryStorage(), () => 'ccu');
        store.set('devices', 'name', 260);
        store.set('links', 'name', 90);
        store.set('devices', 'rooms', 180);

        expect(store.widths('devices')).toEqual({name: 260, rooms: 180});
        expect(store.widths('links')).toEqual({name: 90});
        expect(store.widths('events')).toEqual({});
    });

    it('clamps what it is given', () => {
        const store = new ColumnWidthsStore(new MemoryStorage(), () => 'ccu');
        store.set('devices', 'name', 3);
        expect(store.widths('devices')).toEqual({name: 40});
    });

    it('survives a reload: a new store on the same storage has the widths', () => {
        const storage = new MemoryStorage();
        new ColumnWidthsStore(storage, () => 'ccu').set('radio', 'TYPE', 210);

        expect(new ColumnWidthsStore(storage, () => 'ccu').widths('radio')).toEqual({TYPE: 210});
        expect(JSON.parse(storage.getItem(COLUMN_WIDTHS_STORAGE_KEY)!)).toEqual({ccu: {radio: {TYPE: 210}}});
    });

    it('resets one table and leaves the others and the other profiles alone', () => {
        const storage = new MemoryStorage();
        let profile = 'ccu-a';
        const store = new ColumnWidthsStore(storage, () => profile);
        store.set('devices', 'name', 260);
        store.set('links', 'name', 90);
        profile = 'ccu-b';
        store.set('devices', 'name', 300);
        profile = 'ccu-a';

        store.reset('devices');
        expect(store.widths('devices')).toEqual({});
        expect(store.widths('links')).toEqual({name: 90});
        profile = 'ccu-b';
        expect(store.widths('devices')).toEqual({name: 300});

        store.reset('devices');
        // the last table of a profile takes the profile with it, and a second reset is a no-op
        expect(JSON.parse(storage.getItem(COLUMN_WIDTHS_STORAGE_KEY)!)).toEqual({'ccu-a': {links: {name: 90}}});
        store.reset('devices');
    });

    it('does not write when nothing changed', () => {
        const storage = new MemoryStorage();
        const store = new ColumnWidthsStore(storage, () => 'ccu');
        store.set('devices', 'name', 260);
        storage.map.clear();
        store.set('devices', 'name', 260);
        expect(storage.map.size).toBe(0);
    });

    it('starts from the designed widths when the storage holds garbage', () => {
        for (const garbage of ['{', '[1,2]', '"wide"', JSON.stringify({ccu: [1], other: {devices: 'x'}})]) {
            const storage = new MemoryStorage();
            storage.setItem(COLUMN_WIDTHS_STORAGE_KEY, garbage);
            expect(new ColumnWidthsStore(storage, () => 'ccu').widths('devices')).toEqual({});
        }
        const mixed = new MemoryStorage();
        mixed.setItem(COLUMN_WIDTHS_STORAGE_KEY, JSON.stringify({ccu: {devices: {name: 250, type: 'x'}, empty: {}}}));
        expect(new ColumnWidthsStore(mixed, () => 'ccu').widths('devices')).toEqual({name: 250});
    });

    it('works without a storage and with one that refuses to write', () => {
        const none = new ColumnWidthsStore(undefined, () => 'ccu');
        none.set('devices', 'name', 250);
        expect(none.widths('devices')).toEqual({name: 250});

        const refusing: StorageLike = {
            getItem: () => {
                throw new Error('blocked');
            },
            setItem: () => {
                throw new Error('quota');
            },
        };
        const store = new ColumnWidthsStore(refusing, () => 'ccu');
        store.set('devices', 'name', 250);
        expect(store.widths('devices')).toEqual({name: 250});
    });
});

describe('profileKey', () => {
    it('names a profile by its host, the way the backend names its cache directory', () => {
        expect(profileKey(' CCU3.local ')).toBe('ccu3.local');
        expect(profileKey('fe80::1')).toBe('fe80__1');
        expect(profileKey('')).toBe('unconfigured');
    });
});

describe('the widths slot of the AppStore', () => {
    function config(host: string): AppConfig {
        return {...DEMO_CONFIG, connection: {...DEMO_CONFIG.connection, host}};
    }

    it('follows the profile that is loaded', () => {
        const storage = new MemoryStorage();
        const transport = new MockTransport({demo: true});
        const app = new AppStore(transport, new NoticesStore(transport), {
            storage,
            location: {hash: ''},
            onHashChange: () => () => undefined,
        });

        app.applyConfig(config('ccu-a'));
        app.columnWidths.set('devices', 'name', 280);
        app.applyConfig(config('ccu-b'));
        expect(app.columnWidths.widths('devices')).toEqual({});
        app.applyConfig(config('CCU-A'));
        expect(app.columnWidths.widths('devices')).toEqual({name: 280});

        // and a reload of the page reads them back from the same browser storage
        const reloaded = new AppStore(transport, new NoticesStore(transport), {
            storage,
            location: {hash: ''},
            onHashChange: () => () => undefined,
        });
        reloaded.applyConfig(config('ccu-a'));
        expect(reloaded.columnWidths.widths('devices')).toEqual({name: 280});
    });
});
