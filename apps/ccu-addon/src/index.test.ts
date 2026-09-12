import {readFileSync} from 'node:fs';

import {describe, expect, it} from 'vitest';

import {CALLBACK_DEFAULT_PORTS, PACKAGE} from './index.js';

function file(relative: string): string {
    return readFileSync(new URL(relative, import.meta.url), 'utf8');
}

/**
 * What a CCU3, OpenCCU or openccu-lite box and the addons usually installed beside this one listen on:
 * the table in the README's "Callback ports", measured in the lab on 2026-09-12.
 */
const TAKEN_PORTS: readonly number[] = [
    22, 80, 443, 1880, 1883, 1884, 1885, 1886, 1900, 1998, 1999, 2000, 2001, 2002, 2010, 2121, 2122, 2126, 2127, 5540,
    8088, 8090, 8181, 8182, 8183, 8883, 8884, 9099, 9292, 9293, 9294, 39292, 41999, 43438, 43439, 48181, 49292,
];
const TAKEN_RANGES: readonly (readonly [number, number])[] = [
    // node-red-contrib-ccu picks its callback pair at random in here
    [2040, 2091],
    // hs485d, rfd, hmipserver
    [32000, 32010],
    // the CCU's TLS remote API ports
    [42000, 42010],
    // the kernel's ephemeral range, where every free port comes from
    [32768, 60999],
];

describe('@homematic-manager/ccu-addon', () => {
    it('exports its package name', () => {
        expect(PACKAGE).toBe('@homematic-manager/ccu-addon');
    });
});

describe('the callback ports of the addon (task 35)', () => {
    const rc = file('../files/hmm/rc.d/hmm');
    const {xmlrpc, binrpc} = CALLBACK_DEFAULT_PORTS;

    it('are set by rc.d/hmm before it reads hmm.env, so hmm.env can move them', () => {
        const sourced = rc.indexOf('. $ENV_FILE');
        const xmlrpcLine = rc.indexOf(`\n    HMM_CALLBACK_XMLRPC_DEFAULT_PORT=${String(xmlrpc)}\n`);
        const binrpcLine = rc.indexOf(`\n    HMM_CALLBACK_BINRPC_DEFAULT_PORT=${String(binrpc)}\n`);
        expect(xmlrpcLine).toBeGreaterThan(0);
        expect(binrpcLine).toBeGreaterThan(0);
        expect(sourced).toBeGreaterThan(Math.max(xmlrpcLine, binrpcLine));
        // exported, because the host reads them as the HMM_* mirrors of --callback-*-default-port
        expect(rc).toMatch(
            /^ {4}export [^\n]*\bHMM_CALLBACK_XMLRPC_DEFAULT_PORT\b[^\n]*\bHMM_CALLBACK_BINRPC_DEFAULT_PORT\b/m,
        );
    });

    it('are the ones default.env and the README document', () => {
        const env = file('../files/hmm/etc/default.env');
        expect(env).toContain(`#HMM_CALLBACK_XMLRPC_DEFAULT_PORT=${String(xmlrpc)}\n`);
        expect(env).toContain(`#HMM_CALLBACK_BINRPC_DEFAULT_PORT=${String(binrpc)}\n`);
        expect(file('../README.md')).toContain(
            `**fixed by\ndefault: ${String(xmlrpc)} for XML-RPC, ${String(binrpc)} for BIN-RPC**`,
        );
    });

    it('differ from each other and from the port of the host itself', () => {
        const hostPort = Number(/^ {4}HMM_PORT=(\d+)$/m.exec(rc)?.[1]);
        expect(hostPort).toBe(8090);
        expect(new Set([xmlrpc, binrpc, hostPort, hostPort + 1]).size).toBe(4);
    });

    it('stay clear of every port a CCU and its usual neighbours listen on', () => {
        for (const port of [xmlrpc, binrpc]) {
            expect(TAKEN_PORTS).not.toContain(port);
            for (const [low, high] of TAKEN_RANGES) {
                expect(port < low || port > high, `${String(port)} lies in ${String(low)}-${String(high)}`).toBe(true);
            }
        }
    });
});
