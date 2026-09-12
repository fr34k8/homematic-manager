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
        expect(journal).toContain('rm -f $ADDON_LOG $ADDON_LOG.1');
        expect(journal).not.toContain('mv $LOG');
    });

    it('keeps a file and its rotation everywhere else, and starts the backend with either', () => {
        const other = start.slice(elseAt, start.indexOf('\n    fi\n', fileAt));
        expect(other).toContain('mv $LOG $LOG.1');
        expect(other).toContain('OUTPUT=">>$LOG 2>&1"');
        expect(start).toMatch(
            /start-stop-daemon -S -b -m -p \$PIDFILE -x \/bin\/sh -- -c "\$RUN \$HMM_NODE_FLAGS \$APP/,
        );
        expect(start).toContain('--data-dir $STATE_DIR $OUTPUT"');
    });
});

/**
 * Task 44 (D-46): node runs in V8's lite mode by default, and `etc/hmm.env` can change the flags. The
 * default is set before hmm.env is sourced, so an empty `HMM_NODE_FLAGS=` there starts node without it.
 * The container test checks the running process's command line both ways.
 */
describe('rc.d/hmm starts node with --lite-mode (task 44)', () => {
    const rc = file('../files/hmm/rc.d/hmm');
    const start = /\nStart\(\) \{\n([\s\S]*?)\n\}\n/.exec(rc)?.[1] ?? '';

    it('sets the flag as a default that etc/hmm.env can override', () => {
        const defaultAt = start.indexOf('\n    HMM_NODE_FLAGS=--lite-mode\n');
        const envAt = start.indexOf('. $ENV_FILE');
        expect(defaultAt).toBeGreaterThan(0);
        expect(envAt).toBeGreaterThan(defaultAt);
    });

    it('passes the flags to node before the app, for the journal and the file alike', () => {
        const runAt = start.indexOf('"$RUN $HMM_NODE_FLAGS $APP');
        expect(runAt).toBeGreaterThan(start.indexOf('RUN="exec $NODE"'));
        expect(runAt).toBeGreaterThan(start.indexOf('RUN="exec systemd-cat -t $JOURNAL_TAG $NODE"'));
    });

    it('documents the switch in default.env', () => {
        expect(file('../files/hmm/etc/default.env')).toContain('#HMM_NODE_FLAGS=');
    });
});

/**
 * Task 43 (#159): on a CCU and OpenCCU the backend's output goes to /var/log/hmm.log (tmpfs, no SD-card
 * writes) unless etc/hmm.env says HMM_ADDON_LOG=addon; a /var/log that cannot be written falls back to the
 * addon directory, and the start removes the file at the location not chosen. The container test runs
 * both locations and the fallback; these hold the shape of `LogTarget()` and `Start()`.
 */
describe('rc.d/hmm logs to /var/log or to the addon directory (task 43)', () => {
    const rc = file('../files/hmm/rc.d/hmm');
    const target = /\nLogTarget\(\) \{\n([\s\S]*?)\n\}\n/.exec(rc)?.[1] ?? '';
    const start = /\nStart\(\) \{\n([\s\S]*?)\n\}\n/.exec(rc)?.[1] ?? '';

    it('knows both files, and /var/log/hmm.log is what unset means', () => {
        expect(rc).toContain(
            '\nVARLOG_DIR=/var/log\nVARLOG_LOG=$VARLOG_DIR/hmm.log\nADDON_LOG=$ADDON_DIR/var/hmm.log\n',
        );
        const unset = start.indexOf('\n    HMM_ADDON_LOG=varlog\n');
        const sourced = start.indexOf('. $ENV_FILE');
        expect(unset).toBeGreaterThan(0);
        expect(sourced).toBeGreaterThan(unset);
        expect(start.indexOf('LOG_TARGET="$(LogTarget)"')).toBeGreaterThan(sourced);
        expect(file('../files/hmm/etc/default.env')).toContain('\n#HMM_ADDON_LOG=addon\n');
    });

    it('answers journal, addon or varlog, and nothing else', () => {
        const journal = target.indexOf('echo journal');
        const addon = target.indexOf('echo addon');
        const varlog = target.indexOf('echo varlog');
        expect(journal).toBeGreaterThan(0);
        expect(addon).toBeGreaterThan(journal);
        expect(varlog).toBeGreaterThan(addon);
        expect(target.slice(journal, addon)).toContain('[ "$HMM_ADDON_LOG" = addon ]');
        expect(target.match(/echo /g)).toHaveLength(3);
    });

    it('falls back to the addon directory with a logger line when /var/log cannot be written', () => {
        const fallbackAt = start.indexOf('if [ "$LOG_TARGET" = varlog ]; then');
        const b25 = start.indexOf('if [ ! -w $ADDON_DIR/var ]');
        expect(fallbackAt).toBeGreaterThan(0);
        expect(b25).toBeGreaterThan(fallbackAt);
        const fallback = start.slice(fallbackAt, b25);
        expect(fallback).toContain('mkdir -p $VARLOG_DIR');
        expect(fallback).toContain('[ ! -w $VARLOG_DIR ]');
        expect(fallback).toContain('[ ! -w $VARLOG_LOG ]');
        expect(fallback).toMatch(/logger -t \$ADDON -p daemon\.warn [^\n]*\n\s*LOG_TARGET=addon\n/);
    });

    it('rotates both files at 1 MB, and removes the file at the other location first', () => {
        expect(rc).toContain('\nLOG_MAX=1048576\n');
        expect(start).toMatch(/\n\s*varlog\)\n\s*LOG=\$VARLOG_LOG\n\s*OTHER_LOG=\$ADDON_LOG\n/);
        expect(start).toMatch(/\n\s*\*\)\n\s*LOG=\$ADDON_LOG\n\s*OTHER_LOG=\$VARLOG_LOG\n/);
        const journalAt = start.indexOf('if [ "$LOG_TARGET" = journal ]; then');
        const elseAt = start.indexOf('\n    else\n', journalAt);
        const fileBranch = start.slice(elseAt, start.indexOf('\n    fi\n', start.indexOf('RUN="exec $NODE"')));
        const removed = fileBranch.indexOf('rm -f $OTHER_LOG $OTHER_LOG.1');
        const rotated = fileBranch.indexOf('mv $LOG $LOG.1');
        expect(removed).toBeGreaterThan(0);
        expect(rotated).toBeGreaterThan(removed);
        expect(fileBranch).toContain('OUTPUT=">>$LOG 2>&1"');
    });

    it('takes /var/log/hmm.log along at an uninstall', () => {
        const uninstall = /\n {4}uninstall\)\n([\s\S]*?);;\n/.exec(rc)?.[1] ?? '';
        expect(uninstall).toContain('rm -f $VARLOG_LOG $VARLOG_LOG.1');
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
