/**
 * The two pieces of network plumbing the configuration needs: which addresses this machine could
 * ask the CCU to call back on, and whether a port answers at all.
 *
 * The port probe is the same TCP connect 2.x used (`main.js:149-161`), with two differences: it is
 * never awaited by anything the UI waits for (issues #121/#126/#134 - 2.x probed six ports with a
 * 5 s timeout each before the window became usable) and it destroys the socket instead of leaving
 * it to time out.
 */

import net from 'node:net';
import os from 'node:os';

/**
 * Every non-internal IPv4 address of this machine, then `127.0.0.1`; candidates for the callback
 * address. The loopback comes last so nothing that picked "the first candidate" changes - but it
 * has to be offered: on an openccu-lite box the interface processes bind the loopback only
 * (their D-29), so for the Homematic Manager running *on* the box it is the one address they
 * can call back (openccu-lite task 28.10, maintainer 2026-09-08).
 */
export function localIPv4Addresses(
    interfaces: () => NodeJS.Dict<os.NetworkInterfaceInfo[]> = os.networkInterfaces,
): string[] {
    const addresses: string[] = [];
    for (const entries of Object.values(interfaces())) {
        for (const entry of entries ?? []) {
            if (entry.family === 'IPv4' && !entry.internal && !addresses.includes(entry.address)) {
                addresses.push(entry.address);
            }
        }
    }
    addresses.push('127.0.0.1');
    return addresses;
}

export interface ProbeOptions {
    readonly timeoutMs?: number;
    /** Injected for the tests; defaults to `net.connect`. */
    readonly connect?: typeof net.connect;
}

/**
 * What a port probe found.
 *
 * B-28: `refused` and `unreachable` are different answers. A refused connection means nothing listens
 * there - the interface process is not installed, the normal state of BidCos-Wired on a CCU without a
 * wired gateway. A connection that times out, or a host without a route, says nothing about the
 * process: a slow CCU-Jack, a remote CUxD on a box that is rebooting. Only the first may be shown as
 * "not present".
 */
export type PortProbe = 'open' | 'refused' | 'unreachable';

/** Whether a TCP connection to `host:port` is accepted, refused, or not answered in time. Never throws. */
export function probePortState(host: string, port: number, options: ProbeOptions = {}): Promise<PortProbe> {
    const timeoutMs = options.timeoutMs ?? 2000;
    const connect = options.connect ?? net.connect;
    return new Promise<PortProbe>((resolve) => {
        let settled = false;
        const done = (result: PortProbe): void => {
            if (settled) {
                return;
            }
            settled = true;
            socket.destroy();
            resolve(result);
        };
        const socket = connect({host, port, timeout: timeoutMs}, () => {
            done('open');
        });
        socket.on('error', (error: NodeJS.ErrnoException & {errors?: NodeJS.ErrnoException[]}) => {
            // node's happy-eyeballs connect aggregates the per-address failures in `errors`
            const codes = [error.code, ...(error.errors ?? []).map((entry) => entry.code)];
            done(codes.includes('ECONNREFUSED') ? 'refused' : 'unreachable');
        });
        socket.on('timeout', () => {
            done('unreachable');
        });
    });
}

/** True when a TCP connection to `host:port` is accepted within the timeout. Never throws. */
export async function probePort(host: string, port: number, options: ProbeOptions = {}): Promise<boolean> {
    return (await probePortState(host, port, options)) === 'open';
}

/** Resolves after `ms`; the timer never keeps the process alive. */
export function delay(ms: number): Promise<void> {
    return new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, ms);
        if (typeof timer.unref === 'function') {
            timer.unref();
        }
    });
}

/**
 * Rejects with `error` when `promise` has not settled after `ms`. The underlying work is not
 * cancelled - an RPC call that answers late is simply ignored, which is what the watchdog wants.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, error: () => Error): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(error());
        }, ms);
        if (typeof timer.unref === 'function') {
            timer.unref();
        }
        promise.then(
            (value) => {
                clearTimeout(timer);
                resolve(value);
            },
            (reason: unknown) => {
                clearTimeout(timer);
                reject(reason instanceof Error ? reason : new Error(String(reason)));
            },
        );
    });
}
