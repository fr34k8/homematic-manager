/**
 * Task 27: the ReGa metadata provider against a scripted ReGa.
 *
 * The transport is a function that records every script and answers the read script from a
 * fixture that changes as the "CCU" is written to - so a write followed by the provider's own
 * bookkeeping can be checked against what a real read would answer afterwards.
 */

import {describe, expect, it} from 'vitest';

import {isMetaError, type MetaState} from '@homematic-manager/core';

import {META_READ_SCRIPT} from '../rega/scripts.js';
import {parseRegaNodeId, RegaMetaProvider, regaNodeId, regaStockName} from './regaProvider.js';

interface FakeRega {
    readonly scripts: string[];
    snapshot: {
        objects: {id: number; address: string; interface: string; name: string}[];
        rooms: {id: number; name: string; channels: number[]}[];
        functions: {id: number; name: string; channels: number[]}[];
    };
    /** What the next non-read script answers; `Error` makes it fail. */
    answer: string | Error;
    offline: boolean;
}

function fakeRega(): FakeRega {
    return {
        scripts: [],
        snapshot: {
            objects: [
                {id: 100, address: 'ABC1', interface: 'BidCos-RF', name: 'Lampe'},
                {id: 101, address: 'ABC1:0', interface: 'BidCos-RF', name: 'Lampe:0'},
                {id: 102, address: 'ABC1:1', interface: 'BidCos-RF', name: 'Lampe:1'},
                {id: 103, address: 'ABC1:2', interface: 'BidCos-RF', name: 'Lampe:2'},
                {id: 200, address: '0001D3C9', interface: 'HmIP-RF', name: 'Taster'},
                {id: 201, address: '0001D3C9:1', interface: 'HmIP-RF', name: 'Taster:1'},
                {id: 300, address: 'CUX1', interface: '', name: 'CUxD'},
            ],
            rooms: [
                {id: 1000, name: 'K%FCche', channels: [102]},
                {id: 1001, name: 'Bad', channels: []},
            ],
            functions: [{id: 2000, name: 'Licht', channels: [102, 201]}],
        },
        answer: '',
        offline: false,
    };
}

function build(
    rega: FakeRega,
    language?: 'de' | 'en',
): {
    provider: RegaMetaProvider;
    states: MetaState[];
    notices: string[];
    changes: number[];
} {
    const states: MetaState[] = [];
    const notices: string[] = [];
    const changes: number[] = [];
    const provider = new RegaMetaProvider({
        language,
        exec: (script) => {
            rega.scripts.push(script);
            if (rega.offline) {
                return Promise.reject(new Error('rega http status 503'));
            }
            if (script === META_READ_SCRIPT) {
                return Promise.resolve({output: JSON.stringify(rega.snapshot)});
            }
            return rega.answer instanceof Error ? Promise.reject(rega.answer) : Promise.resolve({output: rega.answer});
        },
        interfaceOf: (address) => (address === 'CUX1' ? 'CUxD' : undefined),
        onChanged: () => {
            changes.push(provider.state().revision);
        },
        onStateChanged: (state) => states.push(state),
        onNotice: (_level, message) => notices.push(message),
    });
    return {provider, states, notices, changes};
}

async function started(): Promise<ReturnType<typeof build> & {rega: FakeRega}> {
    const rega = fakeRega();
    const built = build(rega);
    await built.provider.start();
    return {...built, rega};
}

describe('node ids', () => {
    it('are the ReGa id behind an r, stable across renames', () => {
        expect(regaNodeId(4711)).toBe('r4711');
        expect(parseRegaNodeId('r4711')).toBe(4711);
        expect(parseRegaNodeId('kueche')).toBeUndefined();
        expect(parseRegaNodeId('r')).toBeUndefined();
    });
});

describe('reading', () => {
    it('is unreachable, flat and empty before the first read', () => {
        const {provider} = build(fakeRega());
        expect(provider.kind).toBe('rega');
        expect(provider.state()).toEqual({
            provider: 'rega',
            reachable: false,
            writable: false,
            revision: 0,
            objects: 0,
            flat: true,
        });
        expect(provider.document().enums['room']?.tree).toEqual([]);
    });

    it("turns ReGa's lists into the document: refs, decoded names, flat trees, memberships", async () => {
        const {provider, rega, states, changes} = await started();
        expect(rega.scripts).toEqual([META_READ_SCRIPT]);
        expect(provider.state()).toMatchObject({reachable: true, writable: true, revision: 1, objects: 7, flat: true});
        expect(states.at(-1)?.revision).toBe(1);
        expect(changes).toEqual([1]);

        const document = provider.document();
        expect(Object.keys(document.enums).sort()).toEqual(['function', 'room']);
        // sorted by name, as the WebUI lists them; ids are ReGa's
        expect(document.enums['room']?.tree).toEqual([
            {id: 'r1001', name: 'Bad'},
            {id: 'r1000', name: 'Küche'},
        ]);
        expect(document.enums['function']?.tree).toEqual([{id: 'r2000', name: 'Licht'}]);
        expect(document.objects['BidCos-RF.ABC1:1']).toEqual({
            name: 'Lampe:1',
            enums: ['room/r1000', 'function/r2000'],
            meta: {},
        });
        expect(document.objects['HmIP-RF.0001D3C9:1']?.enums).toEqual(['function/r2000']);
        expect(document.objects['BidCos-RF.ABC1']?.enums).toEqual([]);
        // a device whose interface ReGa does not name gets it from the device caches
        expect(document.objects['CUxD.CUX1']?.name).toBe('CUxD');
    });

    it('drops an object it cannot build a ref for, and keeps the rest', async () => {
        const rega = fakeRega();
        rega.snapshot.objects.push({id: 400, address: 'NOIFACE', interface: '', name: 'x'});
        const {provider} = build(rega);
        await provider.start();
        expect(provider.document().objects['NOIFACE']).toBeUndefined();
        expect(provider.state().objects).toBe(7);
    });

    it('keeps the last document and says so once when ReGa stops answering, then recovers', async () => {
        const {provider, rega, notices} = await started();
        rega.offline = true;
        await provider.refresh();
        await provider.refresh();
        expect(provider.state()).toMatchObject({reachable: false, writable: false, error: 'rega http status 503'});
        expect(provider.document().objects['BidCos-RF.ABC1:1']?.name).toBe('Lampe:1');
        expect(notices).toEqual(['ReGa did not answer the rooms and functions script: rega http status 503']);

        rega.offline = false;
        await provider.refresh();
        expect(provider.state()).toMatchObject({reachable: true, writable: true});
        expect(provider.state().error).toBeUndefined();
    });

    it('treats an answer that is not the document as a failure', async () => {
        const rega = fakeRega();
        const {provider, notices} = build(rega);
        rega.snapshot = {objects: [], rooms: [], functions: []};
        await provider.start();
        expect(provider.state().reachable).toBe(true);
        (rega as {snapshot: unknown}).snapshot = 'not a document';
        await provider.refresh();
        expect(provider.state().reachable).toBe(false);
        expect(notices[0]).toContain('no document');
    });

    it('sees a room made in the WebUI on the next refresh - there is no change stream', async () => {
        const {provider, rega} = await started();
        rega.snapshot.rooms.push({id: 1002, name: 'Flur', channels: [103]});
        expect(provider.document().enums['room']?.tree).toHaveLength(2);
        await provider.refresh();
        expect(provider.document().enums['room']?.tree).toHaveLength(3);
        expect(provider.document().objects['BidCos-RF.ABC1:2']?.enums).toEqual(['room/r1002']);
        expect(provider.state().revision).toBe(2);
    });
});

describe('names', () => {
    it('renames through Name() by ReGa id, skips the unknown and the unchanged', async () => {
        const {provider, rega} = await started();
        await provider.setNames([
            {ref: 'BidCos-RF.ABC1', name: ' Deckenlampe '},
            {ref: 'BidCos-RF.ABC1:1', name: 'Lampe:1'},
            {ref: 'BidCos-RF.UNKNOWN', name: 'x'},
        ]);
        expect(rega.scripts.at(-1)).toBe('dom.GetObject(100).Name("Deckenlampe");\n');
        expect(provider.document().objects['BidCos-RF.ABC1']?.name).toBe('Deckenlampe');
        expect(provider.state().revision).toBe(2);
    });

    it('sends nothing when there is nothing to change', async () => {
        const {provider, rega} = await started();
        await provider.setNames([{ref: 'BidCos-RF.ABC1:1', name: 'Lampe:1'}]);
        expect(rega.scripts).toHaveLength(1);
        expect(provider.state().revision).toBe(1);
    });

    it('refuses a name ReGa could not store and reports a script that failed', async () => {
        const {provider, rega} = await started();
        await expect(provider.setNames([{ref: 'BidCos-RF.ABC1', name: '  '}])).rejects.toThrow('empty');
        rega.answer = new Error('rega http status 500');
        await expect(provider.setNames([{ref: 'BidCos-RF.ABC1', name: 'x'}])).rejects.toThrow('500');
        expect(provider.state().reachable).toBe(false);
        expect(provider.document().objects['BidCos-RF.ABC1']?.name).toBe('Lampe');
    });
});

describe('membership', () => {
    it('adds and removes a channel with one Add/Remove per change, and keeps its own books', async () => {
        const {provider, rega, changes} = await started();
        await provider.setMembership([{ref: 'BidCos-RF.ABC1:1', paths: ['room/r1001', 'function/r2000']}]);
        expect(rega.scripts.at(-1)).toBe('dom.GetObject(1000).Remove(102);\ndom.GetObject(1001).Add(102);\n');
        expect(provider.document().objects['BidCos-RF.ABC1:1']?.enums).toEqual(['room/r1001', 'function/r2000']);
        expect(changes).toEqual([1, 2]);
    });

    it('puts every channel of a device but :0 into the room when the ref is the device', async () => {
        const {provider, rega} = await started();
        await provider.setMembership([{ref: 'BidCos-RF.ABC1', paths: ['room/r1001']}]);
        expect(rega.scripts.at(-1)).toBe(
            'dom.GetObject(1000).Remove(102);\n' +
                'dom.GetObject(1001).Add(102);\n' +
                'dom.GetObject(2000).Remove(102);\n' +
                'dom.GetObject(1001).Add(103);\n',
        );
        expect(provider.document().objects['BidCos-RF.ABC1:0']?.enums).toEqual([]);
        expect(provider.document().objects['BidCos-RF.ABC1:2']?.enums).toEqual(['room/r1001']);
    });

    it('sends nothing for a membership that already is what it should be', async () => {
        const {provider, rega} = await started();
        await provider.setMembership([{ref: 'BidCos-RF.ABC1:1', paths: ['room/r1000', 'function/r2000']}]);
        expect(rega.scripts).toHaveLength(1);
    });

    it('refuses an unknown object and a path that is not a room or function here', async () => {
        const {provider} = await started();
        await expect(provider.setMembership([{ref: 'BidCos-RF.NOPE', paths: []}])).rejects.toMatchObject({
            code: 'unknown-object',
        });
        await expect(provider.setMembership([{ref: 'BidCos-RF.ABC1:1', paths: ['room/kueche']}])).rejects.toMatchObject(
            {code: 'unknown-path'},
        );
        await expect(provider.setMembership([{ref: 'BidCos-RF.ABC1:1', paths: ['floor/r1000']}])).rejects.toMatchObject(
            {code: 'unknown-path'},
        );
    });
});

describe('nodes', () => {
    it('creates a room as an enum object and answers with the id ReGa gave it', async () => {
        const {provider, rega} = await started();
        rega.answer = '1002';
        await expect(provider.createNode('room', null, 'flur', 'Flur')).resolves.toBe('room/r1002');
        expect(rega.scripts.at(-1)).toContain('dom.GetObject(ID_ROOMS).Add(oNew.ID());');
        expect(rega.scripts.at(-1)).toContain('oNew.Name("Flur");');
        expect(provider.document().enums['room']?.tree.map((node) => node.name)).toEqual(['Bad', 'Flur', 'Küche']);
        rega.answer = '2001';
        await expect(provider.createNode('function', 'function', 'x', 'Heizung')).resolves.toBe('function/r2001');
    });

    it('refuses a parent, an unknown enum and an empty name', async () => {
        const {provider} = await started();
        await expect(provider.createNode('room', 'room/r1000', 'x', 'Unter')).rejects.toMatchObject({
            code: 'too-deep',
        });
        await expect(provider.createNode('floor', null, 'x', 'EG')).rejects.toMatchObject({code: 'unknown-enum'});
        await expect(provider.createNode('room', null, 'x', ' ')).rejects.toMatchObject({code: 'invalid-name'});
    });

    it('reads again and refuses when ReGa answers without an id', async () => {
        const {provider, rega} = await started();
        rega.answer = 'Error 42';
        await expect(provider.createNode('room', null, 'x', 'Flur')).rejects.toMatchObject({code: 'unknown-path'});
        expect(rega.scripts.filter((script) => script === META_READ_SCRIPT)).toHaveLength(2);
    });

    it('renames a node, ignores icon and position, refuses a move below another', async () => {
        const {provider, rega} = await started();
        await provider.updateNode('room/r1000', {name: 'Kochen', icon: 'x', position: 3});
        expect(rega.scripts.at(-1)).toBe('dom.GetObject(1000).Name("Kochen");\n');
        expect(provider.document().enums['room']?.tree.find((node) => node.id === 'r1000')?.name).toBe('Kochen');
        // the members keep their path: the id is ReGa's, not the name's
        expect(provider.document().objects['BidCos-RF.ABC1:1']?.enums).toContain('room/r1000');

        await provider.updateNode('room/r1000', {parent: null});
        await provider.updateNode('room/r1000', {parent: 'room'});
        await expect(provider.updateNode('room/r1000', {parent: 'room/r1001'})).rejects.toMatchObject({
            code: 'invalid-move',
        });
        await expect(provider.updateNode('room/r9', {name: 'x'})).rejects.toMatchObject({code: 'unknown-path'});
        // the same name again is not a write
        const before = rega.scripts.length;
        await provider.updateNode('room/r1000', {name: 'Kochen'});
        expect(rega.scripts).toHaveLength(before);
    });

    it('deletes an empty node, lists the members of a full one, and detaches on request', async () => {
        const {provider, rega} = await started();
        await provider.deleteNode('room/r1001', false);
        expect(rega.scripts.at(-1)).toContain('dom.DeleteObject(1001)');
        expect(provider.document().enums['room']?.tree.map((node) => node.id)).toEqual(['r1000']);

        let refused: unknown;
        try {
            await provider.deleteNode('function/r2000', false);
        } catch (error) {
            refused = error;
        }
        expect(isMetaError(refused) && refused.code).toBe('has-members');
        expect(isMetaError(refused) && refused.detail).toEqual({refs: ['BidCos-RF.ABC1:1', 'HmIP-RF.0001D3C9:1']});

        await provider.deleteNode('function/r2000', true);
        expect(rega.scripts.at(-1)).toContain('dom.GetObject(ID_FUNCTIONS).Remove(2000)');
        expect(provider.document().objects['BidCos-RF.ABC1:1']?.enums).toEqual(['room/r1000']);
    });
});

describe('what ReGa cannot do', () => {
    it('refuses a new, a renamed or a deleted taxonomy, and an import', async () => {
        const {provider} = await started();
        await expect(provider.createEnum()).rejects.toMatchObject({code: 'forbidden'});
        await expect(provider.updateEnum()).rejects.toMatchObject({code: 'forbidden'});
        await expect(provider.deleteEnum()).rejects.toMatchObject({code: 'forbidden'});
        await expect(provider.import()).rejects.toMatchObject({code: 'forbidden'});
        await provider.stop();
    });
});

describe('the stock rooms and functions', () => {
    /**
     * Found in the first lab pass (CCU3, firmware 3.89.8): a CCU comes with eleven rooms and ten
     * functions whose `Name()` is a translation key - `roomKitchen`, `funcCentral` - and the WebUI
     * translates it wherever it is shown. The list here has to show what the WebUI shows.
     */
    function stock(): FakeRega {
        const rega = fakeRega();
        rega.snapshot.rooms = [
            {id: 1228, name: 'roomKitchen', channels: [102]},
            {id: 1233, name: 'roomBathroom', channels: []},
            {id: 1001, name: 'Bad', channels: []},
        ];
        rega.snapshot.functions = [
            {id: 1225, name: 'funcCentral', channels: [201]},
            {id: 2000, name: 'Licht', channels: []},
        ];
        return rega;
    }

    it('translates a key the way the WebUI does, and leaves any other name alone', () => {
        expect(regaStockName('roomKitchen', 'de')).toBe('Küche');
        expect(regaStockName('roomKitchen', 'en')).toBe('Kitchen');
        expect(regaStockName('funcCentral', undefined)).toBe('Zentrale');
        expect(regaStockName('Küche', 'de')).toBe('Küche');
        expect(regaStockName('', 'en')).toBe('');
    });

    it('shows the translated names in the document, sorted by what is shown', async () => {
        const rega = stock();
        const {provider} = build(rega, 'de');
        await provider.start();
        expect(provider.document().enums['room']?.tree).toEqual([
            {id: 'r1001', name: 'Bad'},
            {id: 'r1233', name: 'Badezimmer'},
            {id: 'r1228', name: 'Küche'},
        ]);
        expect(provider.document().enums['function']?.tree).toEqual([
            {id: 'r2000', name: 'Licht'},
            {id: 'r1225', name: 'Zentrale'},
        ]);
        // the memberships are by id and do not care about the name
        expect(provider.document().objects['BidCos-RF.ABC1:1']?.enums).toEqual(['room/r1228']);

        const english = build(stock(), 'en');
        await english.provider.start();
        expect(english.provider.document().enums['room']?.tree.map((node) => node.name)).toEqual([
            'Bad',
            'Bathroom',
            'Kitchen',
        ]);
    });

    it('takes the translation as the current name: renaming to it sends nothing, any other name is written', async () => {
        const rega = stock();
        const {provider} = build(rega, 'de');
        await provider.start();
        const before = rega.scripts.length;
        await provider.updateNode('room/r1228', {name: 'Küche'});
        await provider.updateNode('room/r1228', {name: 'roomKitchen'});
        expect(rega.scripts).toHaveLength(before);

        await provider.updateNode('room/r1228', {name: 'Kochen'});
        expect(rega.scripts.at(-1)).toBe('dom.GetObject(1228).Name("Kochen");\n');
        expect(provider.document().enums['room']?.tree.find((node) => node.id === 'r1228')?.name).toBe('Kochen');
    });
});
