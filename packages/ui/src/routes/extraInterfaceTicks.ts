/**
 * B-27 (#135): the extra interfaces in the settings dialog's interface list.
 *
 * The backend connects exactly the names in `connection.interfaces` (`interfaceTargets`), and an
 * extra interface is one of them only once it is ticked there. The list used to offer the built-in
 * names and whatever was ticked already, so a CCU-Jack added in the dialog could never be ticked and
 * never connected. These are the rules the dialog follows for it now, kept out of the component so
 * the edge cases can be tested without one.
 *
 * A row of the extra-interface table is ticked or not; its tick is its name in `interfaces`. While
 * the name is empty, or is also the name of a built-in interface or of another row (both of which
 * the validation reports), the name cannot say whose tick it is - so the dialog keeps the row's own
 * answer beside it (`held`) and puts the tick back once the name is the row's alone again.
 */

import {INTERFACE_NAMES, isKnownInterface} from '@homematic-manager/core';

interface Named {
    readonly name: string;
}

/**
 * What the interface list offers: the built-in interfaces, then every extra interface that has a
 * name, then anything else already ticked, so a tick is never hidden.
 */
export function interfaceChoices(interfaces: readonly string[], extras: readonly Named[]): string[] {
    return [
        ...new Set([
            ...INTERFACE_NAMES,
            ...extras.map((extra) => extra.name).filter((name) => name !== ''),
            ...interfaces,
        ]),
    ];
}

/** Whether `name` stands for row `index` and nothing else: not empty, not built in, no other row's. */
export function ownsName(extras: readonly Named[], index: number, name: string): boolean {
    return name !== '' && !isKnownInterface(name) && extras.every((extra, at) => at === index || extra.name !== name);
}

/** The interface list after row `index` was renamed, and whether the row is ticked. */
export interface TickAfterRename {
    readonly interfaces: string[];
    readonly ticked: boolean;
}

/**
 * Row `index` goes from `previous` to `next`. Its tick moves with it and keeps its place in the
 * list; a name that is not the row's alone neither loses nor gains a tick, so typing an extra
 * interface called `BidCos-RF-2` leaves the tick of `BidCos-RF` as it was.
 *
 * @param held the row's tick as the dialog last knew it, used while `previous` cannot tell
 */
export function renameExtraTick(
    interfaces: readonly string[],
    extras: readonly Named[],
    index: number,
    previous: string,
    next: string,
    held: boolean,
): TickAfterRename {
    const owned = ownsName(extras, index, previous);
    const ticked = owned ? interfaces.includes(previous) : held;
    const result = [...interfaces];
    const at = owned ? result.indexOf(previous) : -1;
    if (at >= 0) {
        result.splice(at, 1);
    }
    if (ticked && ownsName(extras, index, next) && !result.includes(next)) {
        result.splice(at >= 0 ? at : result.length, 0, next);
    }
    return {interfaces: result, ticked};
}

/** The interface list without the tick of row `index`, which is being removed. */
export function removeExtraTick(interfaces: readonly string[], extras: readonly Named[], index: number): string[] {
    const name = extras[index]?.name ?? '';
    return ownsName(extras, index, name) ? interfaces.filter((entry) => entry !== name) : [...interfaces];
}
