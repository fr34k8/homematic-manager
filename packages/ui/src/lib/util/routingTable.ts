import type {Paramset} from '@homematic-manager/core';

/**
 * Task 26 (openccu-lite 28.9): the ROUTING_TABLE paramset of an HmIP device with the router
 * module enabled. eQ-3's addendum: up to 400 numbered entries, `DYNAMIC_ROUTE_<FIELD>_<n>`, the
 * ones with the same n belonging together; the table is read from the device itself on every
 * getParamset, which is why the dialog reads it once and never on a timer.
 */
export interface RoutingEntry {
    readonly index: number;
    readonly destination: string;
    readonly nextHop: string;
    /** Hops to the destination. */
    readonly distance: number;
    /** Optional: dBm of the link to the destination. */
    readonly rssi: number | undefined;
    readonly isStatic: boolean;
    readonly isNeighbour: boolean;
    readonly macSequenceValid: boolean;
    readonly accessController: boolean;
    readonly router: boolean;
    readonly portable: boolean;
    readonly listenerMode: string;
    /** Whether the OM_* fields were verified. */
    readonly omValid: boolean;
}

const PREFIX = 'DYNAMIC_ROUTE_';

function field(values: Paramset, name: string, index: number): unknown {
    return values[`${PREFIX}${name}_${String(index)}`];
}

function asString(value: unknown): string {
    return typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '';
}

function asBool(value: unknown): boolean {
    return value === true || value === 1 || value === 'true' || value === '1';
}

function asNumber(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
        return Number(value);
    }
    return undefined;
}

/** The entries, in index order; an index without a destination ends nothing, it is skipped. */
export function parseRoutingTable(values: Paramset): RoutingEntry[] {
    const indices = new Set<number>();
    for (const key of Object.keys(values)) {
        if (key.startsWith(`${PREFIX}IP_DESTINATION_ADDRESS_`)) {
            const n = Number(key.slice(`${PREFIX}IP_DESTINATION_ADDRESS_`.length));
            if (Number.isInteger(n)) {
                indices.add(n);
            }
        }
    }
    return [...indices]
        .sort((a, b) => a - b)
        .map((index) => ({
            index,
            destination: asString(field(values, 'IP_DESTINATION_ADDRESS', index)),
            nextHop: asString(field(values, 'NEXT_HOP_ADDRESS', index)),
            distance: asNumber(field(values, 'DISTANCE', index)) ?? 0,
            rssi: asNumber(field(values, 'RSSI', index)),
            isStatic: asBool(field(values, 'IS_STATIC_ROUTE', index)),
            isNeighbour: asBool(field(values, 'IS_NEIGHBOUR', index)),
            macSequenceValid: asBool(field(values, 'IS_MAC_SEQUENCE_NUMBER_VALID', index)),
            accessController: asBool(field(values, 'OM_ACCESS_CONTROLLER', index)),
            router: asBool(field(values, 'OM_ROUTER', index)),
            portable: asBool(field(values, 'OM_PORTABLE_DEVICE', index)),
            listenerMode: asString(field(values, 'OM_LISTENER_MODE', index)),
            omValid: asBool(field(values, 'OM_VALID', index)),
        }))
        .filter((entry) => entry.destination !== '');
}

export interface RoutingNode {
    readonly id: string;
    readonly router: boolean;
    readonly accessController: boolean;
    readonly portable: boolean;
}

export interface RoutingEdge {
    readonly from: string;
    readonly to: string;
    /** Set on the edge that leaves the router: the hops to the destination the route is for. */
    readonly distance?: number | undefined;
    readonly rssi?: number | undefined;
    readonly isStatic: boolean;
}

export interface RoutingGraph {
    readonly self: string;
    readonly nodes: RoutingNode[];
    readonly edges: RoutingEdge[];
}

/**
 * The table as a graph seen from the router: a neighbour (or a destination whose next hop is
 * itself) hangs directly on the router; anything else hangs on its next hop, which hangs on the
 * router. Edges are deduplicated by their ends; the router's own edge carries distance and RSSI.
 */
export function routingGraph(self: string, entries: readonly RoutingEntry[]): RoutingGraph {
    const nodes = new Map<string, RoutingNode>([
        [self, {id: self, router: true, accessController: false, portable: false}],
    ]);
    const edges = new Map<string, RoutingEdge>();
    const addNode = (id: string, entry?: RoutingEntry): void => {
        if (id === '' || nodes.has(id)) {
            return;
        }
        nodes.set(id, {
            id,
            router: entry?.router ?? false,
            accessController: entry?.accessController ?? false,
            portable: entry?.portable ?? false,
        });
    };
    const addEdge = (edge: RoutingEdge): void => {
        const key = `${edge.from}>${edge.to}`;
        const existing = edges.get(key);
        if (!existing || (existing.distance === undefined && edge.distance !== undefined)) {
            edges.set(key, edge);
        }
    };
    for (const entry of entries) {
        addNode(entry.destination, entry);
        const direct = entry.isNeighbour || entry.nextHop === '' || entry.nextHop === entry.destination;
        if (direct) {
            addEdge({
                from: self,
                to: entry.destination,
                distance: entry.distance,
                rssi: entry.rssi,
                isStatic: entry.isStatic,
            });
        } else {
            addNode(entry.nextHop);
            addEdge({
                from: self,
                to: entry.nextHop,
                distance: entry.distance,
                rssi: entry.rssi,
                isStatic: entry.isStatic,
            });
            addEdge({from: entry.nextHop, to: entry.destination, isStatic: entry.isStatic});
        }
    }
    return {self, nodes: [...nodes.values()], edges: [...edges.values()]};
}
