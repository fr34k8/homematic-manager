/**
 * The `rega` metadata provider (task 27): the CCU's own rooms and functions, through ReGaHSS.
 *
 * On a CCU the rooms and functions the user sees in the WebUI live in ReGa's DOM - enum objects
 * under `ID_ROOMS` and `ID_FUNCTIONS`, each holding channel ids - and a taxonomy kept in this
 * profile beside them would be a second truth. So on a CCU with ReGa this provider *is* the store:
 * the same {@link MetadataProvider} surface the box's provider has, over the same script transport
 * the names already use, so that the editing UI of task 25 does not know which one it talks to.
 *
 * What ReGa's model is, and therefore what this provider is:
 *
 * - **Flat.** A room is a room; there is no room below another and no floor. `state().flat` says
 *   so, `createNode` with a parent and a move under a parent are refused.
 * - **Two taxonomies, fixed.** Rooms and functions exist; nothing else can be created or deleted.
 * - **Channels are members, devices are not.** The WebUI assigns channels. A device ref in a
 *   membership write is applied to every channel of the device except the `:0` maintenance
 *   channel, which is what a user who "puts the device in the kitchen" means.
 * - **Identity is the ReGa id.** A node's id is `r<id>`, stable across renames, so a path never
 *   has to be rewritten when a room is renamed.
 * - **No change stream.** ReGa tells nobody when the WebUI edits a room. This provider reads
 *   everything on `start()`, after every write of its own, and on `refresh()`, which the UI asks
 *   for through `meta.refresh`.
 *
 * Failure is a state, never an exception (D-2): a script that does not run leaves the last
 * document in place, sets `reachable: false` and says so once.
 */

import {
    MetaError,
    makeRef,
    normaliseName,
    parsePath,
    type MetaDocument,
    type MetaEnum,
    type MetaNode,
    type MetaNodePatch,
    type MetaObject,
    type MetaState,
} from '@homematic-manager/core';

import {errorMessage} from '../errors.js';
import {
    createEnumNodeScript,
    deleteEnumNodeScript,
    membershipScript,
    META_READ_SCRIPT,
    parseCreatedId,
    parseMetaSnapshot,
    renameObjectsScript,
    type RegaEnumKind,
    type RegaMembershipChange,
    type RegaMetaSnapshot,
} from '../rega/scripts.js';
import type {MetadataProvider, MetaMembershipEntry, MetaNameEntry, MetaProviderEvents} from './provider.js';

/** The part of the ReGa transport this provider uses: run a script, read what it wrote. */
export type RegaScriptRunner = (script: string) => Promise<{output: string}>;

export interface RegaMetaProviderOptions extends MetaProviderEvents {
    readonly exec: RegaScriptRunner;
    /**
     * The interface an address belongs to, from the device caches - the fallback for a device
     * whose interface ReGa does not name (an older firmware, a CUxD device).
     */
    readonly interfaceOf: (address: string) => string | undefined;
}

/** What the provider keeps per device or channel. */
interface RegaObject {
    readonly id: number;
    readonly address: string;
    readonly ref: string;
    name: string;
}

/** One room or function, with the channel ids in it. */
interface RegaEnumNode {
    readonly id: number;
    name: string;
    readonly channels: Set<number>;
}

const ENUM_NAMES: Readonly<Record<RegaEnumKind, Readonly<Record<string, string>>>> = {
    room: {de: 'Räume', en: 'Rooms'},
    function: {de: 'Gewerke', en: 'Functions'},
};

/** `r4711` - the node id of a ReGa enum object; stable across renames. */
export function regaNodeId(id: number): string {
    return `r${String(id)}`;
}

/** The ReGa id behind a node id, or `undefined` for anything that is not one. */
export function parseRegaNodeId(id: string): number | undefined {
    const match = /^r(\d+)$/.exec(id);
    return match ? Number(match[1]) : undefined;
}

export class RegaMetaProvider implements MetadataProvider {
    readonly kind = 'rega' as const;
    readonly #options: RegaMetaProviderOptions;
    /** By ref. */
    readonly #objects = new Map<string, RegaObject>();
    /** By ReGa id, for the membership sets. */
    readonly #byId = new Map<number, RegaObject>();
    readonly #enums: Record<RegaEnumKind, Map<number, RegaEnumNode>> = {room: new Map(), function: new Map()};
    #document: MetaDocument | undefined;
    #revision = 0;
    #reachable = false;
    #error: string | undefined;
    #lastNotice = '';

    constructor(options: RegaMetaProviderOptions) {
        this.#options = options;
    }

    state(): MetaState {
        return {
            provider: 'rega',
            reachable: this.#reachable,
            // ReGa takes every write from whoever may run a script; there is no read-only credential
            writable: this.#reachable,
            revision: this.#revision,
            objects: this.#objects.size,
            flat: true,
            ...(this.#error === undefined ? {} : {error: this.#error}),
        };
    }

    async start(): Promise<void> {
        await this.refresh();
    }

    stop(): Promise<void> {
        return Promise.resolve();
    }

    /** Reads everything again. Never throws: a ReGa that does not answer is a state. */
    async refresh(): Promise<void> {
        let snapshot: RegaMetaSnapshot;
        try {
            const answer = await this.#options.exec(META_READ_SCRIPT);
            snapshot = parseMetaSnapshot(answer.output);
        } catch (error) {
            this.#fail(error);
            return;
        }
        this.#load(snapshot);
        this.#reachable = true;
        this.#error = undefined;
        this.#lastNotice = '';
        this.#revision += 1;
        this.#announce();
    }

    document(): MetaDocument {
        this.#document ??= this.#build();
        return this.#document;
    }

    async setNames(entries: readonly MetaNameEntry[]): Promise<void> {
        const renames: {object: RegaObject; name: string}[] = [];
        for (const entry of entries) {
            const object = this.#objects.get(entry.ref);
            if (object === undefined) {
                // an address ReGa has never reported can only be named locally, as before (D-2)
                continue;
            }
            const name = normaliseName(entry.name);
            if (name !== object.name) {
                renames.push({object, name});
            }
        }
        const script = renameObjectsScript(renames.map((entry) => ({id: entry.object.id, name: entry.name})));
        if (script === undefined) {
            return;
        }
        await this.#run(script);
        for (const entry of renames) {
            entry.object.name = entry.name;
        }
        this.#commit();
    }

    async setMembership(entries: readonly MetaMembershipEntry[]): Promise<void> {
        const changes: RegaMembershipChange[] = [];
        for (const entry of entries) {
            const wanted = this.#targetsOf(entry.paths);
            for (const object of this.#membersFor(entry.ref)) {
                for (const kind of ['room', 'function'] as const) {
                    for (const [id, node] of this.#enums[kind]) {
                        const has = node.channels.has(object.id);
                        const should = wanted[kind].has(id);
                        if (has !== should) {
                            changes.push({enumId: id, channelId: object.id, on: should});
                        }
                    }
                }
            }
        }
        const script = membershipScript(changes);
        if (script === undefined) {
            return;
        }
        await this.#run(script);
        for (const change of changes) {
            const node = this.#nodeById(change.enumId);
            if (node) {
                if (change.on) {
                    node.channels.add(change.channelId);
                } else {
                    node.channels.delete(change.channelId);
                }
            }
        }
        this.#commit();
    }

    createEnum(): Promise<void> {
        return Promise.reject(fixedEnums());
    }

    updateEnum(): Promise<void> {
        return Promise.reject(fixedEnums());
    }

    deleteEnum(): Promise<void> {
        return Promise.reject(fixedEnums());
    }

    /**
     * A new room or function. The id the caller derived from the name is not used: ReGa hands out
     * the id, and `r<id>` is what keeps the path stable when the room is renamed later.
     */
    async createNode(enumId: string, parent: string | null, _id: string, name: string): Promise<string> {
        const kind = requireKind(enumId);
        if (parent !== null && parent !== enumId) {
            throw new MetaError('too-deep', 'ReGa rooms and functions are a flat list: no node below another');
        }
        const nodeName = normaliseName(name);
        const answer = await this.#run(createEnumNodeScript(kind, nodeName));
        const id = parseCreatedId(answer.output);
        if (id === undefined) {
            // the object may or may not exist now; the next read says which
            await this.refresh();
            throw new MetaError('unknown-path', `ReGa did not answer with the id of the new ${kind}`);
        }
        this.#enums[kind].set(id, {id, name: nodeName, channels: new Set()});
        this.#commit();
        return `${kind}/${regaNodeId(id)}`;
    }

    async updateNode(path: string, patch: MetaNodePatch): Promise<void> {
        const {kind, node} = this.#requireNode(path);
        if (patch.parent !== undefined && patch.parent !== null && patch.parent !== kind) {
            throw new MetaError(
                'invalid-move',
                'ReGa rooms and functions are a flat list: nothing can be moved below another',
            );
        }
        // `icon` and `position` have no counterpart in ReGa and are accepted without effect
        if (patch.name === undefined) {
            return;
        }
        const name = normaliseName(patch.name);
        if (name === node.name) {
            return;
        }
        const script = renameObjectsScript([{id: node.id, name}]);
        if (script === undefined) {
            return;
        }
        await this.#run(script);
        node.name = name;
        this.#commit();
    }

    async deleteNode(path: string, detach: boolean): Promise<void> {
        const {kind, node} = this.#requireNode(path);
        const refs = [...node.channels]
            .map((id) => this.#byId.get(id)?.ref)
            .filter((ref): ref is string => ref !== undefined)
            .sort((a, b) => a.localeCompare(b));
        if (refs.length > 0 && !detach) {
            throw new MetaError('has-members', `${path} still has members`, {refs});
        }
        await this.#run(deleteEnumNodeScript(kind, node.id));
        this.#enums[kind].delete(node.id);
        this.#commit();
    }

    import(): Promise<void> {
        return Promise.reject(new MetaError('forbidden', 'a ReGa store cannot be replaced by an import'));
    }

    /*
     * the model
     */

    #load(snapshot: RegaMetaSnapshot): void {
        this.#objects.clear();
        this.#byId.clear();
        for (const entry of snapshot.objects) {
            const interfaceName =
                entry.interfaceName !== '' ? entry.interfaceName : this.#options.interfaceOf(entry.address);
            if (interfaceName === undefined || interfaceName === '') {
                // no ref without an interface; the name cache still gets it through ReGa's names
                continue;
            }
            const object: RegaObject = {
                id: entry.id,
                address: entry.address,
                ref: makeRef(interfaceName, entry.address),
                name: entry.name,
            };
            this.#objects.set(object.ref, object);
            this.#byId.set(object.id, object);
        }
        for (const kind of ['room', 'function'] as const) {
            const nodes = this.#enums[kind];
            nodes.clear();
            for (const entry of kind === 'room' ? snapshot.rooms : snapshot.functions) {
                nodes.set(entry.id, {id: entry.id, name: entry.name, channels: new Set(entry.channels)});
            }
        }
        this.#document = undefined;
    }

    /** The document as the rest of the application reads it, rebuilt lazily after a change. */
    #build(): MetaDocument {
        const objects: Record<string, MetaObject> = {};
        for (const object of this.#objects.values()) {
            const paths: string[] = [];
            for (const kind of ['room', 'function'] as const) {
                for (const node of this.#enums[kind].values()) {
                    if (node.channels.has(object.id)) {
                        paths.push(`${kind}/${regaNodeId(node.id)}`);
                    }
                }
            }
            objects[object.ref] = {name: object.name, enums: paths, meta: {}};
        }
        const enums: Record<string, MetaEnum> = {};
        for (const kind of ['room', 'function'] as const) {
            const tree: MetaNode[] = [...this.#enums[kind].values()]
                .sort((a, b) => a.name.localeCompare(b.name, 'de') || a.id - b.id)
                .map((node) => ({id: regaNodeId(node.id), name: node.name}));
            enums[kind] = {name: {...ENUM_NAMES[kind]}, tree};
        }
        return {format: 1, revision: this.#revision, objects, enums};
    }

    /** The channels a membership write addresses: the channel itself, or every channel of a device. */
    #membersFor(ref: string): RegaObject[] {
        const object = this.#objects.get(ref);
        if (object === undefined) {
            throw new MetaError('unknown-object', `${ref} is not known to ReGa`);
        }
        if (object.address.includes(':')) {
            return [object];
        }
        const prefix = `${object.address}:`;
        return [...this.#objects.values()].filter(
            (candidate) => candidate.address.startsWith(prefix) && !candidate.address.endsWith(':0'),
        );
    }

    /** The ReGa ids the wanted paths name, per kind; a path that is not a node here is refused. */
    #targetsOf(paths: readonly string[]): Record<RegaEnumKind, Set<number>> {
        const targets: Record<RegaEnumKind, Set<number>> = {room: new Set(), function: new Set()};
        for (const path of paths) {
            const {kind, node} = this.#requireNode(path);
            targets[kind].add(node.id);
        }
        return targets;
    }

    #requireNode(path: string): {kind: RegaEnumKind; node: RegaEnumNode} {
        const parsed = parsePath(path);
        const kind = parsed === undefined ? undefined : toKind(parsed.enumId);
        const id = parsed?.ids.length === 1 ? parseRegaNodeId(parsed.ids[0] ?? '') : undefined;
        const node = kind === undefined || id === undefined ? undefined : this.#enums[kind].get(id);
        if (kind === undefined || node === undefined) {
            throw new MetaError('unknown-path', `${path} is not a room or function of this CCU`);
        }
        return {kind, node};
    }

    #nodeById(id: number): RegaEnumNode | undefined {
        return this.#enums.room.get(id) ?? this.#enums.function.get(id);
    }

    /** One script, with the outcome reflected in the state; the error goes on to the caller. */
    async #run(script: string): Promise<{output: string}> {
        try {
            const answer = await this.#options.exec(script);
            if (!this.#reachable) {
                this.#reachable = true;
                this.#error = undefined;
                this.#options.onStateChanged(this.state());
            }
            return answer;
        } catch (error) {
            this.#fail(error);
            throw error;
        }
    }

    #commit(): void {
        this.#document = undefined;
        this.#revision += 1;
        this.#announce();
    }

    #announce(): void {
        this.#options.onStateChanged(this.state());
        this.#options.onChanged();
    }

    #fail(error: unknown): void {
        const message = errorMessage(error);
        this.#reachable = false;
        this.#error = message;
        this.#options.onStateChanged(this.state());
        if (message !== this.#lastNotice) {
            this.#lastNotice = message;
            this.#options.onNotice('warn', `ReGa did not answer the rooms and functions script: ${message}`);
        }
    }
}

function toKind(enumId: string): RegaEnumKind | undefined {
    return enumId === 'room' || enumId === 'function' ? enumId : undefined;
}

function requireKind(enumId: string): RegaEnumKind {
    const kind = toKind(enumId);
    if (kind === undefined) {
        throw new MetaError('unknown-enum', `${enumId}: ReGa has rooms and functions and nothing else`);
    }
    return kind;
}

function fixedEnums(): MetaError {
    return new MetaError(
        'forbidden',
        'ReGa has a fixed set of taxonomies - rooms and functions - that cannot be changed',
    );
}
