import {INTERFACE_NAMES} from '@homematic-manager/core';
import {describe, expect, it} from 'vitest';

import {interfaceChoices, ownsName, removeExtraTick, renameExtraTick} from './extraInterfaceTicks.js';

const rows = (...names: string[]): {name: string}[] => names.map((name) => ({name}));

describe('the extra interfaces in the interface list (B-27, #135)', () => {
    describe('interfaceChoices', () => {
        it('offers the built-in interfaces, then every extra interface with a name', () => {
            expect(interfaceChoices(['BidCos-RF'], rows('CCU-Jack', '', 'CUxD-2'))).toEqual([
                ...INTERFACE_NAMES,
                'CCU-Jack',
                'CUxD-2',
            ]);
        });

        it('keeps a ticked name nothing else offers, and lists nothing twice', () => {
            expect(interfaceChoices(['Stray', 'BidCos-RF', 'Jack'], rows('Jack', 'Jack', 'HmIP-RF'))).toEqual([
                ...INTERFACE_NAMES,
                'Jack',
                'Stray',
            ]);
        });
    });

    describe('ownsName', () => {
        it('is true for a name only this row has', () => {
            expect(ownsName(rows('Jack', 'CUxD-2'), 0, 'Jack')).toBe(true);
        });

        it('is false for an empty name, a built-in name and a name another row has too', () => {
            expect(ownsName(rows(''), 0, '')).toBe(false);
            expect(ownsName(rows('BidCos-RF'), 0, 'BidCos-RF')).toBe(false);
            expect(ownsName(rows('Jack', 'Jack'), 0, 'Jack')).toBe(false);
        });
    });

    describe('renameExtraTick', () => {
        it('moves the tick to the new name and keeps its place', () => {
            expect(
                renameExtraTick(['BidCos-RF', 'Jack', 'HmIP-RF'], rows('Jack'), 0, 'Jack', 'CCU-Jack', false),
            ).toEqual({interfaces: ['BidCos-RF', 'CCU-Jack', 'HmIP-RF'], ticked: true});
        });

        it('leaves an unticked row unticked', () => {
            expect(renameExtraTick(['BidCos-RF'], rows('Jack'), 0, 'Jack', 'CCU-Jack', true)).toEqual({
                interfaces: ['BidCos-RF'],
                ticked: false,
            });
        });

        it('ticks a row that was held ticked as soon as it has a name', () => {
            expect(renameExtraTick(['BidCos-RF'], rows(''), 0, '', 'C', true)).toEqual({
                interfaces: ['BidCos-RF', 'C'],
                ticked: true,
            });
            expect(renameExtraTick(['BidCos-RF'], rows(''), 0, '', 'C', false)).toEqual({
                interfaces: ['BidCos-RF'],
                ticked: false,
            });
        });

        it('keeps the tick while the name is emptied and typed again', () => {
            const cleared = renameExtraTick(['Jack', 'BidCos-RF'], rows('Jack'), 0, 'Jack', '', false);
            expect(cleared).toEqual({interfaces: ['BidCos-RF'], ticked: true});
            expect(renameExtraTick(cleared.interfaces, rows(''), 0, '', 'CCU-Jack', cleared.ticked)).toEqual({
                interfaces: ['BidCos-RF', 'CCU-Jack'],
                ticked: true,
            });
        });

        it('neither takes nor gives the tick of a built-in interface the name passes through', () => {
            // BidCos-RF unticked: typing "BidCos-RF-2" must not leave it ticked
            const through = renameExtraTick(
                ['HmIP-RF', 'BidCos-R'],
                rows('BidCos-R'),
                0,
                'BidCos-R',
                'BidCos-RF',
                false,
            );
            expect(through).toEqual({interfaces: ['HmIP-RF'], ticked: true});
            expect(renameExtraTick(through.interfaces, rows('BidCos-RF'), 0, 'BidCos-RF', 'BidCos-RF-', true)).toEqual({
                interfaces: ['HmIP-RF', 'BidCos-RF-'],
                ticked: true,
            });

            // BidCos-RF ticked: it stays ticked on the way through and after
            const ticked = renameExtraTick(
                ['BidCos-RF', 'BidCos-R'],
                rows('BidCos-R'),
                0,
                'BidCos-R',
                'BidCos-RF',
                false,
            );
            expect(ticked).toEqual({interfaces: ['BidCos-RF'], ticked: true});
            expect(renameExtraTick(ticked.interfaces, rows('BidCos-RF'), 0, 'BidCos-RF', 'BidCos-RF-', true)).toEqual({
                interfaces: ['BidCos-RF', 'BidCos-RF-'],
                ticked: true,
            });
        });

        it('leaves the tick of another row with the same name where it is', () => {
            expect(renameExtraTick(['Jack'], rows('Jack', 'Jack'), 0, 'Jack', 'Jack-2', false)).toEqual({
                interfaces: ['Jack'],
                ticked: false,
            });
        });
    });

    describe('removeExtraTick', () => {
        it('takes the tick away with the row', () => {
            expect(removeExtraTick(['BidCos-RF', 'Jack'], rows('Jack'), 0)).toEqual(['BidCos-RF']);
        });

        it('leaves a built-in tick and the tick of another row with the same name alone', () => {
            expect(removeExtraTick(['BidCos-RF'], rows('BidCos-RF'), 0)).toEqual(['BidCos-RF']);
            expect(removeExtraTick(['Jack'], rows('Jack', 'Jack'), 1)).toEqual(['Jack']);
            expect(removeExtraTick(['BidCos-RF'], rows(''), 0)).toEqual(['BidCos-RF']);
        });
    });
});
