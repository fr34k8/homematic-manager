import type {
    BidcosInterfaceInfo,
    ReceiverCandidate,
    ReceiverProposal,
    RssiPair,
    Transport,
} from '@homematic-manager/core';
import {deviceAddress, proposeReceivers, RssiStore} from '@homematic-manager/core';

import type {NoticesStore} from './NoticesStore.svelte.js';

/**
 * The radio ("Funk") tab: the BidCos interfaces of a CCU and the RSSI matrix.
 *
 * Two sources, one model. On BidCos the matrix comes from `rssiInfo`; hmipserver has no such
 * method, so there the values arrive as `RSSI_DEVICE` / `RSSI_PEER` events and are filed against
 * the access point's address, which is what `listBidcosInterfaces` answers with. Core's `RssiStore`
 * knows both paths; this class owns one per interface and makes them reactive.
 */
export class RadioStore {
    interfaces = $state<Record<string, BidcosInterfaceInfo[]>>({});
    loading = $state(false);

    /** Bumped on every change, because core's `RssiStore` is a plain class and not reactive. */
    #version = $state(0);
    /** Not reactive on purpose - `#version` is what the derived reads; a plain record keeps
     *  the Svelte reactivity rule out of a cache that is never rendered directly. */
    readonly #stores: Record<string, RssiStore> = {};
    /** Interfaces whose gateway list is being read, was read, or failed once this session. Plain, like `#stores`. */
    readonly #gatewayReads: Record<string, 'busy' | 'done' | 'failed'> = {};
    /**
     * Interfaces whose RSSI matrix has been read this session, reactive because the Funk tab's
     * effect reads it.
     *
     * Issue #151: the tab used to ask "are there gateways yet?" to decide whether to load. The
     * Devices tab fills that list on its own (`ensureGateways`, B-2), so on a start that opened
     * Devices first the answer was yes and `rssiInfo` was never read - the Funk tab showed the
     * grid without a single dBm value until the user pressed Refresh.
     */
    #matrixReads = $state<Record<string, 'busy' | 'done' | 'failed'>>({});
    readonly #transport: Transport;
    readonly #notices: NoticesStore;
    readonly #unsubscribe: () => void;

    constructor(transport: Transport, notices: NoticesStore) {
        this.#transport = transport;
        this.#notices = notices;
        this.#unsubscribe = transport.on('rpc.event', (record) => {
            if (record.address === undefined || record.datapoint === undefined || record.value === undefined) {
                return;
            }
            const value = record.value;
            if (typeof value !== 'boolean' && typeof value !== 'number' && typeof value !== 'string') {
                return;
            }
            const store = this.#stores[record.interfaceName];
            if (store?.applyHmipValue(deviceAddress(record.address), record.datapoint, value) === true) {
                this.#version += 1;
            }
        });
    }

    #store(interfaceName: string): RssiStore {
        const store = this.#stores[interfaceName] ?? new RssiStore();
        this.#stores[interfaceName] = store;
        return store;
    }

    /** Has the RSSI matrix of this interface been read (or refused) this session? */
    hasMatrix(interfaceName: string): boolean {
        return this.#matrixReads[interfaceName] !== undefined;
    }

    /**
     * Reads the matrix once per interface, which is what the Funk tab needs when it opens (#151).
     * {@link load} is the forced read behind the Refresh button and marks the interface as read.
     */
    async ensureMatrix(interfaceName: string): Promise<void> {
        if (interfaceName === '' || this.#matrixReads[interfaceName] !== undefined) {
            return;
        }
        await this.load(interfaceName);
    }

    /** The BidCos interfaces (LAN gateways and the built-in coprocessor) of one interface process. */
    gateways(interfaceName: string): BidcosInterfaceInfo[] {
        return this.interfaces[interfaceName] ?? [];
    }

    /** The addresses of those gateways, in the order the interface process listed them. */
    gatewayAddresses(interfaceName: string): string[] {
        return this.gateways(interfaceName).map((gateway) => gateway.ADDRESS);
    }

    /** What `a` measures of `b`. */
    pair(interfaceName: string, a: string, b: string): RssiPair | undefined {
        void this.#version;
        return this.#stores[interfaceName]?.get(a, b);
    }

    /** The peers of a device, sorted - the rows of the 2.x RSSI sub-grid. */
    peersOf(interfaceName: string, address: string): string[] {
        void this.#version;
        return this.#stores[interfaceName]?.peersOf(address) ?? [];
    }

    /** The interface a device is heard best by (#69). */
    bestGatewayFor(interfaceName: string, address: string): {address: string; rx?: number; tx?: number} | undefined {
        void this.#version;
        return this.#stores[interfaceName]?.bestInterfaceFor(address, this.gatewayAddresses(interfaceName));
    }

    /**
     * The dry run of #69: for every device with a receiver, which interface hears it best and
     * whether that is worth a `setBidcosInterface`. Nothing is written; the dialog that shows the
     * list writes one device at a time through {@link setBidcosInterface} once the user confirms.
     */
    proposeReceivers(
        interfaceName: string,
        devices: readonly ReceiverCandidate[],
        marginDb?: number,
    ): ReceiverProposal[] {
        void this.#version;
        const store = this.#stores[interfaceName];
        return store ? proposeReceivers(devices, this.gatewayAddresses(interfaceName), store, {marginDb}) : [];
    }

    /**
     * Reads the gateway list once, without the matrix. The device grid needs only the names of
     * the receivers (BUGS.md B-2), not `rssiInfo` for every device; the Funk tab's {@link load}
     * reads both. A list that was read - or refused - is not asked for again this session.
     */
    async ensureGateways(interfaceName: string): Promise<void> {
        if (
            interfaceName === '' ||
            this.interfaces[interfaceName] !== undefined ||
            this.#gatewayReads[interfaceName] !== undefined
        ) {
            return;
        }
        this.#gatewayReads[interfaceName] = 'busy';
        try {
            await this.#loadGateways(interfaceName);
            this.#gatewayReads[interfaceName] = 'done';
        } catch (error) {
            this.#gatewayReads[interfaceName] = 'failed';
            this.#notices.fromError(error, `listBidcosInterfaces ${interfaceName}`);
        }
    }

    async #loadGateways(interfaceName: string): Promise<void> {
        const gateways = await this.#transport.request('bidcos.interfaces', interfaceName);
        this.interfaces = {...this.interfaces, [interfaceName]: gateways};
        const central = gateways.find((gateway) => gateway.DEFAULT === true) ?? gateways[0];
        if (central) {
            this.#store(interfaceName).setCentralAddress(central.ADDRESS);
        }
    }

    /**
     * Reads the matrix and the gateway list. `listBidcosInterfaces` is asked first, because its
     * answer names the access point the HmIP values are filed against - without it they have no
     * counterpart and are dropped.
     */
    async load(interfaceName: string): Promise<void> {
        if (interfaceName === '') {
            return;
        }
        this.#matrixReads = {...this.#matrixReads, [interfaceName]: 'busy'};
        this.loading = true;
        try {
            await this.#loadGateways(interfaceName);
        } catch (error) {
            this.#notices.fromError(error, `listBidcosInterfaces ${interfaceName}`);
        }
        try {
            this.#store(interfaceName).applyRssiInfo(await this.#transport.request('rssi.get', interfaceName));
            this.#version += 1;
            this.#matrixReads = {...this.#matrixReads, [interfaceName]: 'done'};
        } catch (error) {
            // hmipserver has no `rssiInfo`; there the matrix is built from events, so this is a
            // status, not a failure - the backend answers with an empty matrix in that case.
            this.#matrixReads = {...this.#matrixReads, [interfaceName]: 'failed'};
            this.#notices.fromError(error, `rssiInfo ${interfaceName}`);
        } finally {
            this.loading = false;
        }
    }

    /**
     * `setBidcosInterface`: which gateway serves a device, and whether it may roam. 2.x showed the
     * assignment it had read at start-up (#122), so the device list is re-read afterwards - the
     * `INTERFACE` field of the description is the only place the current assignment is visible.
     */
    async setBidcosInterface(
        interfaceName: string,
        address: string,
        gateway: string,
        roaming: boolean,
    ): Promise<boolean> {
        try {
            await this.#transport.request('bidcos.setInterface', interfaceName, address, gateway, roaming);
            return true;
        } catch (error) {
            this.#notices.fromError(error, `setBidcosInterface ${address} ${gateway}`);
            return false;
        }
    }

    dispose(): void {
        this.#unsubscribe();
    }
}
