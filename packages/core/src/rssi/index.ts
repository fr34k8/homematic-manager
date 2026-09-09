/**
 * The RSSI matrix behind the radio ("Funk") tab.
 *
 * `rssiInfo` answers with `{[device]: {[peer]: [receive, send]}}` in dBm, where 65536 means "not
 * known" (the interface process's placeholder for an unsigned 16-bit -1). hmipserver has no
 * `rssiInfo`, so for HmIP the matrix is assembled from `RSSI_DEVICE` / `RSSI_PEER`, which arrive
 * as events and sit in every device's `<device>:0` VALUES paramset - the same thing 2.x does in
 * main.js (:404-432 for the events, :800-822 for the paramset read).
 */

import type {BidcosInterfaceInfo} from '../api/types.js';
import type {Paramset, ParamsetValue} from '../rpc/values.js';

/** What an interface process sends instead of a value it does not have. */
export const RSSI_UNKNOWN = 65536;

/** The thresholds of the 2.x `rssiColor()` (homematic-manager.js:4649). */
export const RSSI_BAD = -120;
export const RSSI_MEDIUM = -100;
export const RSSI_GOOD = -20;

/** What one partner measures of another. `undefined` where the interface reported 65536. */
export interface RssiPair {
    /** What this device receives from the peer, in dBm. */
    readonly rx?: number;
    /** What the peer receives from this device, in dBm. */
    readonly tx?: number;
}

/** An `rssiInfo` answer, straight off the wire. */
export type RawRssiInfo = Readonly<Record<string, Readonly<Record<string, readonly unknown[]>>>>;

/** device or interface address -> peer address -> the pair. */
export type RssiMatrix = Record<string, Record<string, RssiPair>>;

/** How good a signal is, for the colour of the grid cell. */
export type RssiClass = 'unknown' | 'bad' | 'medium' | 'good';

/** One value from an `rssiInfo` answer: a number, unless it is the "unknown" placeholder. */
export function normaliseRssiValue(value: unknown): number | undefined {
    if (typeof value !== 'number' || !Number.isFinite(value) || value === RSSI_UNKNOWN) {
        return undefined;
    }
    return value;
}

/** Turns an `rssiInfo` answer into the matrix, dropping the 65536 placeholders. */
export function normaliseRssiInfo(raw: RawRssiInfo): RssiMatrix {
    const matrix: RssiMatrix = {};
    for (const [address, peers] of Object.entries(raw)) {
        const row: Record<string, RssiPair> = {};
        for (const [peer, values] of Object.entries(peers)) {
            row[peer] = pair(normaliseRssiValue(values[0]), normaliseRssiValue(values[1]));
        }
        matrix[address] = row;
    }
    return matrix;
}

/**
 * How good a signal is. -20 dBm and better is good, -100 and worse is bad, in between is medium;
 * an absent value is unknown. The bounds come from the 2.x colour gradient.
 */
export function rssiClass(dbm: number | undefined): RssiClass {
    const value = normaliseRssiValue(dbm);
    if (value === undefined) {
        return 'unknown';
    }
    if (value >= RSSI_GOOD) {
        return 'good';
    }
    return value >= RSSI_MEDIUM ? 'medium' : 'bad';
}

/**
 * The red/green gradient of the 2.x grid, kept so the radio tab looks the same (D-3).
 * `undefined` for a value there is none for - the cell stays empty, as it did.
 */
export function rssiColor(dbm: number | undefined): string | undefined {
    const value = normaliseRssiValue(dbm);
    if (value === undefined) {
        return undefined;
    }
    const red = channel((256 * (value - RSSI_GOOD)) / (RSSI_MEDIUM - RSSI_GOOD));
    const green = channel((256 * (value - RSSI_BAD)) / (RSSI_MEDIUM - RSSI_BAD));
    return `#${hex(red)}${hex(green)}00`;
}

/** The two fields of a `listBidcosInterfaces` entry that name it. */
export type BidcosInterfaceName = Pick<BidcosInterfaceInfo, 'ADDRESS' | 'DESCRIPTION'>;

/**
 * How a BidCos interface is named for a person: the `DESCRIPTION` the CCU carries for it - the
 * name a LAN gateway was given in the WebUI, `CCU2-Coprocessor` for the built-in module - and the
 * serial when there is none. The 2.x Funk grid put the serial over the interface's columns with
 * the description in small print under it; a gateway without a description shows its serial alone.
 */
export function bidcosInterfaceLabel(gateway: BidcosInterfaceName): string {
    const description = gateway.DESCRIPTION?.trim() ?? '';
    return description === '' ? gateway.ADDRESS : description;
}

/**
 * The receiver a BidCos-RF device is routed through, for the device grid (BUGS.md B-2): the
 * label of the gateway whose serial the description's `INTERFACE` names, the serial itself when
 * `listBidcosInterfaces` does not know it or has not been read yet, and nothing for a device
 * without one - HmIP and Wired have no receivers.
 */
export function receiverLabel(
    device: {readonly INTERFACE?: string | undefined},
    gateways: readonly BidcosInterfaceName[],
): string {
    const serial = device.INTERFACE ?? '';
    if (serial === '') {
        return '';
    }
    const gateway = gateways.find((candidate) => candidate.ADDRESS === serial);
    return gateway ? bidcosInterfaceLabel(gateway) : serial;
}

/** The HmIP datapoints the matrix is built from. */
export const RSSI_DATAPOINTS: readonly string[] = ['RSSI_DEVICE', 'RSSI_PEER'];

export interface RssiStoreOptions {
    /**
     * The HmIP access point's address, from `listBidcosInterfaces()`. Without it the HmIP values
     * have no counterpart to be filed under and are dropped.
     */
    readonly centralAddress?: string;
}

/** The RSSI matrix of one interface. */
export class RssiStore {
    #matrix: RssiMatrix = {};
    #centralAddress: string | undefined;

    constructor(options: RssiStoreOptions = {}) {
        this.#centralAddress = options.centralAddress;
    }

    /** The access point address the HmIP values are filed against. */
    get centralAddress(): string | undefined {
        return this.#centralAddress;
    }

    /** Set once `listBidcosInterfaces` has answered. */
    setCentralAddress(address: string): void {
        this.#centralAddress = address;
    }

    /** Replaces everything with a fresh `rssiInfo` answer (BidCos). */
    applyRssiInfo(raw: RawRssiInfo): void {
        this.#matrix = normaliseRssiInfo(raw);
    }

    /**
     * Applies an HmIP `RSSI_DEVICE` / `RSSI_PEER` value, filing it in both directions exactly as
     * 2.x does: `RSSI_DEVICE` is what the access point receives from the device, `RSSI_PEER` what
     * the device receives from the access point.
     *
     * Returns false for a datapoint that is not an RSSI one, for an unusable value, or while the
     * access point address is still unknown.
     */
    applyHmipValue(deviceAddress: string, datapoint: string, value: ParamsetValue): boolean {
        const central = this.#centralAddress;
        const dbm = normaliseRssiValue(value);
        if (central === undefined || dbm === undefined || !RSSI_DATAPOINTS.includes(datapoint)) {
            return false;
        }
        if (datapoint === 'RSSI_DEVICE') {
            this.#merge(central, deviceAddress, {rx: dbm});
            this.#merge(deviceAddress, central, {tx: dbm});
        } else {
            this.#merge(deviceAddress, central, {rx: dbm});
            this.#merge(central, deviceAddress, {tx: dbm});
        }
        return true;
    }

    /** Applies the RSSI datapoints of a `getParamset(<device>:0, VALUES)` answer. */
    applyHmipParamset(deviceAddress: string, values: Paramset): boolean {
        let changed = false;
        for (const datapoint of RSSI_DATAPOINTS) {
            const value = values[datapoint];
            if (value !== undefined) {
                changed = this.applyHmipValue(deviceAddress, datapoint, value) || changed;
            }
        }
        return changed;
    }

    /** What `a` measures of `b`. */
    get(a: string, b: string): RssiPair | undefined {
        return this.#matrix[a]?.[b];
    }

    /** The peers of an address, sorted. */
    peersOf(address: string): string[] {
        return Object.keys(this.#matrix[address] ?? {}).sort();
    }

    /** The whole matrix, as a plain object. */
    toJSON(): RssiMatrix {
        const copy: RssiMatrix = {};
        for (const [address, peers] of Object.entries(this.#matrix)) {
            copy[address] = {...peers};
        }
        return copy;
    }

    /**
     * The interface a device is heard best by, among the given candidates - the input for the
     * "use the strongest interface" action of issue #69. Compares what the interface receives from
     * the device (`tx` on the device's row), the value that decides whether a command gets through.
     */
    bestInterfaceFor(
        deviceAddress: string,
        interfaceAddresses: readonly string[],
    ): {readonly address: string; readonly rx?: number; readonly tx?: number} | undefined {
        let best: {address: string; rx?: number; tx?: number} | undefined;
        let bestValue = Number.NEGATIVE_INFINITY;
        for (const address of interfaceAddresses) {
            const measured = this.get(deviceAddress, address);
            if (measured?.tx === undefined) {
                continue;
            }
            if (measured.tx > bestValue) {
                bestValue = measured.tx;
                best = {address, ...measured};
            }
        }
        return best;
    }

    #merge(address: string, peer: string, values: RssiPair): void {
        const row = (this.#matrix[address] ??= {});
        row[peer] = {...row[peer], ...values};
    }
}

function pair(rx: number | undefined, tx: number | undefined): RssiPair {
    const result: {rx?: number; tx?: number} = {};
    if (rx !== undefined) {
        result.rx = rx;
    }
    if (tx !== undefined) {
        result.tx = tx;
    }
    return result;
}

function channel(value: number): number {
    return Math.min(255, Math.max(0, Math.round(value)));
}

function hex(value: number): string {
    return `0${value.toString(16)}`.slice(-2);
}

/**
 * Why a device is, or is not, proposed for another receiver (#69).
 *
 * - `switch`: another interface receives the device better than the configured one by at least
 *   the margin.
 * - `marginal`: another interface receives it better, but by less than the margin - one sample
 *   apart, which `rssiInfo` values are between two reads.
 * - `unheard`: the configured receiver has no measurement of the device at all while another
 *   interface has one; that can mean the device never reaches its receiver, or that rfd has not
 *   heard it since a restart.
 * - `keep`: the configured receiver hears it best, or at least as well as any other.
 * - `unmeasured`: no interface has a measurement.
 * - `roaming`: the device roams, so the CCU picks its receiver itself; nothing to assign.
 */
export type ReceiverVerdict = 'switch' | 'marginal' | 'unheard' | 'keep' | 'unmeasured' | 'roaming';

/** One row of the "assign the best receiver" proposal (#69). */
export interface ReceiverProposal {
    readonly address: string;
    /** The serial of the receiver the device is configured for. */
    readonly configured: string;
    /** What the configured receiver receives from the device, in dBm. */
    readonly configuredTx: number | undefined;
    /** The interface that receives the device best; `undefined` without a measurement. */
    readonly best: string | undefined;
    readonly bestTx: number | undefined;
    /** `bestTx - configuredTx` where both are known. */
    readonly gain: number | undefined;
    readonly verdict: ReceiverVerdict;
}

/**
 * The margin a better interface has to clear before a switch is proposed, in dB. The values of
 * `rssiInfo` are the last measurement rfd holds, and two reads of the same link differ by a few dB
 * without anything having moved; 6 dB is roughly a quartering of the received power and clears
 * that noise.
 */
export const DEFAULT_RECEIVER_MARGIN_DB = 6;

const VERDICT_ORDER: readonly ReceiverVerdict[] = ['switch', 'marginal', 'unheard', 'keep', 'unmeasured', 'roaming'];

/** The fields of a device description the proposal reads. */
export interface ReceiverCandidate {
    readonly ADDRESS: string;
    readonly PARENT?: string | undefined;
    readonly INTERFACE?: string | undefined;
    readonly ROAMING?: boolean | number | undefined;
}

/**
 * The dry run behind issue #69: for every BidCos-RF device with a receiver, which interface hears
 * it best and whether that is worth a `setBidcosInterface`. Nothing is written here - the list
 * is what the user confirms, device by device, before anything is. Channels and devices without
 * an `INTERFACE` (HmIP, Wired, groups) are not in the answer at all. Sorted by verdict in the
 * order of {@link ReceiverVerdict}, then by gain, then by address.
 */
export function proposeReceivers(
    devices: readonly ReceiverCandidate[],
    interfaceAddresses: readonly string[],
    store: Pick<RssiStore, 'get' | 'bestInterfaceFor'>,
    options: {readonly marginDb?: number | undefined} = {},
): ReceiverProposal[] {
    const margin = Math.max(0, options.marginDb ?? DEFAULT_RECEIVER_MARGIN_DB);
    const proposals: ReceiverProposal[] = [];
    for (const device of devices) {
        const configured = device.INTERFACE ?? '';
        if (configured === '' || (device.PARENT ?? '') !== '') {
            continue;
        }
        const configuredTx = store.get(device.ADDRESS, configured)?.tx;
        const best = store.bestInterfaceFor(device.ADDRESS, interfaceAddresses);
        const gain = best?.tx !== undefined && configuredTx !== undefined ? best.tx - configuredTx : undefined;
        let verdict: ReceiverVerdict;
        if (device.ROAMING === true || device.ROAMING === 1) {
            verdict = 'roaming';
        } else if (best === undefined) {
            verdict = 'unmeasured';
        } else if (best.address === configured) {
            verdict = 'keep';
        } else if (gain === undefined) {
            verdict = 'unheard';
        } else if (gain <= 0) {
            verdict = 'keep';
        } else {
            verdict = gain >= margin ? 'switch' : 'marginal';
        }
        proposals.push({
            address: device.ADDRESS,
            configured,
            configuredTx,
            best: best?.address,
            bestTx: best?.tx,
            gain,
            verdict,
        });
    }
    return proposals.sort(
        (a, b) =>
            VERDICT_ORDER.indexOf(a.verdict) - VERDICT_ORDER.indexOf(b.verdict) ||
            (b.gain ?? Number.NEGATIVE_INFINITY) - (a.gain ?? Number.NEGATIVE_INFINITY) ||
            a.address.localeCompare(b.address),
    );
}
