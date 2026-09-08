import {describe, expect, it} from 'vitest';

import type {MetaEnum, MetaObjectView} from '@homematic-manager/core';

import {
    canMoveUnder,
    channelVisible,
    deviceMatches,
    deviceNames,
    indentedLabel,
    membersOf,
    namesOf,
    nodeOptions,
    objectMatches,
} from './taxonomy.js';

const ENUMS: Record<string, MetaEnum> = {
    room: {
        name: {en: 'Rooms'},
        tree: [
            {id: 'eg', name: 'Erdgeschoss', children: [{id: 'kueche', name: 'Küche'}]},
            {id: 'aussen', name: 'Außen'},
        ],
    },
    function: {name: {en: 'Functions'}, tree: [{id: 'licht', name: 'Licht'}]},
};

const view = (enums: string[], rooms: string[] = [], functions: string[] = []): MetaObjectView => ({
    name: 'x',
    enums,
    rooms,
    functions,
});

describe('nodeOptions', () => {
    it('flattens one enum depth first with its depth, and knows which nodes have children', () => {
        expect(nodeOptions(ENUMS, 'room')).toEqual([
            {path: 'room/eg', label: 'Erdgeschoss', depth: 1, hasChildren: true},
            {path: 'room/eg/kueche', label: 'Küche', depth: 2, hasChildren: false},
            {path: 'room/aussen', label: 'Außen', depth: 1, hasChildren: false},
        ]);
        expect(nodeOptions(ENUMS, 'floor')).toEqual([]);
    });

    it('draws the depth as indentation for a select that cannot be styled', () => {
        const [floor, room] = nodeOptions(ENUMS, 'room');
        expect(indentedLabel(floor!, '..')).toBe('Erdgeschoss');
        expect(indentedLabel(room!, '..')).toBe('..Küche');
    });
});

describe('the subtree rule of the filter', () => {
    it('matches the node itself and everything below it, never a sibling', () => {
        const kitchen = view(['room/eg/kueche']);
        expect(objectMatches(kitchen, 'room/eg/kueche')).toBe(true);
        expect(objectMatches(kitchen, 'room/eg')).toBe(true);
        expect(objectMatches(kitchen, 'room/aussen')).toBe(false);
        expect(objectMatches(kitchen, 'room/e')).toBe(false);
        expect(objectMatches(undefined, 'room/eg')).toBe(false);
    });

    it('keeps a device row when any of its channels is in the target', () => {
        expect(deviceMatches(undefined, [undefined, view(['room/eg/kueche'])], 'room/eg')).toBe(true);
        expect(deviceMatches(view(['room/aussen']), [view(['room/eg/kueche'])], 'room/aussen')).toBe(true);
        expect(deviceMatches(undefined, [view(['function/licht'])], 'room/eg')).toBe(false);
    });

    it('shows every channel of a device that is itself in the target, else only the matching ones', () => {
        expect(channelVisible(undefined, view(['room/eg']), 'room/eg')).toBe(true);
        expect(channelVisible(view(['room/eg/kueche']), undefined, 'room/eg')).toBe(true);
        expect(channelVisible(view(['room/aussen']), undefined, 'room/eg')).toBe(false);
    });
});

describe('membersOf', () => {
    it('lists the refs in a subtree, sorted, for the delete confirmation', () => {
        const objects = {
            'BidCos-RF.B:1': view(['room/eg/kueche']),
            'BidCos-RF.A:1': view(['room/eg']),
            'BidCos-RF.C:1': view(['room/aussen', 'function/licht']),
        };
        expect(membersOf(objects, 'room/eg')).toEqual(['BidCos-RF.A:1', 'BidCos-RF.B:1']);
        expect(membersOf(objects, 'function/licht')).toEqual(['BidCos-RF.C:1']);
        expect(membersOf(objects, 'room/og')).toEqual([]);
    });
});

describe('what the grid prints', () => {
    it('takes the names the backend put in tree order', () => {
        const entry = view(['room/eg/kueche', 'function/licht'], ['Küche'], ['Licht']);
        expect(namesOf(entry, 'room')).toEqual(['Küche']);
        expect(namesOf(entry, 'function')).toEqual(['Licht']);
        expect(namesOf(undefined, 'room')).toEqual([]);
    });

    it('gives a device without its own rooms the union of its channels, without repetition', () => {
        const channels = [view([], ['Küche']), undefined, view([], ['Küche', 'Flur']), view([], [], ['Licht'])];
        expect(deviceNames(undefined, channels, 'room')).toEqual(['Küche', 'Flur']);
        expect(deviceNames(undefined, channels, 'function')).toEqual(['Licht']);
        // a device with its own membership says that, not its channels'
        expect(deviceNames(view([], ['Außen']), channels, 'room')).toEqual(['Außen']);
    });
});

describe('canMoveUnder', () => {
    it('allows the root and any node outside the subtree, never the node or its descendants', () => {
        expect(canMoveUnder('room/eg', null)).toBe(true);
        expect(canMoveUnder('room/eg', 'room/aussen')).toBe(true);
        expect(canMoveUnder('room/eg', 'room/eg')).toBe(false);
        expect(canMoveUnder('room/eg', 'room/eg/kueche')).toBe(false);
        expect(canMoveUnder('room/eg', 'room/egal')).toBe(true);
    });
});
