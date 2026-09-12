/**
 * The addon itself is not TypeScript: it is POSIX sh, Tcl 8.2 and two bash build scripts, because
 * that is what a CCU runs (see `README.md` and `build.sh`). The Node code the addon executes is the
 * web host of `apps/web`, installed from its own npm tarball.
 *
 * This module exists so the package stays part of the workspace, the build graph and the test run.
 */
export const PACKAGE = '@homematic-manager/ccu-addon';

/**
 * Task 35 (D-43): the callback ports `rc.d/hmm` hands the host while `config.json` says `0`. Named
 * here so the tests can hold `rc.d/hmm`, `etc/default.env` and the README to one pair, and that pair
 * to the ports a CCU and its common addons are measured to use.
 */
export const CALLBACK_DEFAULT_PORTS = {xmlrpc: 2031, binrpc: 2032} as const;
