# Task 27: Taxonomy for ReGa as well, and 127.0.0.1 as a callback listener (done 2026-09-08, lab pass 2026-09-08)

## The task, as given

**From the maintainer, 2026-09-08 (openccu-lite task 28.10).** Task 25's editing UI must work
against ReGa too — rooms and functions through ReGa's own objects, not only names — as well as
against the metadata API, so one dialog serves a CCU and an openccu-lite box. And the callback
address list must offer **`127.0.0.1`**: on an openccu-lite box the interface processes bind
the loopback only (their D-29), so for the manager running on the box it is the only address
they can reach. **Done 2026-09-08**: `localIPv4Addresses` appends the loopback last.

## What was done: the ReGa half

A third metadata provider, `rega`
(`packages/backend/src/meta/regaProvider.ts`), with the same `MetadataProvider` surface the box's
provider has, so the UI of task 25 does not know which one it talks to. It reads devices,
channels, rooms and functions in one script (`META_READ_SCRIPT` in `rega/scripts.ts`:
`root.Devices()`, `ID_ROOMS`, `ID_FUNCTIONS`, `EnumUsedIDs()`, `WriteURL` names, plus
`dom.GetObject(oDevice.Interface()).Name()` because the store's ref needs the interface), and
writes through ReGa's own objects: `Name()` for a rename, `Add(id)` / `Remove(id)` on the enum
for a membership, `dom.CreateObject(OT_ENUM)` + `Add` on `ID_ROOMS`/`ID_FUNCTIONS` for a new
room or function, `Remove` + `dom.DeleteObject` for a deleted one. The model is ReGa's and the
provider says so: **flat** (`state().flat`, the dialog hides _add below_ and _move_ and says
"no floors"; a parent is refused with `too-deep` / `invalid-move`), two taxonomies and no other
(`createEnum`/`deleteEnum`/`import` answer `forbidden`), channels are members and a device ref
is applied to every channel of the device except `:0`, and a node's id is `r<ReGa id>` so a
rename never rewrites a path. There is no change stream: the provider reads on connect, after
every write of its own, and on the new contract method **`meta.refresh`** (the ⟳ in the tree
dialog); a room made in the WebUI shows up here on the next refresh. Selection (`MetaService`):
the box's API wins when it answers, otherwise `auto` takes ReGa when it is on and answered
`getChannels` at least once, else the profile store; `metaProvider: 'rega'` insists (and stays
local with a warning when ReGa is switched off). With ReGa as the store the rename goes through
the provider only, not through the name service as well - the same script would otherwise be
sent twice. Tests: the scripts and parsers, 22 provider tests against a scripted ReGa, the
selection in the service, four backend tests through the contract, and the UI's refresh path.

## The lab pass (2026-09-08, CCU3 firmware 3.89.8)

Until this pass hm-simulator's ReGa mock (`Name()` and nothing of `ID_ROOMS`, `OT_ENUM` or
`DeleteObject`) was all the provider had met; the idioms were from eQ-3's script reference. The
pass drove `RegaMetaProvider` itself (the built `packages/backend`, `homematic-rega` as the
transport, the CCU's ReGa port reached through an ssh tunnel because the CCU's firewall keeps
8181 `restricted`) and checked every step against ReGa's own objects with separate scripts:
`ID_ROOMS` / `ID_FUNCTIONS` with `EnumUsedIDs()`, the channel's `ChnRoom()` / `ChnFunction()`,
`dom.GetObject(id)` of the new object. The full table is in `docs/hardware-checklist.md`.

- `start()`: 164 objects, 11 rooms, 10 functions, 12 ms through the tunnel. `oDevice.Interface()`
  names `BidCos-RF` and `HmIP-RF` for every device including the two virtual centrals; the wired
  DRAP, DRI16 and DRS8 are `HmIP-RF`, as the interface list says. The RCV-50's channels are members
  of `funcCentral`, as the WebUI has them.
- `createNode('room', …, 'HMM Prüfraum "Lab"')`: `dom.CreateObject(OT_ENUM)` + `Add` on `ID_ROOMS`
  works and answers the new id; the object has `Type()` 3, the name arrives with the umlaut and the
  quotes intact (`escapeRegaString`), and `WriteURL` gives it back as `HMM%20Pr%FCfraum%20%22Lab%22`,
  which the decoder turns into the original. The same for a function.
- A parent is refused with `too-deep` before anything is sent.
- `updateNode` rename: `Name()` by id; ReGa shows the new name at once; `refresh()` reads it back.
- `setMembership` of one channel to the room and the function: `Add(id)` on both enums;
  `ChnRoom()` of the channel names the room and `ChnFunction()` the function afterwards - ReGa
  keeps the reverse index itself. A device ref put all 33 channels of the DRS8 but `:0` into the
  room, read back the same way.
- Removing both: `Remove(id)`, the room's list is empty and `ChnRoom()` of the channel is empty.
- `deleteNode` with a member: refused with `has-members`; with `detach`: `Remove` on `ID_ROOMS`
  and `dom.DeleteObject` - `dom.GetObject(id)` is null afterwards, the list no longer has it and
  the channel's `ChnRoom()` is empty, so the membership went with the object.
- At the end `ID_ROOMS` and `ID_FUNCTIONS` were byte-identical to the baseline taken before the
  pass, and the provider read 11 and 10 again. No notice was raised at any point.

**Found:** a CCU's stock rooms and functions carry **translation keys** as their `Name()` -
`roomKitchen`, `roomHWR`, `funcCentral` - and every WebUI page translates them on display
(`translate.lang.js`: `Küche`, `Hauswirtschaftsraum`, `Zentrale`). The provider showed the keys.
Fixed the same day: `REGA_STOCK_NAMES` in `regaProvider.ts` carries the 21 keys with the German and
English WebUI texts, the document shows the translation (German unless the profile's language is
English), the list is sorted by what is shown, and a rename to the translation is not a write
(checked on the box: `roomKitchen` stayed `roomKitchen`). Any other name is shown and written as it
is. Three tests in `regaProvider.test.ts`.

**Also seen:** ReGa persists its DOM on its own schedule - `homematic.regadom` on the box was
written at 06:45 and 18:45 that day, not by the pass - so a room made here (or in the WebUI) lives
in memory until ReGa's next save, as everything ReGa holds does.

Known limits, unchanged: no ordering of rooms (ReGa has none; the list is sorted by name), `icon`
and `position` are accepted and ignored, and a name ReGa refuses is reported as the script's error.
Not done: the tree dialog was not clicked through against the CCU - the pass drove the provider,
not the UI - and no WebUI page was opened; the comparison was with ReGa's objects directly.

## What was measured

- `packages/backend/src/rega/scripts.test.ts`: the read script's idioms, `WriteURL` decoding, the
  parser and what it drops, the create / delete / membership scripts.
- `packages/backend/src/meta/regaProvider.test.ts` (22) against a scripted ReGa: the document
  built from ReGa's lists (refs, decoded names, flat trees, memberships, the interface fallback),
  an object without a ref dropped, ReGa going away and coming back with one notice, an answer that
  is not the document, a room made in the WebUI seen on refresh, renames, memberships incl. the
  device expansion, the refusals (`unknown-object`, `unknown-path`, `too-deep`, `invalid-move`,
  `has-members`, `forbidden`), a create without an id answered.
- `service.test.ts`: `auto` takes ReGa when there is no box and it answered, stays local when it
  has not, lets the box win, `rega` insists and never probes, warns when ReGa is off, `local`
  never takes it, and `assign` becomes `Add`/`Remove`.
- `backend.test.ts`: four tests through the contract; the harness's ReGa answers the read script,
  so every backend test now runs with ReGa as the store.
- Workspace at the commit: `npm run lint`, `npm run typecheck`, `npm test` green - 2446 tests.
