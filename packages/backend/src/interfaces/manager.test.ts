import net from 'node:net';
import os from 'node:os';

import {describe, expect, it, vi} from 'vitest';

import type {ConnectionConfig, InterfaceState, RpcProtocol, RpcValue} from '@homematic-manager/core';

import {BackendError} from '../errors.js';
import {normaliseConnection} from '../config/defaults.js';
import {RpcClient, type RpcClientOptions} from '../rpc/client.js';
import type {CallbackHandler, CallbackServerSet} from '../rpc/server.js';
import {InterfaceManager, callbackBindHost, firstBidcosInterfaceAddress} from './manager.js';

/** A callback server set that binds nothing. */
function fakeServers(): CallbackServerSet & {stopped: boolean; started: RpcProtocol[]} {
    const ports: Record<string, number> = {xmlrpc: 2042, binrpc: 2043};
    return {
        stopped: false,
        started: [] as RpcProtocol[],
        ensure(protocol) {
            this.started.push(protocol);
            return Promise.resolve(ports[protocol] ?? 0);
        },
        port: (protocol) => ports[protocol] ?? 0,
        callbackUrl: (protocol, ip) =>
            `${protocol === 'binrpc' ? 'xmlrpc_bin://' : 'http://'}${ip}:${String(ports[protocol] ?? 0)}`,
        stop() {
            this.stopped = true;
            return Promise.resolve();
        },
    };
}

type Answer = (method: string, params: readonly RpcValue[]) => RpcValue | Error;

/** Records every call and answers from a per-interface table. */
function fakeClients(answers: Record<string, Answer> = {}): {
    create: (options: RpcClientOptions) => RpcClient;
    calls: {name: string; method: string; params: readonly RpcValue[]}[];
    closed: string[];
} {
    const calls: {name: string; method: string; params: readonly RpcValue[]}[] = [];
    const closed: string[] = [];
    return {
        calls,
        closed,
        create: (options) => {
            const answer = answers[options.name] ?? (() => '');
            return {
                name: options.name,
                host: options.host,
                port: options.port,
                protocol: options.protocol,
                closed: false,
                description: `${options.name} (${options.host}:${String(options.port)}, ${options.protocol})`,
                call: (method: string, params: readonly RpcValue[] = []) => {
                    calls.push({name: options.name, method, params});
                    const value = answer(method, params);
                    return value instanceof Error ? Promise.reject(value) : Promise.resolve(value);
                },
                close: () => closed.push(options.name),
            } as unknown as RpcClient;
        },
    };
}

interface Harness {
    manager: InterfaceManager;
    states: InterfaceState[][];
    notices: {level: string; message: string; interfaceName?: string}[];
    connected: string[];
    servers: ReturnType<typeof fakeServers>;
    clients: ReturnType<typeof fakeClients>;
    clock: {value: number};
}

function harness(
    options: {
        connection?: Partial<ConnectionConfig>;
        answers?: Record<string, Answer>;
        probe?: (host: string, port: number) => Promise<boolean>;
        initBackoffMs?: number;
    } = {},
): Harness {
    const states: InterfaceState[][] = [];
    const notices: Harness['notices'] = [];
    const connected: string[] = [];
    const servers = fakeServers();
    const clients = fakeClients(options.answers);
    const clock = {value: 1_000_000};
    const handler = {} as CallbackHandler;
    const connection = normaliseConnection({
        host: 'ccu.lan',
        interfaces: ['BidCos-RF', 'HmIP-RF'],
        callback: {ip: '192.168.1.5', xmlrpcPort: 0, binrpcPort: 0},
        ...options.connection,
    });
    const manager = new InterfaceManager({
        connection,
        handler,
        onStateChanged: (next) => states.push(next.map((state) => ({...state}))),
        onNotice: (level, message, interfaceName) =>
            notices.push({level, message, ...(interfaceName === undefined ? {} : {interfaceName})}),
        onConnected: (name) => {
            connected.push(name);
        },
        now: () => clock.value,
        watchdogIntervalMs: 0,
        createClient: clients.create,
        createCallbackServers: () => servers,
        ...(options.initBackoffMs === undefined ? {} : {initBackoffMs: options.initBackoffMs}),
        ...(options.probe ? {probe: options.probe} : {probe: () => Promise.resolve(true)}),
    });
    return {manager, states, notices, connected, servers, clients, clock};
}

describe('firstBidcosInterfaceAddress', () => {
    it('takes the address of the first entry', () => {
        expect(firstBidcosInterfaceAddress([{ADDRESS: 'XEQ0123456', TYPE: 'HMIP_CCU'}])).toBe('XEQ0123456');
    });

    it('survives every shape 2.x crashed on (#93)', () => {
        expect(firstBidcosInterfaceAddress([])).toBeUndefined();
        expect(firstBidcosInterfaceAddress('')).toBeUndefined();
        expect(firstBidcosInterfaceAddress([[1, 2]])).toBeUndefined();
        expect(firstBidcosInterfaceAddress([{TYPE: 'X'}])).toBeUndefined();
        expect(firstBidcosInterfaceAddress([{ADDRESS: ''}])).toBeUndefined();
        expect(firstBidcosInterfaceAddress([{ADDRESS: 42}])).toBeUndefined();
    });
});

describe('InterfaceManager.start', () => {
    it('refuses to start without a host', async () => {
        await expect(harness({connection: {host: ''}}).manager.start()).rejects.toThrow('no CCU address configured');
    });

    it('refuses to start when no name resolves to an interface', async () => {
        // `normaliseConnection` drops unknown names, so this can only come from a caller that
        // bypassed it - the manager still has to say so rather than sit there with no client
        const h = harness();
        const manager = new InterfaceManager({
            connection: {...normaliseConnection({host: 'ccu.lan'}), interfaces: ['Nothing']},
            handler: {} as CallbackHandler,
            onStateChanged: () => undefined,
            onNotice: () => undefined,
            watchdogIntervalMs: 0,
            createClient: h.clients.create,
            createCallbackServers: () => h.servers,
        });
        await expect(manager.start()).rejects.toThrow('no interface selected');
    });

    it('starts one callback server per protocol and subscribes with the right ident and URL', async () => {
        const h = harness({connection: {interfaces: ['BidCos-RF', 'HmIP-RF', 'CUxD']}});
        await h.manager.start();
        expect(h.servers.started.sort()).toEqual(['binrpc', 'xmlrpc']);
        const inits = h.clients.calls.filter((call) => call.method === 'init');
        expect(inits).toEqual([
            {name: 'BidCos-RF', method: 'init', params: ['http://192.168.1.5:2042', 'hmm_BidCos-RF']},
            {name: 'HmIP-RF', method: 'init', params: ['http://192.168.1.5:2042', 'hmm_HmIP-RF']},
            {name: 'CUxD', method: 'init', params: ['xmlrpc_bin://192.168.1.5:2043', 'CUxD']},
        ]);
        expect(h.manager.names()).toEqual(['BidCos-RF', 'HmIP-RF', 'CUxD']);
    });

    it('reports every interface as connected and calls the connect hook', async () => {
        const h = harness();
        await h.manager.start();
        expect(h.manager.states().map((state) => [state.name, state.connected])).toEqual([
            ['BidCos-RF', true],
            ['HmIP-RF', true],
        ]);
        expect(h.manager.states()[0]?.lastEvent).toBe(1_000_000);
        expect(h.connected).toEqual(['BidCos-RF', 'HmIP-RF']);
    });

    it('says in the state whether the interface is talked to over TLS (task 21)', async () => {
        // The port alone does not say it: 42001 is a number, and the interface popup shows the
        // encryption as a word beside protocol and port. Off is absent, not `false`, so the state
        // of a plain installation is byte-identical to what it was before this field existed.
        const plain = harness();
        await plain.manager.start();
        expect(plain.manager.states().map((state) => state.tls)).toEqual([undefined, undefined]);

        const secure = harness({connection: {tls: true}});
        await secure.manager.start();
        expect(secure.manager.states().map((state) => [state.port, state.tls])).toEqual([
            [42_001, true],
            [42_010, true],
        ]);
    });

    it('keeps going when one interface refuses the subscription', async () => {
        const h = harness({
            answers: {'HmIP-RF': () => Object.assign(new Error('connect ECONNREFUSED'), {})},
        });
        await h.manager.start();
        const [bidcos, hmip] = h.manager.states();
        expect(bidcos?.connected).toBe(true);
        expect(hmip?.connected).toBe(false);
        expect(hmip?.error).toContain('ECONNREFUSED');
        // a refused port is not an error of the interface: nothing is running there (task 13)
        expect(hmip?.absent).toBe(true);
        const notice = h.notices.find((entry) => entry.interfaceName === 'HmIP-RF');
        expect(notice?.level).toBe('warn');
        expect(notice?.message).toContain('not present');
        expect(h.connected).toEqual(['BidCos-RF']);
    });

    it('reports an interface that answers with something other than a refusal as an error', async () => {
        const h = harness({answers: {'HmIP-RF': () => new BackendError({message: 'boom', kind: 'rpc'})}});
        await h.manager.start();
        expect(h.manager.states()[1]?.absent).toBeUndefined();
        expect(h.notices.find((entry) => entry.interfaceName === 'HmIP-RF')?.level).toBe('error');
    });

    it('backs off instead of re-initing a missing interface every round (task 13)', async () => {
        // this is BidCos-Wired on a CCU without a wired gateway: it is in the default interface
        // list, hs485d is not running, and 2.x's watchdog produced four ERROR lines a minute
        const h = harness({
            answers: {'HmIP-RF': () => Object.assign(new Error('connect ECONNREFUSED'), {})},
            initBackoffMs: 15_000,
        });
        await h.manager.start();
        const initsAfterStart = h.clients.calls.filter((call) => call.name === 'HmIP-RF').length;
        expect(initsAfterStart).toBe(1);

        // twenty watchdog rounds of 15 s: without the back-off that is twenty more attempts
        for (let round = 0; round < 20; round += 1) {
            h.clock.value += 15_000;
            await h.manager.tick();
        }
        const attempts = h.clients.calls.filter((call) => call.name === 'HmIP-RF').length;
        // 15 s, 30 s, 60 s, 120 s, 240 s and then the 300 s ceiling: five within the five minutes
        expect(attempts).toBeGreaterThan(1);
        expect(attempts).toBeLessThan(8);
        // and exactly one notice, however often it was tried
        expect(h.notices.filter((entry) => entry.interfaceName === 'HmIP-RF')).toHaveLength(1);
    });

    it('never waits longer than five minutes, and starts over when the user asks', async () => {
        let refuse = true;
        const h = harness({
            answers: {
                'HmIP-RF': () => (refuse ? Object.assign(new Error('connect ECONNREFUSED'), {}) : ''),
            },
            initBackoffMs: 15_000,
        });
        await h.manager.start();
        for (let round = 0; round < 40; round += 1) {
            h.clock.value += 60_000;
            await h.manager.tick();
        }
        const attempts = h.clients.calls.filter((call) => call.name === 'HmIP-RF').length;
        // forty minutes at the 300 s ceiling is eight attempts, plus the ones before it
        expect(attempts).toBeGreaterThanOrEqual(8);

        refuse = false;
        await h.manager.reconnect('HmIP-RF');
        const state = h.manager.states()[1];
        expect(state?.connected).toBe(true);
        expect(state?.absent).toBeUndefined();
        expect(h.notices.filter((entry) => entry.interfaceName === 'HmIP-RF' && entry.level === 'info')).toHaveLength(
            1,
        );
    });

    it('finds the callback address itself when none is configured', () => {
        const h = harness({connection: {callback: {ip: '', xmlrpcPort: 0, binrpcPort: 0}}});
        expect(h.manager.callbackIp).toBeTypeOf('string');
    });

    /**
     * Issue #144: on the CCU itself - the addon, which starts with `--local --ccu 127.0.0.1` - the
     * interface processes are on the loopback and so are we. The box's LAN address worked, but it
     * is the one address that changes, while an `init` registration survives the change in the
     * interface process's handler list, and every other local subscriber on a CCU registers on
     * 127.0.0.1.
     */
    it('calls back on the loopback when it runs on the CCU itself (#144)', async () => {
        const h = harness({
            connection: {host: '127.0.0.1', local: true, callback: {ip: '', xmlrpcPort: 0, binrpcPort: 0}},
        });
        expect(h.manager.callbackIp).toBe('127.0.0.1');

        await h.manager.start();
        expect(h.clients.calls.filter((call) => call.method === 'init').map((call) => call.params[0])).toEqual([
            'xmlrpc_bin://127.0.0.1:2043',
            'http://127.0.0.1:2042',
        ]);
    });

    it('keeps a configured callback address even on the CCU (#144)', () => {
        const h = harness({
            connection: {host: '127.0.0.1', local: true, callback: {ip: '10.0.0.9', xmlrpcPort: 0, binrpcPort: 0}},
        });
        expect(h.manager.callbackIp).toBe('10.0.0.9');
    });
});

/**
 * Task 35 (D-43): the CCU addon starts the host with a fixed callback pair for the ports the
 * configuration leaves at 0. Real sockets on the loopback here, because the fallback is a bind that
 * fails.
 */
describe('the default callback ports', () => {
    function listening(port = 0): Promise<net.Server> {
        return new Promise((resolve, reject) => {
            const server = net.createServer();
            server.once('error', reject);
            server.listen(port, '127.0.0.1', () => {
                resolve(server);
            });
        });
    }

    function portOf(server: net.Server): number {
        const address = server.address();
        return typeof address === 'object' && address !== null ? address.port : 0;
    }

    function closed(server: net.Server): Promise<void> {
        return new Promise((resolve) => {
            server.close(() => {
                resolve();
            });
        });
    }

    /** Two ports that were free a moment ago, and different from each other. */
    async function freePorts(): Promise<[number, number]> {
        const first = await listening();
        const second = await listening();
        const ports: [number, number] = [portOf(first), portOf(second)];
        await closed(first);
        await closed(second);
        return ports;
    }

    function subscriber(
        callback: {xmlrpcPort: number; binrpcPort: number},
        defaultCallbackPorts: {xmlrpc: number; binrpc: number},
    ) {
        const clients = fakeClients();
        const notices: {level: string; message: string}[] = [];
        const manager = new InterfaceManager({
            connection: normaliseConnection({
                host: '127.0.0.1',
                local: true,
                interfaces: ['BidCos-RF', 'HmIP-RF'],
                callback: {ip: '', ...callback},
            }),
            handler: {} as CallbackHandler,
            onStateChanged: () => undefined,
            onNotice: (level, message) => notices.push({level, message}),
            watchdogIntervalMs: 0,
            createClient: clients.create,
            probe: () => Promise.resolve(true),
            callbackHost: '127.0.0.1',
            defaultCallbackPorts,
        });
        const urls = (): unknown[] =>
            clients.calls
                .filter((call) => call.method === 'init' && call.params[1] !== '')
                .map((call) => call.params[0])
                .sort();
        return {manager, notices, urls};
    }

    it('registers the default pair while the configured ports are 0', async () => {
        const [xmlrpc, binrpc] = await freePorts();
        const s = subscriber({xmlrpcPort: 0, binrpcPort: 0}, {xmlrpc, binrpc});
        await s.manager.start();
        expect(s.urls()).toEqual([`http://127.0.0.1:${String(xmlrpc)}`, `xmlrpc_bin://127.0.0.1:${String(binrpc)}`]);
        expect(s.notices.filter((notice) => notice.level !== 'info')).toEqual([]);
        await s.manager.stop();
    });

    it('falls back to a free port with one warning when a default port is taken', async () => {
        const blocker = await listening();
        const taken = portOf(blocker);
        const [binrpc] = await freePorts();
        const s = subscriber({xmlrpcPort: 0, binrpcPort: 0}, {xmlrpc: taken, binrpc});
        await s.manager.start();
        const [http, bin] = s.urls();
        expect(http).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
        expect(http).not.toBe(`http://127.0.0.1:${String(taken)}`);
        expect(bin).toBe(`xmlrpc_bin://127.0.0.1:${String(binrpc)}`);
        const warnings = s.notices.filter((notice) => notice.level === 'warn');
        expect(warnings).toHaveLength(1);
        expect(warnings[0]?.message).toContain(`the default xmlrpc port ${String(taken)} is taken`);
        expect(s.notices.filter((notice) => notice.level === 'error')).toEqual([]);
        await s.manager.stop();
        await closed(blocker);
    });

    it("keeps the user's configured ports over the default pair", async () => {
        const [xmlrpc, binrpc] = await freePorts();
        const s = subscriber({xmlrpcPort: xmlrpc, binrpcPort: binrpc}, {xmlrpc: 2031, binrpc: 2032});
        await s.manager.start();
        expect(s.urls()).toEqual([`http://127.0.0.1:${String(xmlrpc)}`, `xmlrpc_bin://127.0.0.1:${String(binrpc)}`]);
        await s.manager.stop();
    });

    /**
     * Task 38: a *fixed* port that is taken - hm2mqtt.js on the same pair, a second container on the
     * host network. Before, the whole connection failed with a bare EADDRINUSE notice and no
     * interface state at all; now the other protocol still works, the log names the port and the
     * option, the state carries the reason, and nothing falls back to a free port.
     */
    it('fails loudly on a taken fixed port: no free port, the option in the log, the reason in the state', async () => {
        const blocker = await listening();
        const taken = portOf(blocker);
        const [binrpc] = await freePorts();
        const clients = fakeClients();
        const notices: {level: string; message: string}[] = [];
        let states: InterfaceState[] = [];
        const manager = new InterfaceManager({
            connection: normaliseConnection({
                host: '127.0.0.1',
                local: true,
                interfaces: ['BidCos-RF', 'HmIP-RF'],
                callback: {ip: '', xmlrpcPort: taken, binrpcPort: binrpc},
            }),
            handler: {} as CallbackHandler,
            onStateChanged: (next) => {
                states = next;
            },
            onNotice: (level, message) => notices.push({level, message}),
            watchdogIntervalMs: 0,
            initBackoffMs: 0,
            createClient: clients.create,
            probe: () => Promise.resolve(true),
            callbackHost: '127.0.0.1',
            // a default pair is there and must not be used: the configured port is fixed
            defaultCallbackPorts: {xmlrpc: 2031, binrpc: 2032},
            callbackPins: {xmlrpcPort: true},
        });
        await manager.start();

        const errors = notices.filter((notice) => notice.level === 'error');
        expect(errors).toHaveLength(1);
        expect(errors[0]?.message).toContain(`xmlrpc port ${String(taken)}`);
        expect(errors[0]?.message).toContain('HMM_CALLBACK_XMLRPC_PORT / --callback-xmlrpc-port');
        expect(errors[0]?.message).toContain('is in use');
        expect(notices.filter((notice) => notice.level === 'warn')).toEqual([]);

        const xmlrpcState = states.find((state) => state.protocol === 'xmlrpc');
        const binrpcState = states.find((state) => state.protocol === 'binrpc');
        expect(xmlrpcState).toMatchObject({
            connected: false,
            error: `callback port ${String(taken)} is in use`,
            callbackFailure: {port: taken, inUse: true},
        });
        expect(xmlrpcState).not.toHaveProperty('callbackUrl');
        // not subscribed with a URL nobody listens on, and not with a free port either
        const inits = (name: string | undefined): unknown[] =>
            clients.calls
                .filter((call) => call.name === name && call.method === 'init' && call.params[1] !== '')
                .map((call) => call.params[0]);
        expect(inits(xmlrpcState?.name)).toEqual([]);
        // the other protocol is untouched, and its state names the URL it was given
        expect(binrpcState).toMatchObject({connected: true, callbackUrl: `xmlrpc_bin://127.0.0.1:${String(binrpc)}`});
        expect(binrpcState).not.toHaveProperty('callbackFailure');

        // a retry after the port is free again binds it and subscribes
        await closed(blocker);
        await manager.reconnect();
        expect(inits(xmlrpcState?.name)).toEqual([`http://127.0.0.1:${String(taken)}`]);
        const recovered = manager.states().find((state) => state.protocol === 'xmlrpc');
        expect(recovered).toMatchObject({connected: true, callbackUrl: `http://127.0.0.1:${String(taken)}`});
        expect(recovered).not.toHaveProperty('callbackFailure');
        expect(notices.some((notice) => notice.level === 'info' && notice.message.includes('is open now'))).toBe(true);
        await manager.stop();
    });

    it('names the settings as the source of an unpinned fixed port, and a bind error that is not "in use"', async () => {
        const clients = fakeClients();
        const notices: {level: string; message: string}[] = [];
        const servers: CallbackServerSet = {
            ensure: (protocol) =>
                protocol === 'xmlrpc'
                    ? Promise.reject(Object.assign(new Error('listen EACCES: permission denied'), {code: 'EACCES'}))
                    : Promise.resolve(2043),
            port: (protocol) => (protocol === 'xmlrpc' ? 0 : 2043),
            callbackUrl: (protocol, ip) => `${protocol === 'binrpc' ? 'xmlrpc_bin://' : 'http://'}${ip}:2043`,
            stop: () => Promise.resolve(),
        };
        const manager = new InterfaceManager({
            connection: normaliseConnection({
                host: '127.0.0.1',
                local: true,
                interfaces: ['BidCos-RF', 'HmIP-RF'],
                callback: {ip: '', xmlrpcPort: 80, binrpcPort: 0},
            }),
            handler: {} as CallbackHandler,
            onStateChanged: () => undefined,
            onNotice: (level, message) => notices.push({level, message}),
            watchdogIntervalMs: 0,
            createClient: clients.create,
            createCallbackServers: () => servers,
            probe: () => Promise.resolve(true),
        });
        await manager.start();
        const [error] = notices.filter((notice) => notice.level === 'error');
        expect(error?.message).toContain('xmlrpc port 80 set by connection.callback.xmlrpcPort in the settings');
        expect(error?.message).toContain('cannot be opened');
        expect(manager.states().find((state) => state.protocol === 'xmlrpc')).toMatchObject({
            error: 'callback port 80 cannot be opened',
            callbackFailure: {port: 80, inUse: false},
        });
        await manager.stop();
    });

    it('still throws when a free port cannot be had, as before', async () => {
        const servers: CallbackServerSet = {
            ensure: () => Promise.reject(new Error('listen EADDRNOTAVAIL')),
            port: () => 0,
            callbackUrl: () => '',
            stop: () => Promise.resolve(),
        };
        const manager = new InterfaceManager({
            connection: normaliseConnection({host: '127.0.0.1', local: true, interfaces: ['HmIP-RF']}),
            handler: {} as CallbackHandler,
            onStateChanged: () => undefined,
            onNotice: () => undefined,
            watchdogIntervalMs: 0,
            createClient: fakeClients().create,
            createCallbackServers: () => servers,
            probe: () => Promise.resolve(true),
        });
        await expect(manager.start()).rejects.toThrow('EADDRNOTAVAIL');
    });
});

/**
 * Task 35: with a fixed port, a listener on every interface would be a known port on the LAN of a
 * CCU whose firewall is open. On the CCU itself the interface processes call back on the loopback
 * (#144), so the servers listen there and nowhere else; for a CCU elsewhere nothing changes.
 */
describe('where the callback servers listen', () => {
    const callback = (ip: string): ConnectionConfig['callback'] => ({ip, xmlrpcPort: 0, binrpcPort: 0});

    it('picks the loopback where the callback address is the loopback', () => {
        const onTheCcu = {host: '127.0.0.1', local: true};
        expect(callbackBindHost(normaliseConnection({...onTheCcu, callback: callback('')}))).toBe('127.0.0.1');
        expect(callbackBindHost(normaliseConnection({...onTheCcu, callback: callback('127.0.0.1')}))).toBe('127.0.0.1');
        expect(callbackBindHost(normaliseConnection({host: 'ccu.lan', callback: callback('127.0.0.1')}))).toBe(
            '127.0.0.1',
        );
        // a LAN address, even on the CCU, and a CCU somewhere else: every interface, as before
        expect(callbackBindHost(normaliseConnection({...onTheCcu, callback: callback('10.0.0.9')}))).toBeUndefined();
        expect(callbackBindHost(normaliseConnection({host: 'ccu.lan', callback: callback('')}))).toBeUndefined();
    });

    function connects(host: string, port: number): Promise<boolean> {
        return new Promise((resolve) => {
            const socket = net.connect({host, port});
            socket.once('connect', () => {
                socket.destroy();
                resolve(true);
            });
            socket.once('error', () => {
                resolve(false);
            });
        });
    }

    async function listeningPorts(
        connection: Partial<ConnectionConfig>,
    ): Promise<{ports: number[]; stop: () => Promise<void>}> {
        const clients = fakeClients();
        const manager = new InterfaceManager({
            connection: normaliseConnection(connection),
            handler: {} as CallbackHandler,
            onStateChanged: () => undefined,
            onNotice: () => undefined,
            watchdogIntervalMs: 0,
            createClient: clients.create,
            probe: () => Promise.resolve(true),
        });
        await manager.start();
        const ports = clients.calls
            .filter((call) => call.method === 'init')
            .map((call) => (typeof call.params[0] === 'string' ? call.params[0] : ''))
            .map((url) => Number(/:(\d+)$/.exec(url)?.[1]));
        return {ports, stop: () => manager.stop()};
    }

    /** A LAN address of this machine; the socket checks need one, and a CI runner has it. */
    const lan = Object.values(os.networkInterfaces())
        .flat()
        .find((entry) => entry?.family === 'IPv4' && !entry.internal)?.address;

    it.runIf(lan !== undefined)('cannot be reached on a LAN address of the box when it runs on the CCU', async () => {
        const {ports, stop} = await listeningPorts({
            host: '127.0.0.1',
            local: true,
            interfaces: ['BidCos-RF', 'HmIP-RF'],
        });
        expect(ports).toHaveLength(2);
        for (const port of ports) {
            expect(await connects('127.0.0.1', port)).toBe(true);
            expect(await connects(lan ?? '', port)).toBe(false);
        }
        await stop();
    });

    it.runIf(lan !== undefined)('still listens on every interface for a CCU elsewhere', async () => {
        const {ports, stop} = await listeningPorts({
            host: 'ccu.lan',
            interfaces: ['HmIP-RF'],
            callback: callback(lan ?? ''),
        });
        expect(ports).toHaveLength(1);
        expect(await connects(lan ?? '', ports[0] ?? 0)).toBe(true);
        await stop();
    });
});

describe('the watchdog', () => {
    it('pings after two thirds of the timeout and re-inits after all of it', async () => {
        const h = harness({connection: {interfaces: ['BidCos-RF']}});
        await h.manager.start();
        h.clients.calls.length = 0;

        // BidCos-RF has a 60 s timeout: nothing to do after 10 s
        h.clock.value += 10_000;
        await h.manager.tick();
        expect(h.clients.calls).toEqual([]);

        // 45 s of silence: ping
        h.clock.value += 35_000;
        await h.manager.tick();
        expect(h.clients.calls.map((call) => call.method)).toEqual(['ping']);

        // 61 s of silence: the subscription is gone
        h.clock.value += 16_000;
        h.clients.calls.length = 0;
        await h.manager.tick();
        expect(h.clients.calls.map((call) => call.method)).toEqual(['init']);
    });

    it('gives HmIP its 600 s (eq-3/occu#42)', async () => {
        const h = harness({connection: {interfaces: ['HmIP-RF']}});
        await h.manager.start();
        h.clients.calls.length = 0;
        h.clock.value += 120_000;
        await h.manager.tick();
        expect(h.clients.calls).toEqual([]);
        h.clock.value += 300_000;
        await h.manager.tick();
        expect(h.clients.calls.map((call) => call.method)).toEqual(['ping']);
        h.clock.value += 181_000;
        h.clients.calls.length = 0;
        await h.manager.tick();
        expect(h.clients.calls.map((call) => call.method)).toEqual(['init']);
    });

    it('never pings an interface that answers none, but still re-inits it', async () => {
        const h = harness({connection: {interfaces: ['VirtualDevices']}});
        await h.manager.start();
        h.clients.calls.length = 0;
        h.clock.value += 50_000;
        await h.manager.tick();
        expect(h.clients.calls).toEqual([]);
        h.clock.value += 20_000;
        await h.manager.tick();
        expect(h.clients.calls.map((call) => call.method)).toEqual(['init']);
    });

    it('keeps a failing ping as a hint without dropping the connection', async () => {
        const h = harness({
            connection: {interfaces: ['BidCos-RF']},
            answers: {'BidCos-RF': (method) => (method === 'ping' ? new Error('no answer') : '')},
        });
        await h.manager.start();
        h.clock.value += 45_000;
        await h.manager.tick();
        expect(h.manager.states()[0]?.connected).toBe(true);
        expect(h.manager.states()[0]?.error).toContain('no answer');
    });

    it('an event resets the clock and brings a lost interface back', async () => {
        const h = harness({connection: {interfaces: ['BidCos-RF']}});
        await h.manager.start();
        h.clock.value += 100_000;
        await h.manager.tick();
        h.clock.value += 1;
        h.manager.noteEvent('BidCos-RF');
        expect(h.manager.isConnected('BidCos-RF')).toBe(true);
        h.clock.value += 10_000;
        h.clients.calls.length = 0;
        await h.manager.tick();
        expect(h.clients.calls).toEqual([]);
    });

    it('ignores an event of an interface it does not manage', async () => {
        const h = harness();
        await h.manager.start();
        expect(() => {
            h.manager.noteEvent('Nothing');
        }).not.toThrow();
    });
});

describe('client, reconnect and stop', () => {
    it('hands out the client of a configured interface and refuses others', async () => {
        const h = harness();
        await h.manager.start();
        expect(h.manager.client('HmIP-RF').name).toBe('HmIP-RF');
        expect(() => h.manager.client('Nothing')).toThrow(BackendError);
        expect(() => h.manager.client('Nothing')).toThrow('is not configured');
    });

    it('reconnects one interface or all of them', async () => {
        const h = harness();
        await h.manager.start();
        h.clients.calls.length = 0;
        await h.manager.reconnect('HmIP-RF');
        expect(h.clients.calls.map((call) => call.name)).toEqual(['HmIP-RF']);
        h.clients.calls.length = 0;
        await h.manager.reconnect();
        expect(h.clients.calls.map((call) => call.name)).toEqual(['BidCos-RF', 'HmIP-RF']);
        await expect(h.manager.reconnect('Nothing')).rejects.toThrow('is not configured');
    });

    it('de-registers with an empty ident, closes the clients and the servers', async () => {
        const h = harness();
        await h.manager.start();
        h.clients.calls.length = 0;
        await h.manager.stop();
        expect(h.clients.calls).toEqual([
            {name: 'BidCos-RF', method: 'init', params: ['http://192.168.1.5:2042', '']},
            {name: 'HmIP-RF', method: 'init', params: ['http://192.168.1.5:2042', '']},
        ]);
        expect(h.clients.closed.sort()).toEqual(['BidCos-RF', 'HmIP-RF']);
        expect(h.servers.stopped).toBe(true);
        expect(h.manager.states()).toEqual([]);
    });

    it('closes even when the CCU does not answer the de-registration', async () => {
        const h = harness({answers: {'BidCos-RF': () => new Error('gone'), 'HmIP-RF': () => new Error('gone')}});
        await h.manager.start();
        await expect(h.manager.stop()).resolves.toBeUndefined();
        expect(h.servers.stopped).toBe(true);
    });
});

describe('the background port probe', () => {
    it('reports which interfaces answered', async () => {
        const open = new Set([2001, 2010]);
        const h = harness({probe: (_host, port) => Promise.resolve(open.has(port))});
        await h.manager.start();
        await expect(h.manager.probeInterfaces()).resolves.toEqual(['BidCos-RF', 'HmIP-RF']);
        expect(h.manager.detected).toEqual(['BidCos-RF', 'HmIP-RF']);
    });

    it('warns about a configured interface whose port is closed and is not connected', async () => {
        const h = harness({
            connection: {interfaces: ['BidCos-RF', 'HmIP-RF'], autoDetect: false},
            answers: {'HmIP-RF': () => new Error('refused')},
            probe: (_host, port) => Promise.resolve(port === 2001),
        });
        await h.manager.start();
        await h.manager.probeInterfaces();
        const warnings = h.notices.filter((notice) => notice.level === 'warn');
        expect(warnings.map((notice) => notice.interfaceName)).toEqual(['HmIP-RF']);
    });

    it('probes the TLS ports when TLS is on', async () => {
        const seen: number[] = [];
        const h = harness({
            connection: {tls: true},
            probe: (_host, port) => {
                seen.push(port);
                return Promise.resolve(false);
            },
        });
        await h.manager.probeInterfaces();
        expect(seen).toContain(42_001);
        expect(seen).toContain(42_010);
    });

    it('is started in the background when autoDetect is on and skipped when it is off', async () => {
        const probe = vi.fn(() => Promise.resolve(true));
        const off = harness({connection: {autoDetect: false}, probe});
        await off.manager.start();
        expect(probe).not.toHaveBeenCalled();
        const on = harness({connection: {autoDetect: true}, probe});
        await on.manager.start();
        expect(probe).toHaveBeenCalled();
    });
});
