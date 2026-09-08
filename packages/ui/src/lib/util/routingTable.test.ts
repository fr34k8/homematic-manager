import {describe, expect, it} from 'vitest';
import {parseRoutingTable, routingGraph} from './routingTable.js';

describe('routing table (task 26)', () => {
    const values = {
        DYNAMIC_ROUTE_IP_DESTINATION_ADDRESS_0: '0011AAAA',
        DYNAMIC_ROUTE_NEXT_HOP_ADDRESS_0: '0011AAAA',
        DYNAMIC_ROUTE_DISTANCE_0: 1,
        DYNAMIC_ROUTE_RSSI_0: -71,
        DYNAMIC_ROUTE_IS_NEIGHBOUR_0: true,
        DYNAMIC_ROUTE_IS_STATIC_ROUTE_0: false,
        DYNAMIC_ROUTE_OM_ROUTER_0: true,
        DYNAMIC_ROUTE_OM_VALID_0: true,
        DYNAMIC_ROUTE_IP_DESTINATION_ADDRESS_1: '0011BBBB',
        DYNAMIC_ROUTE_NEXT_HOP_ADDRESS_1: '0011AAAA',
        DYNAMIC_ROUTE_DISTANCE_1: '2',
        DYNAMIC_ROUTE_IS_NEIGHBOUR_1: false,
        DYNAMIC_ROUTE_IS_STATIC_ROUTE_1: 'true',
        DYNAMIC_ROUTE_OM_PORTABLE_DEVICE_1: true,
        DYNAMIC_ROUTE_OM_LISTENER_MODE_1: 'ALWAYS',
        // an index without a destination is not an entry
        DYNAMIC_ROUTE_DISTANCE_7: 3,
        // and the numbering need not be dense
        DYNAMIC_ROUTE_IP_DESTINATION_ADDRESS_12: '0011CCCC',
        DYNAMIC_ROUTE_NEXT_HOP_ADDRESS_12: '',
        DYNAMIC_ROUTE_DISTANCE_12: 1,
    };

    it('parses the numbered fields into entries, in index order, tolerant of strings', () => {
        const entries = parseRoutingTable(values);
        expect(entries.map((entry) => [entry.index, entry.destination, entry.nextHop, entry.distance])).toEqual([
            [0, '0011AAAA', '0011AAAA', 1],
            [1, '0011BBBB', '0011AAAA', 2],
            [12, '0011CCCC', '', 1],
        ]);
        expect(entries[0]).toMatchObject({rssi: -71, isNeighbour: true, router: true, omValid: true, isStatic: false});
        expect(entries[1]).toMatchObject({isStatic: true, portable: true, listenerMode: 'ALWAYS', rssi: undefined});
    });

    it('draws neighbours on the router and the rest behind their next hop', () => {
        const graph = routingGraph('00SELF', parseRoutingTable(values));
        expect(graph.nodes.map((node) => node.id)).toEqual(['00SELF', '0011AAAA', '0011BBBB', '0011CCCC']);
        expect(graph.nodes[1]).toMatchObject({router: true});
        expect(graph.edges).toEqual([
            {from: '00SELF', to: '0011AAAA', distance: 1, rssi: -71, isStatic: false},
            {from: '0011AAAA', to: '0011BBBB', isStatic: true},
            {from: '00SELF', to: '0011CCCC', distance: 1, rssi: undefined, isStatic: false},
        ]);
    });

    it('is empty for an empty table', () => {
        expect(parseRoutingTable({})).toEqual([]);
        expect(routingGraph('00SELF', []).edges).toEqual([]);
    });
});
