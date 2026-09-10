/**
 * The hash route, unchanged from 2.7: `#/<interface>/<tab>`.
 *
 * `initDaemon()` in the old renderer read `location.hash.slice(1).split('/')`, took `[1]` as the
 * interface and `[2]` as the tab, and wrote the same shape back on every tab switch. Bookmarks and
 * the links people put in forum posts use it, so the format is kept exactly (D-3) - only the
 * parsing is now a pure function with tests instead of three copies inline.
 */

/** The six tabs of 2.7, in the order the tab bar shows them. */
export const TAB_IDS = ['devices', 'links', 'rssi', 'console', 'messages', 'events'] as const;

export type TabId = (typeof TAB_IDS)[number];

export const DEFAULT_TAB: TabId = 'devices';

export interface Route {
    /** Empty when the hash names no interface. */
    readonly interfaceName: string;
    readonly tab: TabId;
}

export function isTabId(value: string): value is TabId {
    return (TAB_IDS as readonly string[]).includes(value);
}

/** `#/BidCos-RF/links` -> `{interfaceName: 'BidCos-RF', tab: 'links'}`. */
export function parseHash(hash: string): Route {
    const parts = hash.replace(/^#/, '').split('/');
    const interfaceName = decodeURIComponent(parts[1] ?? '');
    const tab = decodeURIComponent(parts[2] ?? '');
    return {interfaceName, tab: isTabId(tab) ? tab : DEFAULT_TAB};
}

/** The inverse. An empty interface produces an empty hash, exactly as 2.x did. */
export function formatHash(interfaceName: string, tab: TabId): string {
    if (interfaceName === '') {
        return '';
    }
    return `#/${encodeURIComponent(interfaceName)}/${tab}`;
}

/**
 * Which tabs an interface offers. 2.x hid the tabs an interface cannot serve through the `dselect`
 * classes: links only for BidCos, RSSI only for BidCos-RF, service messages not for BidCos-Wired.
 * HmIP got everything, which is why the class list on the `#links` tab reads BidCos-only but
 * `initDaemon` showed all of them again for HmIP.
 */
export function tabsForInterface(interfaceType: string): TabId[] {
    switch (interfaceType) {
        case 'BidCos-Wired':
            return ['devices', 'links', 'console', 'events'];
        case 'CUxD':
            return ['devices', 'console', 'events'];
        case 'BidCos-RF':
            return [...TAB_IDS];
        default:
            // #155: HmIP has no `rssiInfo`, but it has the levels - they arrive as `RSSI_DEVICE`
            // and `RSSI_PEER` of the maintenance channel, which is what 2.x showed in its Funk tab
            // for HmIP and what the backend's matrix is built from. OpenCCU's WebUI assembles its
            // own HmIP list the same way. Everything user-defined keeps the shorter set: nothing
            // there answers `listBidcosInterfaces`.
            if (/hmip/i.test(interfaceType)) {
                return ['devices', 'links', 'rssi', 'console', 'messages', 'events'];
            }
            return ['devices', 'links', 'console', 'messages', 'events'];
    }
}
