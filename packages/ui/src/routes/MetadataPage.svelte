<script lang="ts">
    import {parseRef} from '@homematic-manager/core';

    import {getStores} from '../lib/stores/context.js';
    import type {MetadataActions} from '../lib/util/metaTree.js';
    import type {TaxonomyId} from '../lib/util/taxonomy.js';

    import MetadataEditor from './meta/MetadataEditor.svelte';

    /**
     * The pages of the metadata store when it is the selection of the interface picker (the
     * maintainer, 2026-09-10): "Rooms" and "Functions" on ReGaHSS - `enumId` given - and the
     * "Metadata" tree on occulited. This is the app's side of the seam: it wires the stores into
     * the editor, which knows none of them.
     */
    interface Props {
        enumId?: TaxonomyId | undefined;
    }

    let {enumId = undefined}: Props = $props();

    const stores = getStores();
    const t = stores.i18n.t;
    const taxonomy = $derived(stores.taxonomy);

    const actions: MetadataActions = {
        createEnum: (id, name) => stores.taxonomy.createEnum(id, name),
        renameEnum: (id, name) => stores.taxonomy.renameEnum(id, name),
        deleteEnum: (id, detach) => stores.taxonomy.deleteEnum(id, detach),
        createNode: (id, parent, name) => stores.taxonomy.createNode(id, parent, name),
        renameNode: (path, name) => stores.taxonomy.renameNode(path, name),
        moveNode: (path, parent) => stores.taxonomy.moveNode(path, parent),
        deleteNode: (path, detach) => stores.taxonomy.deleteNode(path, detach),
        refresh: () => stores.taxonomy.refresh(),
    };

    /** A member in the delete dialog: its name and its address, or the address alone. */
    function labelOf(ref: string): string {
        const address = parseRef(ref)?.address ?? ref;
        const known = stores.names.name(address);
        return known === undefined ? address : `${known} (${address})`;
    }

    const emptyText = $derived(
        enumId === 'room' ? t('No rooms yet') : enumId === 'function' ? t('No functions yet') : t('No taxonomies yet'),
    );

    function countText(count: number): string {
        switch (enumId) {
            case 'room':
                return t('{count} rooms', {}, count);
            case 'function':
                return t('{count} functions', {}, count);
            default:
                return t('{count} taxonomies', {}, count);
        }
    }
</script>

<MetadataEditor
    enums={taxonomy.enums}
    objects={taxonomy.objects}
    {enumId}
    flat={taxonomy.flatOnly}
    available={taxonomy.available}
    writable={taxonomy.writable}
    language={stores.i18n.language}
    {t}
    {actions}
    {labelOf}
    {emptyText}
    {countText}
    tableId={enumId === undefined ? 'meta' : `meta-${enumId}`}
    testId={enumId === undefined ? 'meta-table' : `meta-table-${enumId}`}
/>
