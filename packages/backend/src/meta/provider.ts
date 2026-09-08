/**
 * The metadata provider: one interface, two implementations, the same public surface.
 *
 * D-40. `local` keeps names, rooms and functions in this profile - a user on Homegear, on a bare
 * rfd or on the desktop gets a taxonomy for the first time. `occulite` reads them from an
 * openccu-lite box, follows its change stream and **writes back**, because on that box this
 * application is the editor of the store: there is no ReGaHSS and no WebUI to do it instead.
 *
 * `rega` (task 27) is the third: on a CCU with ReGaHSS the rooms and functions are ReGa's own enum
 * objects, read and written through the script transport the names already use, so that one
 * editing UI serves a CCU and a box. A box that has ReGa never has a metadata API, so the three
 * never compete: the box's API wins when it answers, ReGa when it is on and answered, and `local`
 * is what every other system - Homegear, a bare rfd, the desktop without a CCU - gets.
 */

import type {MetaDocument, MetaEnum, MetaImportMode, MetaNodePatch, MetaState} from '@homematic-manager/core';

/** One name to write: the store's identity is the ref, not the bare address. */
export interface MetaNameEntry {
    readonly ref: string;
    readonly name: string;
}

/** The complete membership one object should have afterwards. */
export interface MetaMembershipEntry {
    readonly ref: string;
    readonly paths: readonly string[];
}

export interface MetaProviderEvents {
    /** The document changed - locally, or on the box because somebody else edited it. */
    readonly onChanged: () => void;
    /** Reachability, writability or the revision changed. */
    readonly onStateChanged: (state: MetaState) => void;
    readonly onNotice: (level: 'info' | 'warn' | 'error', message: string) => void;
}

/**
 * What the backend calls. Every write is asynchronous because one of the two implementations is a
 * box on the network; every read is synchronous because both keep the document in memory.
 */
export interface MetadataProvider {
    readonly kind: 'local' | 'occulite' | 'rega';
    state(): MetaState;
    /** Loads the document (a file, or the box's snapshot) and starts following changes. */
    start(): Promise<void>;
    stop(): Promise<void>;
    /**
     * Reads everything again.
     *
     * Called when the credential changes - on the box that is the moment a user opens the page and
     * the addon learns their session - so that names appear at once instead of at the next
     * reconnect of the event stream.
     */
    refresh(): Promise<void>;
    document(): MetaDocument;
    setNames(entries: readonly MetaNameEntry[]): Promise<void>;
    setMembership(entries: readonly MetaMembershipEntry[]): Promise<void>;
    createEnum(id: string, name: Readonly<Record<string, string>>): Promise<void>;
    updateEnum(id: string, name: Readonly<Record<string, string>>): Promise<void>;
    deleteEnum(id: string, detach: boolean): Promise<void>;
    /** Answers with the path the node got; the id is derived from the name by the caller. */
    createNode(
        enumId: string,
        parent: string | null,
        id: string,
        name: string,
        options: {readonly icon?: string; readonly position?: number},
    ): Promise<string>;
    updateNode(path: string, patch: MetaNodePatch): Promise<void>;
    deleteNode(path: string, detach: boolean): Promise<void>;
    import(document: unknown, mode: MetaImportMode): Promise<void>;
}

/** The enums of a document, for a caller that only wants the trees. */
export function enumsOf(document: MetaDocument): Readonly<Record<string, MetaEnum>> {
    return document.enums;
}
