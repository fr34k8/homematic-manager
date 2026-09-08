# Task 27: Taxonomy for ReGa as well, and 127.0.0.1 as a callback listener (done 2026-09-08)

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

## What was not done

**Not seen against a CCU.** hm-simulator's ReGa mock knows `Name()` and nothing of `ID_ROOMS`,
`OT_ENUM` or `DeleteObject`, so the script idioms - in particular `dom.CreateObject(OT_ENUM)` for
a new room and `oDevice.Interface()` for the interface name - are from eQ-3's script reference
and the forum's use of them, not from a run against ReGaHSS. The first lab pass should create,
rename, assign to and delete one room on the CCU3 and look at the WebUI's room list afterwards;
the read script's answer is the other thing to check (a device whose interface ReGa does not
name falls back to the device caches). Known limits: no ordering of rooms (ReGa has none; the
list is sorted by name), `icon` and `position` are accepted and ignored, and a name ReGa refuses
is reported as the script's error.

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
