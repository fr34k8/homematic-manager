import type {ParamsetDescription, ServiceMessage, Transport} from '@homematic-manager/core';
import {isAcknowledgeable, serviceMessageValueName} from '@homematic-manager/core';

import type {NoticesStore} from './NoticesStore.svelte.js';
import {readSuppressed, writeSuppressed} from './suppression.js';

/**
 * The service messages of every interface.
 *
 * The count in the tab label comes from here. 2.x popped a modal for every new message, which is
 * how it managed to close a paramset dialog the user was in the middle of (#77) - new messages now
 * land in the list and, at most, in a toast. (Task 26 removed the "quiet mode" of #102 that muted
 * the toast: Homematic has no such state for a service message, and what it does have - eQ-3's
 * suppression on the HmIP interface - lives in {@link suppressed} below.)
 */
export class ServiceMessagesStore {
    messages = $state<ServiceMessage[]>([]);
    loading = $state(false);
    /**
     * Task 26 (openccu-lite 28.9): per `<interface>|<channel>`, the service parameters whose
     * messages the HmIP server suppresses - `getSuppressedServiceMessages`, read for the channels
     * of the list on request. Only channels of an interface that offers the method appear here.
     */
    suppressed = $state<Record<string, string[]>>({});
    /** B-24: per `<interface>|<channel>`, the VALUES description of a channel whose message is a number. */
    descriptions = $state<Record<string, ParamsetDescription>>({});

    readonly #transport: Transport;
    readonly #notices: NoticesStore;
    readonly #unsubscribe: () => void;
    /** `<interface>|<address>|<datapoint>` of everything that has already been announced. */
    #announced: string[] = [];
    /** The first list is the state of the world, not news; nothing is announced for it. */
    #seeded = false;
    /** `<interface>|<address>` of every channel asked for its suppressed list, so an interface without the method is asked once. */
    #asked: string[] = [];
    /** `<interface>|<address>` of every channel whose description was asked for, answered or not. */
    #described: string[] = [];

    constructor(transport: Transport, notices: NoticesStore) {
        this.#transport = transport;
        this.#notices = notices;
        this.#unsubscribe = transport.on('serviceMessages.changed', (messages) => {
            this.apply(asList(messages));
        });
    }

    /**
     * Takes a new list and announces what is new in it.
     *
     * Issue #77: 2.x opened a modal for every arriving message, which closed whatever dialog the
     * user was in the middle of - a half-filled paramset editor included. A toast cannot do that.
     */
    apply(messages: ServiceMessage[]): void {
        const known = this.#announced;
        const fresh = messages.filter((message) => !known.includes(keyOf(message)));
        this.messages = messages;
        this.#announced = messages.map((message) => keyOf(message));
        if (!this.#seeded) {
            // Opening the app is not the moment to be told about six messages one toast at a time;
            // the tab counter and the list already say so.
            this.#seeded = true;
            return;
        }
        for (const message of fresh) {
            this.#notices.push('warn', `${message.address} ${message.datapoint}`, message.interfaceName);
        }
    }

    /** The messages of an interface that `serviceMessages.ack` can actually clear. */
    acknowledgeable(interfaceName: string): ServiceMessage[] {
        return this.of(interfaceName).filter((message) => isAcknowledgeable(message.datapoint));
    }

    of(interfaceName: string): ServiceMessage[] {
        return this.messages.filter((message) => message.interfaceName === interfaceName);
    }

    countOf(interfaceName: string): number {
        return this.of(interfaceName).length;
    }

    async load(interfaceName?: string): Promise<void> {
        this.loading = true;
        try {
            this.#applyFor(interfaceName, asList(await this.#transport.request('serviceMessages.list', interfaceName)));
        } catch (error) {
            this.#notices.fromError(error, 'serviceMessages.list');
        } finally {
            this.loading = false;
        }
    }

    /**
     * Issue #146: what the refresh button asks for - the interfaces are read again, not the
     * backend's cache. {@link load} answers from that cache, which the events and a five-minute
     * poll fill, so pressing refresh showed the list it already had and looked like a button
     * without a function.
     */
    async refresh(interfaceName?: string): Promise<void> {
        this.loading = true;
        try {
            this.#applyFor(
                interfaceName,
                asList(await this.#transport.request('serviceMessages.refresh', interfaceName)),
            );
        } catch (error) {
            this.#notices.fromError(error, 'serviceMessages.refresh');
        } finally {
            this.loading = false;
        }
    }

    /**
     * Task 36: an answer for one interface replaces that interface's messages and keeps the
     * others'. The tab's refresh asks for the selected interface only, and the backend answers with
     * that interface's list - taken as the whole list, it emptied every other interface until
     * their next event, and with them the band's total over the box.
     */
    #applyFor(interfaceName: string | undefined, messages: ServiceMessage[]): void {
        if (interfaceName === undefined) {
            this.apply(messages);
            return;
        }
        this.apply([
            ...this.messages.filter((message) => message.interfaceName !== interfaceName),
            ...messages.filter((message) => message.interfaceName === interfaceName),
        ]);
    }

    /** Acknowledges one message by writing its datapoint; the backend answers with the new list. */
    async acknowledge(interfaceName: string, address: string, datapoint: string): Promise<boolean> {
        try {
            await this.#transport.request('serviceMessages.ack', interfaceName, address, datapoint);
            return true;
        } catch (error) {
            this.#notices.fromError(error, `serviceMessages.ack ${address} ${datapoint}`);
            return false;
        }
    }

    /**
     * Acknowledges a whole selection. `STICKY_UNREACH` and `SABOTAGE` are the two the CCU lets an
     * application clear by writing the datapoint; everything else goes away when the cause does.
     */
    async acknowledgeMany(messages: ReadonlyArray<ServiceMessage>): Promise<number> {
        let done = 0;
        for (const message of messages) {
            if (!isAcknowledgeable(message.datapoint)) {
                continue;
            }
            if (await this.acknowledge(message.interfaceName, message.address, message.datapoint)) {
                done += 1;
            }
        }
        if (done > 0) {
            await this.load();
        }
        return done;
    }

    /** The suppressed parameters of a channel; `undefined` until read, or where there is no such method. */
    suppressedOf(interfaceName: string, address: string): string[] | undefined {
        return this.suppressed[suppressKey(interfaceName, address)];
    }

    /** Is this message's parameter currently suppressed on its channel? */
    isSuppressed(message: ServiceMessage): boolean {
        return this.suppressedOf(message.interfaceName, message.address)?.includes(message.datapoint) === true;
    }

    /**
     * Reads the suppressed list of every channel in the interface's list that has not been asked
     * yet. Called by the tab for an HmIP interface; a channel is asked once per session unless
     * {@link suppress} changes it, because the answer only moves when this application moves it.
     */
    async loadSuppressed(interfaceName: string): Promise<void> {
        const addresses = this.of(interfaceName)
            .map((message) => message.address)
            .filter((address, index, all) => all.indexOf(address) === index)
            .filter((address) => !this.#asked.includes(suppressKey(interfaceName, address)));
        await Promise.all(addresses.map((address) => this.#readSuppressed(interfaceName, address)));
    }

    /**
     * `suppressServiceMessages(channel, datapoint, suppress)` for one message of the list, then the
     * channel's list and the messages are read again - a suppressed `UNREACH` reports `false`, so
     * the row is expected to go away.
     */
    async suppress(interfaceName: string, address: string, datapoint: string, suppress: boolean): Promise<boolean> {
        try {
            await writeSuppressed(this.#transport, interfaceName, address, datapoint, suppress);
        } catch (error) {
            this.#notices.fromError(error, `suppressServiceMessages ${address} ${datapoint}`);
            return false;
        }
        await this.#readSuppressed(interfaceName, address);
        await this.load();
        return true;
    }

    /**
     * B-24: the `VALUE_LIST` name of an ENUM message's value (`COMMUNICATION_ERROR` for a
     * `FAULT_REPORTING` of 4), once {@link loadDescriptions} has read the channel; `undefined`
     * before that, for a value that is not an ENUM, or where the interface refused the read.
     */
    valueName(message: ServiceMessage): string | undefined {
        const description = this.descriptions[suppressKey(message.interfaceName, message.address)];
        return serviceMessageValueName(description?.[message.datapoint], message.value);
    }

    /**
     * Reads the VALUES description of every channel in the interface's list that carries a number
     * and has not been asked yet - a number is how an ENUM arrives from BidCos. A channel is asked
     * once per session: a description does not change while the device is paired. A failure is
     * silent, because the row still shows the raw value, which is what it showed before.
     */
    async loadDescriptions(interfaceName: string): Promise<void> {
        const addresses = this.of(interfaceName)
            .filter((message) => typeof message.value === 'number')
            .map((message) => message.address)
            .filter((address, index, all) => all.indexOf(address) === index)
            .filter((address) => !this.#described.includes(suppressKey(interfaceName, address)));
        this.#described = [...this.#described, ...addresses.map((address) => suppressKey(interfaceName, address))];
        await Promise.all(
            addresses.map(async (address) => {
                try {
                    const description = await this.#transport.request(
                        'paramset.description',
                        interfaceName,
                        address,
                        'VALUES',
                    );
                    this.descriptions = {...this.descriptions, [suppressKey(interfaceName, address)]: description};
                } catch {
                    // the raw value stays in the row
                }
            }),
        );
    }

    async #readSuppressed(interfaceName: string, address: string): Promise<void> {
        const key = suppressKey(interfaceName, address);
        if (!this.#asked.includes(key)) {
            this.#asked = [...this.#asked, key];
        }
        const list = await readSuppressed(this.#transport, interfaceName, address);
        if (list !== undefined) {
            this.suppressed = {...this.suppressed, [key]: list};
        }
    }

    dispose(): void {
        this.#unsubscribe();
    }
}

function keyOf(message: ServiceMessage): string {
    return `${message.interfaceName}|${message.address}|${message.datapoint}`;
}

function suppressKey(interfaceName: string, address: string): string {
    return `${interfaceName}|${address}`;
}

/**
 * `getServiceMessages` on rfd answers the empty **string** when there is nothing, not an empty
 * array (task 6, measured on hardware). The backend normalises its own reads, but an event carries
 * whatever the interface process produced, and one `.filter()` on a string is a blank tab.
 */
function asList(messages: unknown): ServiceMessage[] {
    return Array.isArray(messages) ? (messages as ServiceMessage[]) : [];
}
