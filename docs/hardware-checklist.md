# Hardware checklist

What was run on real CCUs, when, on which build, and what came out. One section per run; the newest
first. This is the evidence behind "it works on hardware" — everything else in the documentation is
the simulator, the container replay or an inference.

**No address, alias, credential or serial of the lab is in this file, and none may ever be**
(AGENTS.md). The three boxes are named by what distinguishes them:

| in this file | what it is |
| --- | --- |
| **CCU3 firmware** | eQ-3 CCU3 firmware 3.89.8 on an ELV-Charly, `armv7l`, Tcl 8.2.3, lighttpd 1.4.50, no monit. HmIPW-DRAP with a DRI16 and a DRS8 on the wired bus, one BidCos-RF central. Addons are installed at boot through a chroot. |
| **OpenCCU x86_64** | OpenCCU 3.89.8 (ova) in a VM, lighttpd 1.4.82, monit. HmIP-WRC2 and HmIP-PDT on radio, BidCos-RF wall thermostat and door contact. Installs addons live. |
| **OpenCCU aarch64** | OpenCCU 3.89.8 on a Raspberry Pi 4. No radio: ReGaHSS runs, `rfd` and `hmipserver` do not. The empty-system case. |

The scripts are [`tools/lab/addon-check.sh`](../tools/lab/addon-check.sh) and, for the write-path
study, [`tools/lab/config-pending-study.mjs`](../tools/lab/config-pending-study.mjs); both take
their target from the environment. Everything else in a run is done by hand and written down here.

---

## 2026-09-08 — task 27, the ReGa metadata provider on the CCU3 firmware

The `rega` provider of rooms and functions (`packages/backend/src/meta/regaProvider.ts`) had never
met ReGaHSS: hm-simulator's mock knows `Name()` and nothing else. This run drove the provider
itself - the built backend, `homematic-rega` as the transport - against the **CCU3 firmware** box,
its ReGa port reached through an ssh tunnel (the CCU's firewall keeps 8181 `restricted`). Every
step was checked with a separate script against ReGa's own objects. The box was left exactly as
found: `ID_ROOMS` and `ID_FUNCTIONS` were byte-identical to the baseline at the end. Nothing was
installed, no device was written to, the addon on the box was not touched.

| step | what the provider sent | what ReGa's objects said |
| --- | --- | --- |
| `start()` | the read script | 164 objects (five devices with their channels, the two virtual centrals included), 11 rooms, 10 functions, in 12 ms; `oDevice.Interface()` named `BidCos-RF` / `HmIP-RF` for every device; the RCV-50 channels are in `funcCentral` as the WebUI has them |
| `createNode` room `HMM Prüfraum "Lab"` | `dom.CreateObject(OT_ENUM)`, `Name()`, `Add` on `ID_ROOMS`, `Write(ID)` | the id came back; `dom.GetObject(id)` exists with `Type()` 3 and the name with umlaut and quotes intact; `ID_ROOMS` lists it; `WriteURL` gives `HMM%20Pr%FCfraum%20%22Lab%22`, decoded back to the original |
| `createNode` function | the same on `ID_FUNCTIONS` | the same |
| `createNode` with a parent | nothing | refused with `too-deep` before any script |
| `updateNode` rename | `Name()` by id | the new name at once; `refresh()` reads it back |
| `setMembership` one channel → room + function | `Add(id)` on both enums | the room's `EnumUsedIDs()` has the channel; the channel's `ChnRoom()` names the room and `ChnFunction()` the function - ReGa keeps the reverse index itself |
| `setMembership` a device ref → room | 33 `Add` lines | every channel of the DRS8 but `:0` in the room; read back the same way |
| `setMembership` both → nothing | `Remove` lines | the room empty, the channel's `ChnRoom()` empty |
| `deleteNode` with a member, `detach: false` | nothing | refused with `has-members` |
| `deleteNode` with `detach: true` | `Remove` on `ID_ROOMS`, `dom.DeleteObject` | `dom.GetObject(id)` null, `ID_ROOMS` without it, the channel's `ChnRoom()` empty |
| `deleteNode` function | the same | gone |
| final read | the read script | 11 rooms, 10 functions, both lists identical to the baseline; no notice raised in the whole run |

### Found and fixed

**The stock rooms and functions are translation keys.** A CCU comes with eleven rooms and ten
functions whose `Name()` is `roomLivingRoom`, `roomKitchen`, `roomHWR`, `funcCentral`… - and every
WebUI page translates the key on display (`/www/webui/js/lang/de/translate.lang.js`: `Wohnzimmer`,
`Küche`, `Hauswirtschaftsraum`, `Zentrale`). The provider showed the keys. Fixed the same day:
`REGA_STOCK_NAMES` carries the 21 keys with the German and English WebUI texts, the document shows
the translation (German unless the profile's language is English), and a rename to the translation
sends nothing - checked on the box in both languages, `roomKitchen` stayed `roomKitchen`.

### Also seen

- ReGa persists its DOM on its own schedule: `homematic.regadom` on the box was written at 06:45
  and 18:45 that day, not by the pass. What is created here lives in memory until ReGa's next save,
  the same as a room made in the WebUI.
- The CCU's firewall (`MOST_OPEN`, ReGa `restricted`) does not let the desktop or a Docker install
  reach 8181 from a network the firewall does not list; that is the CCU's setting, and the
  provider's "ReGa did not answer" is the right report for it.

### Not done

The tree dialog of task 25 was not clicked through against the box (the run drove the provider,
not the UI), no WebUI page was opened for the comparison (ReGa's objects were read directly), and
task 26's channel-0 dialog (suppression on HmIP) was not opened either - the addon on this box is an
old build and was not updated.

## 2026-09-05 — task 17, the beta hardware pass

**Build:** `3.0.0-dev.0` at commit `c4b04fd` (`BUILD_DATE` 2026-09-05T20:42Z), the three packages
from `apps/ccu-addon/build.sh`. Container replay (`container-test.sh --idle`) green before the
boxes were touched, and green again on 68 checks after the monit fix below.

**How the addon got onto each box:** the firmware's own installer over the running installation —
the package to `/usr/local/tmp/new_addon.tar.gz`, then `/bin/install_addon`. **No box was
reinstalled, uninstalled or rebooted.** Each box had the previous dev build on it, so every one of
these was an update, which is the path a beta tester will take.

### The update itself

| | CCU3 firmware | OpenCCU x86_64 | OpenCCU aarch64 |
| --- | --- | --- | --- |
| `install_addon` exit code | 0 ¹ | **0** | **0** |
| how long it took | 224 s ² | 5 s | 14 s |
| reboot needed | no | no | no |
| `/usr/local/hmm/token` kept | ✅ (md5 unchanged) | ✅ | ✅ |
| `/usr/local/hmm/config.json` kept | ✅ | ✅ | ✅ |
| `rc.d` link, lighttpd rule rewritten | ✅ | ✅ | ✅ |
| Systemsteuerung entry kept | ✅ | ✅ | ✅ |
| the box stayed up | ✅ (uptime unbroken) | ✅ | ✅ |

¹ **The CCU3 firmware's `/bin/install_addon` does not propagate the exit code** — it ends with
`sync`, so it always returns 0 and the `update_script` exit code (0 for an update, 10 for a fresh
install) cannot be observed through it. On OpenCCU the wrapper does `exit ${RESULT}` and the 0 is
the addon's own. What the CCU3 box does prove is the rest of the row.

² The CCU3 firmware installs in a chroot it builds first, copying `/bin`, `/lib`, `/sbin` and
`/etc` into a temporary directory on `/usr/local`. That is where the 224 s go; the addon's own
`update_script` is a few seconds of it.

**Found, and it only shows up when the CCU3 path is driven live:** the chroot the firmware builds
binds `/usr/local`, `/dev`, `/proc` and `/sys` — **not `/var/run`**. `update_script`'s
`rc.d/hmm stop` therefore finds no pidfile, reports "not running" and the old backend keeps running
on the deleted inodes of the replaced tree. In the firmware's own flow this is harmless (the
install runs during a reboot's shutdown, so the process is gone anyway), but it means **an addon
cannot be updated live on the CCU3 firmware without restarting it by hand**. Here the restart was
issued explicitly, which is what the boot would have done; the new build then came up with a new
pid. Nothing to fix in the addon — it is the platform's chroot — but it belongs in the addon
README's update section.

### The task 13 checklist, re-run

Everything over the box's own https with its self-signed certificate, from another machine.

| check | CCU3 firmware | OpenCCU x86_64 | OpenCCU aarch64 |
| --- | --- | --- | --- |
| `settings.cgi` with a valid session → 302 into the UI | ✅ | ✅ | ✅ |
| the cookie: `Path=/addons/hmm/`, `HttpOnly`, `SameSite=Strict`, `Secure` over https | ✅ | ✅ | ✅ |
| a wrong session id refused | ✅ | ✅ | ✅ |
| no session id refused | ✅ | ✅ | ✅ |
| the UI under the prefix (200) and its js asset (200) | ✅ | ✅ | ✅ |
| the bare prefix redirects to the slash (301) | ✅ | ✅ | ✅ |
| the generated metadata under the same prefix (200) | ✅ | ✅ | ✅ |
| the CGIs are **not** proxied into the backend | ✅ | ✅ | ✅ |
| `service.cgi?cmd=status` reports the running build | ✅ | ✅ | ✅ |
| WebSocket upgrade through lighttpd + an `ApiFrame` round trip | ✅ | ✅ | ✅ |
| the upgrade without the cookie → 401 | ✅ | ✅ | ✅ |
| a socket left idle 70 s (past lighttpd's 60 s) stays alive | ✅ | ✅ | ✅ |
| Systemsteuerung lists the addon | ✅ | ✅ | ✅ |
| the device grid fills where the box has a radio | ✅ 1 BidCos, 5 HmIP | ✅ 3 BidCos, 4 HmIP | n/a, no radio ³ |
| no JavaScript error on the page | ✅ | ✅ | ✅ |

³ The aarch64 box has no `rfd` and no `hmipserver`. It shows every interface as **not present**
(the grey dash of the back-off added in task 15) and an empty grid, which is the correct answer and
the reason that box is in the lab.

Backend RSS after the update, from `service.cgi`: 90 MB on OpenCCU x86_64.

### (a) D-31 — idle unsubscribe with no browser connected

Measured with one API session opened and closed by the addon's own bundled node, then a stopwatch
on the addon log. `--idle-unsubscribe` is 300 s, inherited from the host's default.

| | CCU3 firmware | OpenCCU x86_64 | OpenCCU aarch64 |
| --- | --- | --- | --- |
| `init('')` after the last session closed | **306 s** | **301 s** | **306 s** |
| the log line | `no user interface is open: the event subscriptions were dropped (D-31)` on all three |
| addon log lines in the next 45 s while idle | **0** | **0** | **0** |
| interfaces still polled while idle | none — the service-message poll stops with the subscription |
| resubscribe: log line after the socket opened | 1736 ms | **98 ms** ⁴ | 1544 ms |
| devices back in the grid on the next page load | 1 BidCos-RF / 5 HmIP-RF after 2.8 s | 3 / 4 after 0.2–2.7 s | none (no radio) |

⁴ The 98 ms is the x86_64 VM answering three loopback `init` calls; the two slower boxes spend most
of their 1.5–1.7 s waiting for interfaces that are not there to time out (BidCos-Wired on both, all
three on the aarch64 box). The resubscribe itself is one `init` per interface and no socket setup,
which is what D-31 promised.

**A service message raised while nothing was connected is there after the resubscribe.** On the
OpenCCU x86_64 box, with the addon idle since 21:08:29Z: `STICKY_UNREACH` was set on the BidCos-RF
wall thermostat's maintenance channel over XML-RPC (the same flag the application writes to
acknowledge one, stored by `rfd`, never sent over the air). The addon logged nothing at all while
it was idle — it did not learn about the message and did not need to. On the next page load the UI
showed it in the service-message tab **1038 ms after the page load**, with the device name from
ReGa. The flag was cleared again afterwards and `getServiceMessages` was back to the one message
the box had before.

**Found:** on the resubscribe the x86_64 box logged
`BidCos-Wired: init failed: Cannot call write after a stream was destroyed` once. BidCos-Wired is
not present on that box, so the failure is harmless and the back-off catches it a second later, but
the message says the BIN-RPC client is reused after the idle `init('')` when its socket is already
gone. It should reconnect instead of writing to a destroyed stream. Not a blocker; one line in the
backend's BIN-RPC client.

### (b) OQ-16 — the `NN_WP_WEEKDAY` weekday bit order

**Answered: bit 0 is Sunday, and the editor was already right.** Recorded as **A-17** in
[`packages/core/ASSUMPTIONS.md`](../packages/core/ASSUMPTIONS.md), with the code comment in
`packages/ui/src/lib/util/editors/switchProfile.ts` and a test that pins the table.

| bit | 0 | 1 | 2 | 3 | 4 | 5 | 6 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| value | 1 | 2 | 4 | 8 | 16 | 32 | 64 |
| day | Sunday | Monday | Tuesday | Wednesday | Thursday | Friday | Saturday |

All seven days is 127.

The measurement is the CCU's own weekly-programme dialog rather than a device write:
`/www/config/easymodes/js/HmIPWeeklyProgram.js` is byte-identical on the CCU3 firmware and on
OpenCCU (md5 `929085c9751a95b15d7ff1cc43d15414`), its `_getWeekDay()` gives every weekday checkbox
the bit value as the checkbox `value`, and `setWPWeekday()` sums the ticked ones into the hidden
`NN_WP_WEEKDAY` field the WebUI submits. Loading that file and the WebUI's own jQuery from a lab box
into a browser, rebuilding the row it emits and ticking one day at a time reproduces the whole
table. The same file says it a second way where it fills the checkboxes back in from a stored value:
a seven-character binary string, most significant bit first, Saturday at index 0 and Sunday at
index 6.

**No device was written to**, which also means the answer did not depend on the lab's HmIP-PDT
having a programme — its `DIMMER_WEEK_PROFILE` channel has 75 slots and every `NN_WP_WEEKDAY` is
still 0. The editor keeps printing the raw mask next to the checkboxes: it costs nothing, and it is
what would have made a wrong answer visible.

### (c) https, the self-signed certificate and the QR scanner

The QR scanner needs a secure context — `navigator.mediaDevices` does not exist without one — and
says so instead of failing inside the decoder (task 15). What a CCU's own self-signed certificate
does to that was the open question.

| on `https://<box>/addons/hmm/` (self-signed) | CCU3 firmware | OpenCCU x86_64 | OpenCCU aarch64 |
| --- | --- | --- | --- |
| `isSecureContext` | **true** | **true** | **true** |
| `navigator.mediaDevices` present | **true** | **true** | **true** |
| the cookie flow works over https | ✅ | ✅ | ✅ |
| the cookie carries `Secure` over https | ✅ | ✅ | ✅ |
| the same page over plain http: `isSecureContext` | false | false | false |
| the same page over plain http: `mediaDevices` | absent | absent | absent |

So **the scanner works over the CCU's own https**, certificate warning and all, and the hint is
shown exactly where it has to be: on `http://<box>/addons/hmm/`, which is the address the CCU's
Systemsteuerung button uses when the WebUI itself was opened over http. Nothing to change; the hint
is correct on both sides.

### (d) device pictures come from the CCU

`GET /addons/hmm/images/<device type>` answers with `X-Hmm-Image-Source`.

| | CCU3 firmware | OpenCCU x86_64 | OpenCCU aarch64 |
| --- | --- | --- | --- |
| an HmIP type | `ccu`, image/png, 28 kB (HmIPW-DRS8) | `ccu`, image/png, 34 kB (HmIP-PDT) | `ccu`, image/png, 34 kB |
| a BidCos type | `ccu`, image/png, 98 kB | `disk` (the same picture, from the cache of an earlier fetch) | `ccu`, image/png |

`ccu` means the chain into the CCU's own image directory worked, `disk` that the file was already
in the profile's cache from a previous fetch — both mean it came from the CCU, and neither is the
bundled webp fallback. The aarch64 box has none of these devices and still delivers their pictures,
because the image directory is the firmware's, not the device list's.

### (e) D-32 — the optional login (task 18), OpenCCU x86_64

The eight steps of `apps/ccu-addon/README.md`, against the **real** ReGaHSS and the real
authentication daemon on UDP 1998. Nothing here had ever met either of them.

| step | result |
| --- | --- |
| 1 switch to `rega` from `settings.cgi?cmd=config` | ✅ writes `HMM_AUTH_MODE=rega` into `etc/hmm.env` and restarts the service; the log says `login: CCU credentials required (ReGa), sessions last 24 h of inactivity` |
| 2 the login page instead of the UI | ✅ the page has the password field; an asset is a plain 401, not a login page |
| wrong password | ✅ 401 |
| the right password | ✅ 302 with `hmm_session`, `HttpOnly`, `Path=/addons/hmm/`, `Secure`; the UI opens with that cookie and no longer shows the form |
| 3 the level ReGa reports | **level 8** for the admin user, in the log and in `session.info` |
| 4 the Systemsteuerung hand-over still bypasses the login | ✅ `settings.cgi` with a valid session still answers 302 and its token cookie alone opens the UI |
| 5 the rate limit | ✅ `401 401 401 401 401 429 429` — and exactly **5** `login: refused` lines for 7 attempts, so the CCU was not asked a sixth time |
| 6 logout | ✅ 302, and the dead cookie gets the login page again |
| 7 ReGaHSS restarted under a live session | ✅ the session kept working; the addon logged nothing about it |
| 8 back to `token` | ✅ `HMM_AUTH_MODE=token`, service restarted, the UI open again without a login |

**On the CCU3 firmware (Tcl 8.2.3)**, the part the README asked for plus one login round:
`settings.cgi?cmd=config` renders with no Tcl error, names the current mode, switching writes
`HMM_AUTH_MODE` into `etc/hmm.env` **once** (no duplicate line on the second switch) and restarts
the service; a wrong password is 401, the right one 302 with a session cookie, the log says
**level 8**, logout is 302. Both boxes were left in `token` mode.

### monit was watching nothing — found and fixed

`monit status hmm` said **"Not monitored"** on both OpenCCU boxes after a clean install. The cause
is `ONREBOOT NOSTART` in `monit.cfg`, which is there so that monit can never start a second backend
at boot — it also leaves the check unmonitored every time monit starts or reloads, and nothing ever
armed it again. So neither of the two alerts in `monit.cfg` had ever been able to fire.

`rc.d/hmm` now arms monitoring after it has started the service and disarms it before it stops one,
the way RedMatic's `bin/monit-start` does. Verified by putting the corrected script on both OpenCCU
boxes and restarting: the aarch64 box went from "Not monitored" to **"Monitored / OK"**. The CCU3
firmware has no monit and the guard is unchanged there. The fix is committed; the packages on the
boxes are still the ones built before it, so the next build is the first that carries it into a
package.

### Also found

- **`VirtualDevices` answers `getServiceMessages` with something that is not XML-RPC**, on all
  three boxes, every 60–75 s: `getServiceMessages failed: Invalid XML-RPC message`. It is an `INFO`
  line, so nothing breaks, but it is the only thing in the addon's log on an idle box and it will
  be the first thing a beta tester reports. Worth either a one-off notice with a back-off, or
  leaving `VirtualDevices` out of the service-message poll.
- **`tools/lab/addon-check.sh` had never been run against hardware** and was looking in the wrong
  place for almost everything (a `VERSION` file, a lighttpd `conf.d` fragment, `monit_local.cfg`,
  the profile inside the addon tree, the log in `/var/log/messages`), and its three HTTP checks
  passed printf arguments to `curl -w`, which does not take them. Corrected in the same commit as
  the monit fix, and re-run against the OpenCCU x86_64 box.

### What was deliberately not done

- No fresh install, no uninstall and no reboot on the CCU3-firmware box (the task's instruction: an
  update only). Fresh install, uninstall, reinstall and purge on that platform therefore still rest
  on the container replay and on the task 13 run.
- **No install mode was opened and nothing was paired or deleted.** The install-mode checks of the
  feature inventory stay on the simulator.
- The D-32 login was exercised with the lab's admin user only. A user at a lower ReGa level (the
  levels the login refuses or admits) was not tested — that needs a second CCU user.
- Nothing was tested against a production CCU, and no DRAP was touched.

---

## 2026-09-05 — task 13, the first addon install

The addon's first run on the three boxes, at `3.0.0-dev.0` before the device-image fix: the
Systemsteuerung entry, the session check with a right and a wrong session id, the UI, assets,
metadata and images through the addon path, a WebSocket round trip and a 401 without the cookie,
the device lists filling where the box has a radio, a ten-minute idle session and a `service.cgi`
restart. Update, uninstall and reinstall were verified on both OpenCCU boxes; the CCU3-firmware box
got the single reboot install (ssh back after 239 s, addon started at boot, all interface processes
and the wired devices back). The measurements — package and installed sizes, inodes, RSS — are in
[`roadmap-archive/task-13.md`](../roadmap-archive/task-13.md).

## 2026-09-05 — task 6, the write-path study

The `CONFIG_PENDING` study on the CCU3-firmware and OpenCCU x86_64 boxes: what `rfd` and
`hmipserver` really do with a bad `putParamset`, which recoveries work on which interface, and the
channel that a bad write left permanently unwritable. Written up in
[`config-pending.md`](config-pending.md), repeatable with
[`tools/lab/config-pending-study.mjs`](../tools/lab/config-pending-study.mjs).
