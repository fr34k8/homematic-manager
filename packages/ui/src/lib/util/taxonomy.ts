/**
 * The pure part of the rooms-and-functions UI (task 25): what the grid column prints, what the
 * filter matches and whom a node's removal would touch. No DOM, no transport - `taxonomy.test.ts`
 * covers it directly.
 *
 * Everything here thinks in **refs** (`<interface>.<address>`), because that is the identity of the
 * metadata store, and in **paths** (`room/eg/wohnzimmer`), because that is how a membership is
 * spelled. The names a user sees come from `MetaObjectView.rooms` / `.functions`, which the backend
 * has already put into tree order.
 */

import {flattenEnum, pathMatches, type FlatNode, type MetaEnum, type MetaObjectView} from '@homematic-manager/core';

/** The two taxonomies the grid has columns for. Any other enum is reachable through the dialog only. */
export type TaxonomyId = 'room' | 'function';

export const TAXONOMY_IDS: readonly TaxonomyId[] = ['room', 'function'];

/** One entry of a node select or the tree list: the path, its name and how deep it sits. */
export interface NodeOption {
    readonly path: string;
    readonly label: string;
    readonly depth: number;
    readonly hasChildren: boolean;
}

/** The nodes of one enum, depth first, ready for an indented `<select>` or list. */
export function nodeOptions(enums: Readonly<Record<string, MetaEnum>>, enumId: string): NodeOption[] {
    const definition = enums[enumId];
    if (!definition) {
        return [];
    }
    return flattenEnum(enumId, definition).map((entry: FlatNode) => ({
        path: entry.path,
        label: entry.node.name,
        depth: entry.depth,
        hasChildren: (entry.node.children?.length ?? 0) > 0,
    }));
}

/** The label of a node with its depth drawn as indentation, for a `<select>` that cannot be styled. */
export function indentedLabel(option: NodeOption, indent = ' '): string {
    return `${indent.repeat(Math.max(0, option.depth - 1))}${option.label}`;
}

/** Is the object in `target`, or in anything below it? A parent node matches everything under it. */
export function objectMatches(view: MetaObjectView | undefined, target: string): boolean {
    return view !== undefined && view.enums.some((path) => pathMatches(path, target));
}

/**
 * Does a device row survive the filter: the device itself, or any of its channels.
 *
 * A room holds channels far more often than devices - ReGa only ever knew channels - so a filter
 * that hid the device row of a channel in the room would hide exactly what the user asked for.
 */
export function deviceMatches(
    device: MetaObjectView | undefined,
    channels: readonly (MetaObjectView | undefined)[],
    target: string,
): boolean {
    return objectMatches(device, target) || channels.some((channel) => objectMatches(channel, target));
}

/**
 * Whether a channel row is shown under a filtered device: the channel is in the target, or its
 * device is (then every channel is, by the subtree rule of the store).
 */
export function channelVisible(
    channel: MetaObjectView | undefined,
    device: MetaObjectView | undefined,
    target: string,
): boolean {
    return objectMatches(channel, target) || objectMatches(device, target);
}

/** The refs of every object in a node's subtree, for the list shown before the node is deleted. */
export function membersOf(objects: Readonly<Record<string, MetaObjectView>>, target: string): string[] {
    return Object.entries(objects)
        .filter(([, view]) => objectMatches(view, target))
        .map(([ref]) => ref)
        .sort((a, b) => a.localeCompare(b));
}

/** The names of one taxonomy an object carries, as the backend put them in tree order. */
export function namesOf(view: MetaObjectView | undefined, enumId: TaxonomyId): readonly string[] {
    if (view === undefined) {
        return [];
    }
    return enumId === 'room' ? view.rooms : view.functions;
}

/**
 * What the grid prints for a device: its own memberships, and where it has none the union of its
 * channels' - a device whose channels sit in three rooms says so in its row, without repetition and
 * in the order the channels come.
 */
export function deviceNames(
    device: MetaObjectView | undefined,
    channels: readonly (MetaObjectView | undefined)[],
    enumId: TaxonomyId,
): string[] {
    const own = namesOf(device, enumId);
    if (own.length > 0) {
        return [...own];
    }
    const names: string[] = [];
    for (const channel of channels) {
        for (const name of namesOf(channel, enumId)) {
            if (!names.includes(name)) {
                names.push(name);
            }
        }
    }
    return names;
}

/**
 * The target of a move, as the store wants it: `null` for the root, else the parent's path. A node
 * may not be moved under itself or under one of its descendants.
 */
export function canMoveUnder(path: string, parent: string | null): boolean {
    return parent === null || !pathMatches(parent, path);
}
