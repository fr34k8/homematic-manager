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

/**
 * B-25: on openccu-lite a root-owned pidfile left by a live install kept the confined unit from
 * starting the backend, and `rc.d/hmm start` still said "OK". The container test runs the failures
 * themselves; these hold the shape of `Start()` so a later edit cannot quietly drop the checks.
 */
describe('rc.d/hmm reports a start that started nothing (B-25)', () => {
    const start = /\nStart\(\) \{\n([\s\S]*?)\n\}\n/.exec(file('../files/hmm/rc.d/hmm'))?.[1] ?? '';

    it('refuses a stale pidfile it cannot remove, before anything is started', () => {
        const removed = start.indexOf('rm -f $PIDFILE');
        const refused = start.indexOf('if [ -e $PIDFILE ]; then', removed);
        const daemon = start.indexOf('start-stop-daemon -S');
        expect(removed).toBeGreaterThan(0);
        expect(refused).toBeGreaterThan(removed);
        expect(daemon).toBeGreaterThan(refused);
        expect(start.slice(refused, daemon)).toContain('FAILED');
    });

    it('refuses a var/ it cannot write', () => {
        expect(start).toMatch(/if \[ ! -w \$ADDON_DIR\/var \][^\n]*\n[^\n]*FAILED/);
    });

    it('checks that the backend still runs after start-stop-daemon returned, before it says OK', () => {
        const daemon = start.indexOf('if ! start-stop-daemon -S');
        const check = start.indexOf('if ! Running; then', daemon);
        const ok = start.lastIndexOf('echo "OK"');
        expect(daemon).toBeGreaterThan(0);
        expect(check).toBeGreaterThan(daemon);
        expect(ok).toBeGreaterThan(check);
        expect(start.slice(check, ok)).toContain('return 1');
    });
});

/**
 * Task 41 (openccu-lite D-59): on openccu-lite the backend's output goes to the journal through
 * systemd-cat and no log file is written; on a CCU and OpenCCU the file stays. The container test runs
 * both; these hold the shape of `Start()`.
 */
describe('rc.d/hmm logs to the journal on openccu-lite (task 41)', () => {
    const rc = file('../files/hmm/rc.d/hmm');
    const start = /\nStart\(\) \{\n([\s\S]*?)\n\}\n/.exec(rc)?.[1] ?? '';
    const journalAt = start.indexOf('if [ "$LOG_TARGET" = journal ]; then');
    const elseAt = start.indexOf('\n    else\n', journalAt);
    const fileAt = start.indexOf('RUN="exec $NODE"', journalAt);

    it('chooses the journal only on VARIANT=lite, and only where systemd-cat is', () => {
        const target = /\nLogTarget\(\) \{\n([\s\S]*?)\n\}\n/.exec(rc)?.[1] ?? '';
        expect(target).toContain("grep -q '^VARIANT=lite$' /VERSION");
        expect(target).toContain('command -v systemd-cat');
        expect(start).toContain('LOG_TARGET="$(LogTarget)"');
    });

    it('runs the backend through systemd-cat under the unit identifier, and removes the old file', () => {
        expect(rc).toContain('\nJOURNAL_TAG=addon-$ADDON\n');
        expect(journalAt).toBeGreaterThan(0);
        expect(elseAt).toBeGreaterThan(journalAt);
        expect(fileAt).toBeGreaterThan(elseAt);
        const journal = start.slice(journalAt, elseAt);
        expect(journal).toContain('RUN="exec systemd-cat -t $JOURNAL_TAG $NODE"');
        expect(journal).toContain('OUTPUT=""');
        expect(journal).toContain('rm -f $LOG $LOG.1');
        expect(journal).not.toContain('mv $LOG');
    });

    it('keeps the file and its rotation everywhere else, and starts the backend with either', () => {
        const other = start.slice(elseAt, start.indexOf('\n    fi\n', fileAt));
        expect(other).toContain('mv $LOG $LOG.1');
        expect(other).toContain('OUTPUT=">>$LOG 2>&1"');
        expect(start).toMatch(/start-stop-daemon -S -b -m -p \$PIDFILE -x \/bin\/sh -- -c "\$RUN \$APP/);
        expect(start).toContain('--data-dir $STATE_DIR $OUTPUT"');
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
