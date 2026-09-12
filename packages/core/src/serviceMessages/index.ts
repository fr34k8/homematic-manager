/**
 * Service messages: what the CCU calls "Servicemeldungen".
 *
 * They are ordinary datapoints of the maintenance channel `:0`, but only some of them count.
 * BidCos interfaces answer `getServiceMessages` with a list of `[channel, datapoint, value]`
 * tuples; hmipserver does not implement the method at all, so for HmIP the list has to be built
 * from the events and from `getParamset(<device>:0, VALUES)` - which is exactly what 2.x does in
 * main.js `setServiceMessage` (:363) and the `getParamset` branch of its rpcProxy (:800-830).
 *
 * The store below is that logic without the globals: a value that is truthy sets the message, a
 * falsy one clears it, and clearing the last message of a channel drops the channel.
 */

import {deviceAddress} from '../address/address.js';
import type {ParameterDescription} from '../paramset/description.js';
import type {Paramset, ParamsetValue} from '../rpc/values.js';

/**
 * The datapoints that are service messages. `ERROR*` is a prefix rule: devices carry `ERROR`,
 * `ERROR_CODE`, `ERROR_OVERHEAT`, `ERROR_JAMMED` and a dozen more, all of them meaning the same
 * thing for the list.
 *
 * `FAULT_REPORTING` (BUGS.md B-24, #150) is the ENUM of the HM-CC-RT-DN's
 * `CLIMATECONTROL_RT_TRANSCEIVER` channel - not on `:0` and not named `ERROR*`, so it was dropped
 * and the WebUI's "Kommunikationsstörung" never reached the list. Its index `0` is `NO_FAULT`,
 * which is falsy, so the store's "falsy clears" rule needs no exception for it. It is not
 * acknowledgeable: its `OPERATIONS` are 5 (read, event), and the WebUI's service-message page
 * enables its confirm button only for a datapoint with the write bit.
 *
 * Only the datapoints named here count, not every one with the description's SERVICE flag: that
 * would take the next device-specific one automatically, but it needs a description per channel
 * before a message can be listed, and it is a broader change than this bug.
 */
export const SERVICE_MESSAGE_DATAPOINTS: readonly string[] = [
    'CONFIG_PENDING',
    'DUTY_CYCLE',
    'FAULT_REPORTING',
    'LOWBAT',
    'LOW_BAT',
    'SABOTAGE',
    'UNREACH',
    'STICKY_UNREACH',
    'UPDATE_PENDING',
];

/** Prefix of the device-specific error datapoints. */
export const ERROR_DATAPOINT_PREFIX = 'ERROR';

/**
 * The ones the user can acknowledge; the rest clear themselves when the condition goes away.
 *
 * ASSUMPTION (A-4, see packages/core/ASSUMPTIONS.md): taken from the CCU WebUI's behaviour -
 * `STICKY_UNREACH`, `SABOTAGE` and the `ERROR*` family have a "confirm" button there, `UNREACH`,
 * `LOWBAT`, `CONFIG_PENDING`, `DUTY_CYCLE` and `UPDATE_PENDING` do not. 2.x had no acknowledgement
 * at all (it needs ReGa, D-2), so there is no code to compare against; task 6 checks it.
 */
export const ACKNOWLEDGEABLE_DATAPOINTS: readonly string[] = ['STICKY_UNREACH', 'SABOTAGE'];

/** Is this datapoint a service message at all? */
export function isServiceMessageDatapoint(datapoint: string): boolean {
    return SERVICE_MESSAGE_DATAPOINTS.includes(datapoint) || datapoint.startsWith(ERROR_DATAPOINT_PREFIX);
}

/** Can this service message be acknowledged, or does it only clear itself? */
export function isAcknowledgeable(datapoint: string): boolean {
    return ACKNOWLEDGEABLE_DATAPOINTS.includes(datapoint) || datapoint.startsWith(ERROR_DATAPOINT_PREFIX);
}

/**
 * `DUTY_CYCLE` is a service message only where it is a boolean. On HmIP the same name is also an
 * `INTEGER` datapoint carrying the percentage of the transmitter's duty cycle, and that is a
 * measurement, not a message (main.js:406 - "Not a Service Message!").
 */
export function countsAsServiceMessage(datapoint: string, value: ParamsetValue): boolean {
    if (!isServiceMessageDatapoint(datapoint)) {
        return false;
    }
    return datapoint !== 'DUTY_CYCLE' || typeof value === 'boolean';
}

/**
 * The `VALUE_LIST` name of an ENUM service message's value: `COMMUNICATION_ERROR` for a
 * `FAULT_REPORTING` of `4` (B-24). BidCos sends the index, HmIP may send the name itself; either
 * way the answer is the name, which is what the translations are keyed by
 * (`CLIMATECONTROL_RT_TRANSCEIVER|FAULT_REPORTING|COMMUNICATION_ERROR`). `undefined` when the
 * parameter is not an ENUM, has no such entry, or the entry is one of the empty gaps of a list.
 */
export function serviceMessageValueName(
    parameter: ParameterDescription | undefined,
    value: unknown,
): string | undefined {
    const list = parameter?.TYPE === 'ENUM' ? parameter.VALUE_LIST : undefined;
    if (list === undefined) {
        return undefined;
    }
    const name =
        typeof value === 'number' ? list[value] : typeof value === 'string' && list.includes(value) ? value : '';
    return name === undefined || name === '' ? undefined : name;
}

/**
 * One stored service message. The shape that crosses the transport is `ServiceMessage` in
 * `api/types.ts`; this is what the store keeps, with the device and the acknowledgeable flag
 * already resolved.
 */
export interface ServiceMessageRecord {
    readonly interfaceName: string;
    /** The channel the datapoint belongs to, usually `<device>:0`. */
    readonly address: string;
    /** The device the channel belongs to, for grouping in the grid. */
    readonly device: string;
    readonly datapoint: string;
    readonly value: ParamsetValue;
    readonly acknowledgeable: boolean;
    /** Milliseconds since the epoch, from the store's injected clock. */
    readonly timestamp: number;
}

/** One entry of a BidCos `getServiceMessages` answer. */
export type ServiceMessageTuple = readonly [address: string, datapoint: string, value: ParamsetValue];

export interface ServiceMessageStoreOptions {
    /** Injected clock; the core never calls `Date.now()` itself. */
    readonly now?: () => number;
}

/**
 * The current service messages of every interface.
 *
 * Keyed interface -> channel -> datapoint, like `localServiceMessages` in 2.x, so that the same
 * add/clear semantics apply: a truthy value sets, a falsy one removes, and the answer to
 * `getServiceMessages` is whatever is left.
 */
export class ServiceMessageStore {
    readonly #byInterface = new Map<string, Map<string, Map<string, ServiceMessageRecord>>>();
    readonly #now: () => number;

    constructor(options: ServiceMessageStoreOptions = {}) {
        this.#now = options.now ?? (() => 0);
    }

    /** How many messages are stored, over all interfaces. */
    get size(): number {
        let total = 0;
        for (const channels of this.#byInterface.values()) {
            for (const datapoints of channels.values()) {
                total += datapoints.size;
            }
        }
        return total;
    }

    /**
     * Applies one datapoint. Returns true when something changed, so a caller can decide whether
     * to notify the UI. A datapoint that is not a service message is ignored.
     */
    apply(
        interfaceName: string,
        address: string,
        datapoint: string,
        value: ParamsetValue,
        timestamp?: number,
    ): boolean {
        if (!countsAsServiceMessage(datapoint, value)) {
            return false;
        }
        return value
            ? this.#set(interfaceName, address, datapoint, value, timestamp)
            : this.clear(interfaceName, address, datapoint);
    }

    /** Applies an `event` callback; the same thing, named for the call site. */
    applyEvent(interfaceName: string, address: string, datapoint: string, value: ParamsetValue): boolean {
        return this.apply(interfaceName, address, datapoint, value);
    }

    /**
     * Applies a `getParamset(<device>:0, VALUES)` answer, which is how the HmIP list is built at
     * start-up: every service-message datapoint in it is applied, everything else ignored.
     */
    applyParamset(interfaceName: string, address: string, values: Paramset): boolean {
        let changed = false;
        for (const [datapoint, value] of Object.entries(values)) {
            changed = this.apply(interfaceName, address, datapoint, value) || changed;
        }
        return changed;
    }

    /**
     * Replaces everything an interface has with a fresh `getServiceMessages` answer.
     *
     * Issue #150: a message that is still there with the same value keeps the time it was first
     * seen. Rebuilding the map from scratch stamped every row with "now", so pressing Refresh
     * moved the "Since" column of six-day-old messages to this minute.
     */
    replaceInterface(interfaceName: string, tuples: readonly ServiceMessageTuple[]): void {
        const previous = new Map<string, ServiceMessageRecord>();
        for (const record of this.forInterface(interfaceName)) {
            previous.set(`${record.address}|${record.datapoint}`, record);
        }
        this.#byInterface.delete(interfaceName);
        for (const [address, datapoint, value] of tuples) {
            const kept = previous.get(`${address}|${datapoint}`);
            this.apply(interfaceName, address, datapoint, value, kept?.value === value ? kept.timestamp : undefined);
        }
    }

    /** Removes one message. Returns true when there was one. */
    clear(interfaceName: string, address: string, datapoint: string): boolean {
        const channels = this.#byInterface.get(interfaceName);
        const datapoints = channels?.get(address);
        if (!channels || !datapoints?.delete(datapoint)) {
            return false;
        }
        if (datapoints.size === 0) {
            channels.delete(address);
        }
        if (channels.size === 0) {
            this.#byInterface.delete(interfaceName);
        }
        return true;
    }

    /** Every message, interfaces in insertion order, channels and datapoints sorted. */
    list(): ServiceMessageRecord[] {
        const messages: ServiceMessageRecord[] = [];
        for (const channels of this.#byInterface.values()) {
            for (const [, datapoints] of sortByKey([...channels])) {
                for (const [, message] of sortByKey([...datapoints])) {
                    messages.push(message);
                }
            }
        }
        return messages;
    }

    /** The messages of one interface. */
    forInterface(interfaceName: string): ServiceMessageRecord[] {
        return this.list().filter((message) => message.interfaceName === interfaceName);
    }

    /** The messages of one device, whichever of its channels they sit on. */
    forDevice(device: string): ServiceMessageRecord[] {
        return this.list().filter((message) => message.device === device);
    }

    /**
     * The interface's messages in the tuple shape a BidCos `getServiceMessages` returns, which is
     * how the backend answers the call for HmIP (main.js:740-757).
     */
    toTuples(interfaceName: string): ServiceMessageTuple[] {
        return this.forInterface(interfaceName).map((message) => [message.address, message.datapoint, message.value]);
    }

    #set(interfaceName: string, address: string, datapoint: string, value: ParamsetValue, timestamp?: number): boolean {
        let channels = this.#byInterface.get(interfaceName);
        if (!channels) {
            channels = new Map();
            this.#byInterface.set(interfaceName, channels);
        }
        let datapoints = channels.get(address);
        if (!datapoints) {
            datapoints = new Map();
            channels.set(address, datapoints);
        }
        const existing = datapoints.get(datapoint);
        if (existing && existing.value === value) {
            return false;
        }
        datapoints.set(datapoint, {
            interfaceName,
            address,
            device: deviceAddress(address),
            datapoint,
            value,
            acknowledgeable: isAcknowledgeable(datapoint),
            timestamp: timestamp ?? this.#now(),
        });
        return true;
    }
}

/** Sorts map entries by their key; a Map has no duplicate keys, so there is no equal case. */
function sortByKey<T>(entries: Array<[string, T]>): Array<[string, T]> {
    return entries.sort(([a], [b]) => (a < b ? -1 : 1));
}
