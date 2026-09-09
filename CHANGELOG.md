# Changelog

All notable changes to the Homematic Manager. Grouped by what a user notices rather than by
component; the numbers in brackets are GitHub issues and pull requests.

Versions before 3.0 are in the [releases](https://github.com/hobbyquaker/homematic-manager/releases);
2.7.1 (2023-01-28) is the last 2.x release.

## [Unreleased]

- **The refresh button of the service-message tab reads the CCU again** (#146). It asked
  `serviceMessages.list`, which the backend answers out of its cache - that cache is filled by the
  events and by a poll every five minutes, so the button could not change anything about the list
  it was looking at. There is a `serviceMessages.refresh` now that makes the round trip
  (`getServiceMessages` per BidCos interface, the `:0` sweep on HmIP) and answers with the fresh
  list. Both refresh buttons - the Funk tab's as well - turn while they work and cannot be pressed
  twice, so an action that takes a moment is visible; the Funk one re-reads the device list too,
  because which receiver a device is configured for is part of its description.

- **The Funk grid no longer draws a dot behind every receiver marker** (#148). The marker column
  was 30 px wide for a 22 px button, so the cell overflowed and the browser abbreviated it with an
  ellipsis - of which one dot was visible, in every row of both marker columns. The track is now
  the marker plus the cell's padding (`--hmm-mark-size`, the arithmetic the picture column already
  used), and a cell of a fixed column - a picture, a glyph, a control, never running text - clips
  instead of abbreviating.

## [3.0.0-beta.8] — 2026-09-09

Two reports from Baxxy13 against the CCU addon on OpenCCU (#140, #141), both in the addon's
packaging scripts, the oldest open wish of the tracker (#69) in the Funk tab, and CCU-Jack
confirmed as a user-defined interface (#135).

- **Assign the best receiver** (#69). The Funk tab has a button next to `setBidcosInterface` that
  proposes, for every BidCos-RF device, the interface that receives it best - from the levels the
  interfaces last measured, as a list the user confirms and never as a write on its own. A device
  whose best interface clears the configured one by at least the margin (6 dB by default, the
  noise between two reads of the same link; changeable in the dialog) is ticked, one that is
  better by less is listed unticked and says so, one whose configured receiver has no level of it
  while another has is listed unticked as well; devices already on their best receiver, devices no
  interface has measured and devices that roam are a line of counts. Each ticked device is one
  `setBidcosInterface` with roaming off, in order, with a progress line; the device list and the
  levels are re-read afterwards, a refused write leaves the dialog open with the device still in
  it. With a single interface the button is off. Core's `proposeReceivers` is the pure part, with
  its own tests; the dialog is tested against the mock transport. Not tried against hardware with
  two receivers - the lab has none.
- **The Zusatzsoftware page shows the addon's umlauts as `GerÃ¤te`** (#140, `BUGS.md` B-3). The
  WebUI reads an addon's `rc.d/<name> info` lines through a Tcl pipe whose system encoding is
  Latin-1 on the CCU3 and OpenCCU alike and prints them into its Latin-1 page as they are, so the
  UTF-8 umlauts of the `Info:` line - and of the description in `hm_addons.cfg`, which the
  Systemsteuerung page renders the same way - came out as two characters each. Both now spell
  their umlauts as HTML entities (`Ger&auml;te`), which every encoding survives; the package test
  and the container test check that nothing outside ASCII is in either.
- **The WebUI now reports an addon update as finished** (#141, `BUGS.md` B-4). On OpenCCU the
  WebUI runs `/bin/install_addon` inside its own `cp_software.cgi` request and shows its
  "installation successful" popup only when that has returned. The addon's `update_script` ran
  `/etc/init.d/S50lighttpd restart` on every install - even an update whose proxy rule was byte
  for byte the same - and that restart cut the very connection the popup goes out on: the browser
  never heard back and the Zusatzsoftware dialog sat there until an F5. The rule is now compared
  with the installed one and lighttpd is left alone when nothing changed; when the rule is new or
  changed, lighttpd is told with `S50lighttpd reload` - a graceful restart on both firmwares
  (SIGUSR1 with `server.graceful-restart-bg` on OpenCCU, SIGHUP to lighttpd-angel on the CCU3
  firmware), so the running request finishes and the new rule is live at once - and where an init
  script has no `reload`, with a detached restart a few seconds later. The uninstall, which the
  WebUI runs the same way, does the same. The container test now runs lighttpd the way OpenCCU
  does (under lighttpd-angel, with its `S50lighttpd`) and drives the install and the uninstall
  through a stand-in for `cp_software.cgi`: against the beta.6 package every one of those requests
  died with an empty reply, against this one they are answered.

- **CCU-Jack as a user-defined interface works** (#135). Verified for the first time, against a
  CCU-Jack built from its `master` with two virtual devices and no CCU behind it: host, port 2121,
  XML-RPC, path `/RPC3` - `init` with the callback, the `newDevices` callback, the device list,
  paramset descriptions and values, `setValue` and the event it raises, `ping` and its `PONG`; the
  watchdog keeps the interface connected. No code changed for it; `docs/migration-from-2.x.md`
  names the five fields.

### Known issues

- Neither addon fix has been on a CCU yet: the encoding was reproduced from the WebUI's own `cp_software.cgi`
  and Tcl's system encoding on the lab boxes, the lost answer in the container with the real
  installer flow. The first update from beta.7 to the release that carries this still goes through
  beta.7's `update_script`, which is the old one - the popup appears from the update _after_ that.
- The best-receiver dialog has only met the mock transport: the lab has one BidCos-RF receiver
  per box, so no CCU with a LAN gateway has confirmed the proposals yet.
- Everything under beta.7's "Known issues" still applies.

## [3.0.0-beta.7] — 2026-09-08

Two reports from the first tester of beta.5 (NickHM, in the forum thread of the announcement and
then as #142 and #143), both about what the grids say - fixed the way 2.7 had it.

- **The receiver of a BidCos-RF device is named in the device grid and over its Funk columns**
  (#142, `BUGS.md` B-2). The device grid on BidCos-RF has an `INTERFACE` column that names the
  receiver a device is routed through - the CCU's own radio module, a LAN gateway - as
  `listBidcosInterfaces` describes it, and by serial when the gateway has no description; `⇄`
  behind it says roaming is on. The Funk grid has 2.7's second header row back: one cell per
  interface over its `← dBm` / `→ dBm` columns with the serial and, in small print, the
  description (the serials had been squeezed into every dBm label, where they were cut off), and
  next to the two levels the marker of the configured receiver - `◉` for the one the device is
  set to, `○` for the others; clicking a marker opens `setBidcosInterface` on that gateway. In
  that dialog the bold row is now the configured receiver; it was the one heard best, which is
  still named under the table. HmIP and Wired have no receivers and show none of this.
- **VirtualDevices: the grid lists what the header counts** (#143, `BUGS.md` B-1). A filter typed
  into a column of the device grid outlived the switch to another interface: the reporter's 31
  groups were counted in the popup, hidden by a filter typed for BidCos-RF addresses, and the
  empty grid said the interface had reported nothing. The column filters and the scroll position
  now belong to the interface they were typed for and are cleared on a switch, the device grid
  drops its selection with them, and while a filter hides rows the count says "Showing 0 of 31"
  and the grid says that no row matches, with a button to clear the filter - in every grid that
  has a filter row. The groups themselves were never the problem: 31 of them in the exact shape
  a CCU3 sends render in the component test, and one goes through the real XML-RPC path in the
  backend and e2e suites.

### Known issues

- The receiver names, the header row and the marker have met hm-simulator's one interface and the
  demo data; a CCU with a LAN gateway has not shown them yet. The VirtualDevices fix reproduces
  the reporter's screenshot in a test, not on his CCU.
- #140 (umlauts in the addon overview) and #141 (no feedback when an addon update has finished),
  both reported against the CCU addon on OpenCCU, are open and not in this release.
- Everything under beta.6's "Known issues" still applies.

## [3.0.0-beta.6] — 2026-09-08

Rooms and functions - in the grids, in a dialog, and on a CCU straight from ReGa - plus the
reworked HmIP service-message suppression, and the Docker cookie question answered.

- **Rooms and functions can be edited** (task 25, D-40). The device and channel grids gain a
  _Rooms_ and a _Functions_ column; select rows and use _Assign to room_ / _Assign to function_
  (toolbar or context menu) to put them into, or take them out of, a node - one write for the
  whole selection. A filter by room and by function sits above the grid; a floor - a room with
  rooms below it - matches everything under it. The new _Rooms and functions_ dialog adds,
  renames, moves and deletes nodes and lists what is still assigned before a non-empty node
  goes. Beside the interface mark a small indicator says where names and rooms come from (this
  profile, an openccu-lite box, or ReGa) and whether the store answers and takes writes; the
  settings dialog has a _Names and rooms_ section for the provider choice and the API token.
- **Rooms and functions on a CCU come from ReGa** (task 27). With ReGa switched on and no
  openccu-lite box, the rooms and functions are the CCU's own - read and written through ReGa's
  objects, so what is assigned here is what the WebUI shows, and the other way round. ReGa's
  rooms are a flat list: the dialog says so and offers no floors there. A ⟳ in the dialog reads
  the CCU's lists again (ReGa announces no changes by itself). `metaProvider` accepts `rega` to
  insist on it. Tried against a CCU3 (firmware 3.89.8) on 2026-09-08: create, rename, assign,
  read back, remove and delete all did what ReGa's own objects then showed; the roadmap archive
  has the run. Found there and fixed: the rooms and functions a CCU comes with are stored under
  translation keys (`roomKitchen`), which the WebUI translates on display - the list here now
  shows them the same way (German, or English when the profile's language is English).
- **The Docker image's cookie default is decided (D-41, OQ-15):** the image keeps
  `HMM_ISSUE_COOKIE=true`, and the host now prints one warning line at start whenever it hands
  the token cookie to every browser on a non-loopback bind - whoever reaches that port is in -
  with the three ways to lock it down. `HMM_ISSUE_COOKIE=false` silences it.

- **HmIP service-message suppression, reworked after the maintainer's look at beta.5.** The
  _Service messages_ box on top of the VALUES dialog is gone. Instead, the paramset dialog of
  channel 0 on an HmIP interface shows a _suppressed_ checkbox per service parameter inside the
  parameter table: in the MASTER dialog as rows of their own at the end (the parameters live in
  the VALUES paramset), in the VALUES dialog on the datapoints' own rows. A checkbox sends nothing;
  _Apply_ under the table opens the write preview with the exact `suppressServiceMessages`
  calls, one per changed checkbox, and sends them on confirmation. The service-messages tab has a
  _Suppress_ / _Unsuppress_ action per row on HmIP. The RPC console draws the argument form for
  `suppressServiceMessages` and `getSuppressedServiceMessages` once the interface lists them.
- **Removed: the "quiet mode" of the service-messages tab** (#102's bell button). It only muted
  the toast for a new message and was stored in the browser; Homematic has no such state for a
  service message, and the suppression above is what the interface really offers.

- **Fixed (found by the e2e suite before the tag):** with ReGa switched on but not answering the
  rooms-and-functions script - hm-simulator's ReGa, or a ReGa that runs no script - the automatic
  choice took ReGa as the store anyway, showed it as unreachable, and a rename never reached the
  CCU. `auto` now falls back to the profile's store after a failed first read (`metaProvider:
rega` still insists), and a rename goes through the name service for every object the ReGa store
  does not hold. And the _PARAMSETS_ column no longer shrinks with the window: the new _Rooms_ and
  _Functions_ columns had squeezed it until the VALUES button sat under the next cell.

### Known issues

- **Not seen on hardware yet:** the suppression checkboxes and the per-row action (task 26) have
  only met the demo transport - no real HmIP server has answered `getSuppressedServiceMessages`
  here - and `ROUTING_TABLE` has not been read from a real router. The rooms and functions dialog
  (task 25) was not clicked through against a CCU; the ReGa provider behind it was.
- **ReGa behind the CCU's firewall:** a desktop or Docker install reaches ReGa's port 8181 only
  from a network the CCU's firewall lists (`restricted` is the CCU's default for that port). The
  header's indicator then says ReGa did not answer, and rooms and functions stay in the profile.
- A `°` from `rfd` or CUxD over **BIN-RPC** still arrives as U+FFFD (`binrpc@4.2` decodes strings
  as UTF-8); addon and CUxD paths only.

## [3.0.0-beta.5] — 2026-09-08

The first beta that talks to the HmIP addendum, and a smaller change for a box.

- **HmIP service messages can be suppressed.** The VALUES dialog of a channel on an HmIP
  interface shows a _Service messages_ section: one checkbox per service datapoint (`UNREACH`,
  `LOWBAT`, the `ERROR*` family…), _Suppress all_ / _Unsuppress all_, backed by eQ-3's
  `getSuppressedServiceMessages` and `suppressServiceMessages`. A suppressed message is one
  whose parameter reports a value that raises none — the CCU shows it as inactive. An interface
  that does not offer the methods (BidCos, Homegear) shows nothing. Not yet tried against a
  real HmIP server; the demo transport has no such method.
- **An HmIP router's routing table, as a graph.** Opening `ROUTING_TABLE` on a device with the
  router module enabled draws the router in the middle, its neighbours and next hops on a ring,
  what is routed through them outside, hops and RSSI on the edges, static routes dashed, with the
  full table underneath. Read once when the dialog opens: every read goes to the device over the
  air. Not yet seen with a real router.
- **`127.0.0.1` is offered as a callback address.** On an openccu-lite box the interface
  processes bind the loopback only, so for the Homematic Manager running on the box it is the
  one address they can call back; it was never in the list. Appended last, so nothing that took
  the first candidate changes.
- **Fixed:** a name written to a metadata store may no longer contain control characters
  (openccu-lite refuses them; the store now says so before the box does).

## [3.0.0-beta.4] — 2026-09-06

- **Fixed:** stopping the backend did not wait for the metadata detection, so a store that
  finished loading afterwards could write a cache file back into a profile directory its owner had
  already deleted. Nothing a user would have seen, everything CI saw: three unrelated suites failed
  with `ENOTEMPTY` on 3.0.0-beta.3, whose npm package was therefore never published.

## [3.0.0-beta.3] — 2026-09-06

Rooms and functions, and openccu-lite (D-40, task 24).

- **Rooms, functions, floors — and any other taxonomy you make.** The Homematic Manager now keeps a
  taxonomy of its own in the profile (`meta.json`), so a user on Homegear, on a bare `rfd` or on
  the desktop has one for the first time. It is reachable through the API today; the grid column,
  the "assign to room" of a multi-selection and the tree dialog are task 25.
- **[openccu-lite](docs/openccu-lite.md) support.** On that CCU firmware without ReGaHSS, names,
  rooms and functions come from the box's metadata store and are **written back** to it: a rename
  in the grid, a new room, a channel moved into one. A change made anywhere else on the box is in
  the grid within a second, over the box's change stream. Which store is used is decided at
  runtime by one call (`GET /api/meta/v1/version`) on the host that is configured — a profile that
  moves between a CCU and a box needs no edit, and on a CCU nothing about ReGa changes (D-2).
- **The addon's login on openccu-lite** (`--auth-mode occulite`, the default there): the box's
  shell hands the addon the user's session, the addon checks it against the box and takes it from
  there; there is no second login page, because the users are the box's. Reads use the box's
  read-only local token, writes use that user's session — so a rename is attributed to a person.
  The ReGa login of D-32 on a CCU is untouched.
- Off the box (desktop, npm, Docker) the store needs an API token from the box's _Users_ page,
  pasted into the connection settings; without one the app runs on its own names and says so.
- New connection options: `metaProvider` (`auto`, `local`, `occulite`), `metaToken`, `metaUrl`.
- **Fixed:** a connection option added by a newer version was silently dropped when the profile was
  loaded or saved, because the connection is rebuilt field by field. Found while testing this.

## [3.0.0-beta.2] — 2026-09-06

The second public pre-release, cut from `master` (D-38). Everything of beta.0 plus:

- No "unknown method setReadyConfig" notices at start: the callback every interface process sends
  after `init` is known now, and a genuinely unknown method is reported once per session.
- The RPC log drawer takes half the window and can be dragged; the page itself never scrolls any
  more, only the grid inside a tab, and the header stays put (the app shell bounds itself to the
  viewport instead of trusting its mount element).
- The settings dialog is grouped into titled sections (connection, callback, interfaces, ReGa,
  behaviour) in a two-column form; version, device data and licence sit at its foot.
- A GitHub icon in the header opens the project page; the "?" menu and the About dialog are gone.
- beta.1 (not released): the two fixes above for the start-up notices and the drawer.

## [3.0.0-beta.0] — 2026-09-06

The first public pre-release of the rebuild, for testers: install with
`npm install -g homematic-manager@next`, the addon packages and the desktop installers from the
GitHub release, `ghcr.io/hobbyquaker/homematic-manager:3.0.0-beta.0`. Everything below is what
3.0.0 will contain; "Known issues" is what is still open at the beta.

**A complete rebuild.** The 2.7.1 code (Electron 4 from 2019, jQuery, free-jqgrid, no tests) was
replaced by a tested TypeScript core, a Svelte 5 user interface and a Node backend. The tabs, grids,
dialogs and workflows are deliberately the same as 2.7 — the implementation changed, not the design.
The 2.7.1 sources stay under `legacy/` for reference until 3.0 ships.

Development runs on `master` (D-38) with the `3.0.0-beta.n` counter. **3.0.0-beta.0 is a
published pre-release** (2026-09-06) with the desktop installers, the CCU addon packages and the
Docker image; the beta's npm package follows. What a 2.x user should read first is
[docs/migration-from-2.x.md](docs/migration-from-2.x.md).

### Delivery: four install types instead of one

2.x was a desktop app. 3.0 runs the same backend and the same UI in four places, sharing one
`config.json` format so a user can move between them:

- **CCU addon** for CCU3 firmware ≥ 3.61.5, ELV-Charly and OpenCCU, in three architectures
  (`armv7l`, `aarch64`, `x86_64`) — on the CCU itself, behind its own lighttpd, opened from
  _Systemsteuerung_, with no address to configure and no port to open.
- **Desktop app** for Windows 10+ (x64, arm64), macOS 12+ (universal — Apple Silicon, #139) and
  Linux glibc 2.31+ (x64, arm64) [#115].
- **npm package** with `--install`, which creates a system user, a hardened systemd unit and a state
  directory, with a Proxmox LXC as the recommended server deployment.
- **Docker image** for `amd64`, `arm64` and `arm/v7`.

**32-bit ARM desktop builds are gone**: Electron 44 publishes no `linux-armv7l` binary. Such a
machine runs the CCU addon or the npm package, both of which are plain Node [#115, #139].

The **npm package is `homematic-manager`** (D-33) — the name 2.x had on npm. `npm install -g
homematic-manager` used to give the 2.x desktop app and now gives the server; the desktop app is an
installer from the release. The 1.x versions under that name stay deprecated, and until 3.0.0 moves
the `latest` tag a pre-release has to be asked for by name: `npm install -g homematic-manager@next`.

### Safety: the paramset write path

This is the change with the largest consequence, and it comes out of a measurement on real hardware
(the study is [docs/config-pending.md](docs/config-pending.md)).

- **`putParamset` sends only changed, validated parameters**, and every write shows a preview of the
  exact `putParamset(address, paramset, struct)` call first, with a reason for every parameter that
  was dropped [#98].
- **Multi-apply is restricted to channels with an identical paramset description.** 2.x matched by
  channel _type_, and `MAINTENANCE` has 23, 21 or 9 MASTER parameters depending on the device.
  Channels that do not qualify are listed with the reason instead of being silently included [#98].
- **Every write is read back**, because `rfd` answers `ok` to writes it silently ignores (a `FLOAT`
  sent as a plain integer) or clamps (an `INTEGER` above `MAX`).
- **The two meanings of `CONFIG_PENDING` are distinguished**: a BidCos device with a queued
  configuration that will take it at its next wake-up, versus an HmIP channel that rejected
  something. Only the second gets a repair action.
- **`devices.repairConfig`** dry-runs first, lists the corrections it can make, offers the
  BidCos-only recoveries (`clearConfigCache`, `restoreConfigToDevice`, `determineParameter` — all of
  which answer `-1` on hmipserver) and says plainly when a channel is beyond repair and needs
  re-pairing.
- **ENUM values are sent as their index** everywhere. Both interface processes were measured to
  accept both encodings and to read back the index, so an enum no longer looks changed on every
  write.

### Devices

- The 2.7 grid with its channel sub-grid, device images, decoded flags, `RX_MODE` and `SUBTYPE`
  columns with the rules of 2.x (`SUBTYPE` on HmIP only, `RX_MODE` not on BidCos-Wired).
- The firmware column's update button really disappears when the update has arrived [#95, #113].
- Rename (device, `:0` and optionally every channel), delete with the two flag dropdowns, replace
  through `listReplaceableDevices`, `restoreConfigToDevice`, `clearConfigCache` and repair.
- `reportValueUsage` over a whole selection of channels [#18, PR #138].
- Naming a device right after it pairs [#24].
- BidCos install mode with mode, serial and **temporary key** [#20]; `searchDevices` on
  BidCos-Wired; HmIP with SGTIN and key or key server; a QR scanner that works more than once,
  loaded lazily and started only on request [#112]. The scanner says that it needs https instead
  of failing inside the decoder — a browser hands out no camera on a plain-http page.
- A link count per channel, and "create a link as sender / as receiver" straight from the channel
  sub-grid [#25].
- An **unreach counter per device**, edge-triggered and persisted per CCU, plus an opt-in automatic
  `STICKY_UNREACH` acknowledgement [#26].
- **Smoke-detector teams** on BidCos through `listTeams` / `setTeam` [#97]. HmIP smoke groups are
  built through the group process on `/groups`, outside the RPC catalogue, and are therefore out of
  scope by D-1.

### Paramset editor

- The control for each parameter is decided from the description alone, with the generated device
  metadata layered on top: display order, conditional visibility, option presets, cross-validation,
  labels, enum value names and help texts.
- "Not used" / "infinite" comes from the parameter's own `SPECIAL` entry instead of the hard-coded
  111600 s, which was the BidCos-RF value and wrong on BidCos-Wired (16383000 s) and elsewhere
  [#96].
- A `100%` unit is a fraction on the wire and a percentage on screen.
- `VALUES` has the per-datapoint `setValue` back.
- **Five device-specific editors** on a plug-in point above the generic form: the heating week
  programme (four naming shapes recognised from the description, including the 24-slot
  `TIMEOUT`/`TEMPERATUR` shape a Max! thermostat answers through Homegear) [#100], the HmIP
  switching programme, blind and shutter calibration in seconds beside the raw value, duration
  pickers for every base/factor and HmIP unit/value pair, and plain names for enum values the
  description only knows as numbers. A checkbox shows the raw parameters as well.

### Links

- The grid with both device images and the defective mark the WebUI uses [#79].
- Add through the role matrix, live as the sender selection changes.
- Remove a whole selection at once [#80].
- Play short and long on BidCos-RF only; `setLinkInfo` [#82].
- The link paramset editor with the easy-mode profiles of the receiver/sender pair, the sender's full
  option list with only the profile's _fixed_ parameters greyed out, an expert view that shows
  everything immediately [#105], and `UI_HINT` written on apply so the CCU's own WebUI does not call
  the link "expert".
- **Easy modes for every HmIP receiver** and for WINMATIC, from pinned openccu-data artifacts: 3521
  link profiles over 725 receiver/sender combinations [#50, #22].
- **A name and a description per pair** of a multi-link, instead of one name for the whole set
  [#87].
- **Link profile templates**: a tuned profile saved under a name and applied to another link of the
  same receiver/sender kind. Only templates whose paramset description is identical are offered,
  and applying one fills the form and writes nothing [#21].
- **Changes across several links (and paramsets) staged and written with one Apply** [#124]: a
  review dialog over the paced write queue with progress and cancel; a failed entry keeps its
  reason and stays in the set.

### Radio (RSSI)

- The gateway grid with a receive/send pair per gateway and a peer sub-grid.
- The HmIP matrix built from `RSSI_DEVICE`/`RSSI_PEER` events against the access point.
- "Heard best by" per device [#69].
- `setBidcosInterface` reads the assignment out of the device's own `INTERFACE` and re-reads it
  afterwards, so no interface is falsely marked active while roaming [#122].

### Service messages and events

- Acknowledge one or all — only `STICKY_UNREACH` and `SABOTAGE` can be acknowledged, and the button
  says so when it is off. Where ReGa is available the acknowledgement is also written there, so the
  CCU's own WebUI stops showing the message [#94].
- **Toasts and an RPC log drawer instead of the modal pop-up** [#77], with a persisted quiet mode
  [#102].
- The event view has two filter boxes, a pause that freezes the view, and a per-device counter,
  which is what makes it useful for duty-cycle hunting [#129].

### RPC console

- A generated argument form for the whole 51-method catalogue: struct rows for a paramset, checkboxes
  for a bit field, a select for a fixed value set, the interface's addresses as a datalist [#27].
- The exact tuple is printed above the form, so `device:channel` cannot be lost between the field and
  the call [#136].
- A history that refills the form, and the raw response including faults.

### Configuration and startup

- **The endless "loading"** on a slow or partly reachable CCU is gone: the interface manager has an
  init / ping watchdog / re-init handshake, and the port probe runs in the background and never
  blocks the UI [#121, #126, #134, #93].
- **2.7.1 not starting on Windows 10/11** is answered by the new Electron host [#132, #133]; macOS
  Sonoma likewise [#137].
- **A configuration change no longer restarts the app.** 2.x saved the file, called `app.relaunch()`
  and killed the process; the backend reconnects instead and the open tab survives.
- **Quitting waits for the backend** to de-register its callbacks at the interface processes, bounded
  to eight seconds, instead of racing a 15 s timer against `process.exit(0)`.
- CCU discovery over UDP as a button in the settings dialog.
- **User-defined extra interfaces** (name, host, port, protocol, path) with validation [#135, D-13];
  CUxD and VirtualDevices are configured explicitly instead of only being port-probed [#128].
- **ReGa is optional** [D-2]: a system without it works fully on locally stored names and shows a
  status indicator. A ReGa 401 no longer crashes the app [#127]. Where it is there it can also
  confirm new devices in the inbox [#54].
- **An interface whose port refuses backs off** from 15 seconds to five minutes with one notice per
  outage, is marked as not present in the header, and stops filling the log. BidCos-Wired is
  enabled in the default interface list and does exactly this on every system without a wired
  gateway.
- **The web host and the addon de-register from the interface processes while no browser is
  connected** and re-subscribe on the next page load (`init('')` after five minutes; D-31). Default
  on for the addon, the npm install and Docker, off in the desktop app, and configurable with
  `--idle-unsubscribe` / `HMM_IDLE_UNSUBSCRIBE`.
- Per-interface host, port, TLS and authentication [#106].
- **The CCU addon can ask for a CCU login** (D-32): the button in _Systemsteuerung_ opens the app
  directly as before, but a bookmark straight to `/addons/hmm/` gets a login page checked against
  the CCU's own users, with a session cookie, a logout, and five failed attempts a minute before
  the CCU is asked no further. Off by default, switched on from the addon's own settings page.
- Unhandled errors are always logged, not only when `showUnhandled` was set, and the dialog appears
  once rather than once per error.

### Interface, language and appearance

- **The whole UI is German and English**, with plurals and interpolation, switchable at runtime
  [#119, #29, #28, PR #130]. Turkish easy-mode strings are kept as a fallback locale.
- **Dark mode** follows the OS setting by default, with a manual switch that is remembered; every
  colour that carries meaning (RSSI classes, service-message severity, connection marks) is asserted
  in both themes.
- Cut, copy and paste work on Windows and Linux. 2.x built its Edit menu from macOS-only `selector:`
  strings, so those three items did nothing anywhere else.
- There is a View menu (reload, developer tools, zoom) and a Help menu with the issue tracker and the
  log folder.
- Device pictures come from the connected CCU with a local cache, and a small bundled webp subset
  answers for installations without one (Homegear, a bare `rfd`).

### Updates and releases

- The updater **downloads nothing and installs nothing without being asked**: it notifies, the user
  asks for the download, the user confirms install-on-quit. It can be switched off through
  `host.json` or `HMM_DISABLE_AUTO_UPDATE`. The "install update" exception is gone [#90].
- Every release artefact ships a **CycloneDX 1.6 SBOM** and a signed GitHub attestation, so
  `gh attestation verify` works offline against a downloaded file [D-27]. The SBOMs list the runtime
  that is not an npm dependency — Electron with its Chromium, Node and V8, the bundled Node and
  Alpine packages of the addon, the base image of the Docker build — so a CVE in one of them is
  searchable per release.
- Release notes are generated from the commits [#66].

### Removed

- **The "prefer BIN-RPC" option** and any protocol choice in the settings dialog. No CCU listens for
  BIN-RPC on the LAN: `rfd` and `hs485d` take it on the loopback (32001/32000) and the public ports
  2001/2000 are lighttpd's XML-RPC proxies. Off the CCU everything built-in is XML-RPC; BIN-RPC
  remains for the addon's local mode and for CUxD on 8701 [D-28].
- **Support for the HVL addon** — the project is dead [#123, D-19].
- **Homegear-specific code**, including the `setName` special case. Homegear keeps working through
  the generic XML-RPC path where it behaves like a CCU [#41, #59, #60, #100, #106, D-20].
- **32-bit ARM desktop builds** (see above).
- The 2015 easy-mode conversion, the bundled 34 MB of device images and the hand-maintained string
  table, all replaced by pinned openccu-data artifacts. No receiver type and no sender combination
  was lost; 832 of 837 shared profiles are parameter-identical, and 10 profiles, 1 parameter and 4
  fixed values differ because the CCU's own data moved on since 2015.

### Migration from 2.x

- On the very first start the 2.x configuration is imported **once** — CCU address, TLS,
  authentication, language, RPC pacing, RPC log folder and callback address — from
  `%APPDATA%\hm-manager\config`, `~/Library/Preferences/hm-manager/config` or `~/.hm-manager/config`.
  The 2.x caches are discarded on purpose, and 2.x itself is left untouched [D-17].
- Details, and everything that changed in behaviour, in
  [docs/migration-from-2.x.md](docs/migration-from-2.x.md).

### Licence

- The 3.0 code base is **AGPL-3.0-or-later**; 2.x was GPL-3.0. The 2.x sources under `legacy/` keep
  the contributions of others and stay **GPL-3.0-or-later**, which GPLv3 section 13 lets the AGPL
  work combine with. The generated device data under `data/dist/` is eQ-3 data and stays under the
  **Homematic Software License 2.0** — see [data/NOTICE.md](data/NOTICE.md) [D-26].

### Known issues

- A `°` from `rfd` or CUxD over **BIN-RPC** arrives as U+FFFD: `binrpc@4.2` decodes strings as UTF-8.
  This affects the CCU addon and CUxD, not the XML-RPC path; the fix is a one-line change upstream.
- The **Docker image issues its session cookie on a non-loopback bind** (`HMM_ISSUE_COOKIE=true`),
  so whoever reaches the published port is in. This is still an open question (OQ-15) and
  [docs/install-docker.md](docs/install-docker.md) names three ways to lock it down; the warning line
  the recommendation asks for is not implemented yet.
- The **beta.0 desktop build** shows harmless "unknown method setReadyConfig" notices at start and
  an RPC log drawer that lengthens the page; both are fixed on `master` (beta.1) and ship with the
  next tag.

### Not in this rebuild yet

Automatic best-interface assignment [#69 shows the information, it does not act on it]; HmIP
smoke-detector groups [#97 — they are built through the group process on `/groups`, outside the RPC
catalogue, and are out of scope by D-1]; CCU-Jack as a pre-defined interface [#135 — it serves
XML-RPC on `/RPC3` of port 2121, so a user-defined interface reaches it, but no CCU-Jack was
available to verify that against]; and the extended set of device-specific editors (universal light
effects, RGBW/dual-white, alarm panel, the ESI energy meter, door locks).

[3.0.0-beta.8]: https://github.com/hobbyquaker/homematic-manager/releases/tag/v3.0.0-beta.8
[3.0.0-beta.7]: https://github.com/hobbyquaker/homematic-manager/releases/tag/v3.0.0-beta.7
[3.0.0-beta.6]: https://github.com/hobbyquaker/homematic-manager/releases/tag/v3.0.0-beta.6
[3.0.0-beta.5]: https://github.com/hobbyquaker/homematic-manager/releases/tag/v3.0.0-beta.5
[3.0.0-beta.2]: https://github.com/hobbyquaker/homematic-manager/releases/tag/v3.0.0-beta.2
[3.0.0-beta.0]: https://github.com/hobbyquaker/homematic-manager/releases/tag/v3.0.0-beta.0
