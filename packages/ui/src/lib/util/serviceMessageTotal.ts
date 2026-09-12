import type {ServiceMessage} from '@homematic-manager/core';

/**
 * Task 36 (#150, D-44): the service messages of the whole box, next to the ones of the selected
 * interface.
 *
 * The list stays per interface - the maintainer's decision - but the CCU WebUI lists every
 * interface together, so the reporter counted seven there and four in the HMM: his HmIP socket sat
 * under HmIP-RF while he looked at BidCos-RF. The band therefore says "4 of 7 on this box" when the
 * other interfaces have messages too. Everything comes from the list the app already holds for
 * every connected interface; no RPC is made for it.
 */

/** One interface's share of the box's messages. */
export interface InterfaceMessageCount {
    readonly interfaceName: string;
    readonly count: number;
}

export interface ServiceMessageTotal {
    /** The selected interface's messages: what the list shows and the tab badge counts. */
    readonly own: number;
    /** Every interface's messages, the selected one's included. */
    readonly total: number;
    /** The other interfaces that have messages, in interface order. Empty means no total to show. */
    readonly others: readonly InterfaceMessageCount[];
    /**
     * Where the total leads: the first interface with messages after the selected one, wrapping
     * round, so that clicking it repeatedly walks every interface that has any.
     */
    readonly next: string | undefined;
}

/**
 * @param messages the messages of every interface, as `serviceMessages.list` answers.
 * @param selected the interface the tab shows.
 * @param order    the interface names in the order the header lists them; an interface that has
 *                 messages but is not in it follows in the order of the list.
 */
export function serviceMessageTotal(
    messages: readonly ServiceMessage[],
    selected: string,
    order: readonly string[] = [],
): ServiceMessageTotal {
    const counts = new Map<string, number>();
    for (const message of messages) {
        counts.set(message.interfaceName, (counts.get(message.interfaceName) ?? 0) + 1);
    }
    const names = [...new Set([...order, ...counts.keys()])];
    const own = counts.get(selected) ?? 0;
    const others = names
        .filter((name) => name !== selected && (counts.get(name) ?? 0) > 0)
        .map((name) => ({interfaceName: name, count: counts.get(name) ?? 0}));

    const position = names.indexOf(selected);
    const after = [...names.slice(position + 1), ...names.slice(0, Math.max(position, 0))];
    const next = after.find((name) => others.some((entry) => entry.interfaceName === name));

    return {own, total: messages.length, others, next};
}
