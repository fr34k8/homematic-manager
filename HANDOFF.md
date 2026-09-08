# Handoff — 2026-09-08 (evening)

Where the 3.0 rebuild stands, so that a new session (after a usage-limit pause, on another
machine, with no conversation history) can continue without re-deriving anything. Refreshed
about every half hour while the agent works; the timestamp above is the last refresh.

## Read first

1. `AGENTS.md` — the rules (WSL only, LF, D-18 versioning, never tag/release/publish without the
   maintainer's word; pushing `master` for CI is the main session's, D-21/D-38).
2. `ROADMAP.md` — decisions D-1..D-41, tasks 2–27 (all closed), open questions (OQ-12 is the
   recurring toolchain check, the rest are answered), lab notes. Done tasks are ticked in the
   Contents; each has a report in `roadmap-archive/task-N.md`.
3. `docs/analysis-2026-09.md` — the analysis the roadmap is built on (only when a decision needs
   its background).
4. The private lab note `~/repos/redmatic-lab.md` (never in the repo) — lab boxes, credentials,
   which BidCos-RF devices sit where.

## State of the branch

- **2026-09-08 evening: `3.0.0-beta.6`, on the maintainer's instruction of 2026-09-09 ("finish
  every open task, then release beta.6").** What it carries over beta.5: the rooms and functions UI
  (task 25), ReGa as the store of rooms and functions on a CCU (task 27, **lab-passed on the CCU3
  on 2026-09-08** - create, rename, assign, read back, remove, delete, all agreeing with ReGa's own
  objects, the box left as found; the stock rooms' translation keys are shown translated since
  then), the reworked suppression of task 26 (archived), D-41 (OQ-15: the Docker cookie default
  stays, the host warns at start on a non-loopback bind), and the docs: task 18's lab check is
  recorded as done for the admin user, OQ-12 re-checked (still blocked by all three peers,
  2026-09-08). The release checklist's e2e run found two defects of tasks 25/27 that the unit
  suites had not (a ReGa that answers no script left `auto` on an unreachable store and lost the
  rename; the PARAMSETS column squeezed under the new columns) - both fixed before the tag. Release details - tag, workflow results - are in the section below and in the
  report the agent gave; the draft release is the maintainer's to publish (checklist step 4).
- **2026-09-08: tasks 25 and 27 done, three local commits on `master`** (`920580a`
  taxonomy UI, `33d530e` ReGa provider, `4b24b53` docs and archive). The grids have rooms /
  functions columns, multi-select assign, room and function filters (a floor matches what is
  below it), `TaxonomyDialog` (tree for rooms, list for functions, add/rename/move/delete with
  members listed first), `MetaIndicator` plus a _Names and rooms_ settings section. The `rega`
  provider (`packages/backend/src/meta/regaProvider.ts`) reads and writes rooms, functions and
  names through ReGa scripts behind the same `MetadataProvider` interface; flat (no floors), no
  change stream (⟳ / `meta.refresh`). **Not run against a CCU** — hm-simulator's ReGa mock knows
  only `Name()`, so the `OT_ENUM`/`DeleteObject`/`Interface()` idioms are from the script
  reference; the first lab pass on the CCU3 (create, rename, assign, delete one room, compare
  with the WebUI) is the gate before a release carries it. Verified by the main session:
  lint, typecheck, `npm test` 2446 passed / 10 skipped (148 files). **Superseded the same evening:
  the lab pass happened (see above).**

- **2026-09-08: `3.0.0-beta.5`**, tagged `v3.0.0-beta.5` by the agent on the maintainer's explicit
  instruction ("tag and push, i want a 3.0.0-beta.5 now"), after lint, typecheck, the unit
  suites, the build with e2e and the addon container test were green. What it carries over
  beta.4: the HmIP service-message suppression section and the ROUTING_TABLE graph in the
  paramset dialog (task 26, neither tried against real HmIP hardware yet), `127.0.0.1` as a
  callback candidate (task 27), the control-character rule for names. Tasks 25 and 27's ReGa
  half are still open; the release draft is the maintainer's to publish.

- Branch `master` since the beta (D-38, 2026-09-06): the full history, no squashing; `3.0-dev` is
  left behind at the same commits. Push `master` from WSL after each archived task or feature
  batch; nothing on it is secret. The public release `v3.0.0-beta.0` exists; the version on
  `master` is `3.0.0-beta.4`, tagged `v3.0.0-beta.4` (task 24). `v3.0.0-beta.3` built its addon,
  Electron and Docker artefacts but failed CI and the npm publish on a defect of its own (a store
  that kept loading after `Backend.stop()`); beta.4 is that fix and is the tag to release.
- **Task 24 (D-40, 2026-09-06) is in and archived**: the metadata store. Rooms, functions and
  floors as data in the profile, and on openccu-lite (the CCU firmware without ReGaHSS) names and
  taxonomy from the box, written back through its API, with the addon's login taking the session
  the box's shell hands over. `roadmap-archive/task-24.md` has what was measured and what it found;
  `docs/openccu-lite.md` is the user-facing page. The model is `packages/core/src/meta/`, the
  providers `packages/backend/src/meta/`, the login `apps/web/src/occulite.ts`.
  **Task 25 is the UI for it** and is deliberately not started: a rooms column, "assign to room"
  for a multi-selection, a tree dialog, a filter and the provider indicator. Every method and event
  it needs exists and is tested.
  Two test paths need something the repository does not ship: `OCCULITED_BINARY=<a build of
openccu-lite's cmd/occulited>` runs the integration suite in `packages/backend/test/occulite/`
  (skipped without it), and `OPENCCU_LITE_FIXTURES=<checkout>/fixtures` runs the conformance corpus
  against the upstream copy instead of the vendored one.
- Done and archived: tasks 2 (foundation), 3 (core), 4 (backend), 5 (hm-simulator 1.0), 7 (UI
  foundation), 9 (data pipeline), 11 (Electron host; `build.yml` builds the desktop artifacts on
  every push to `3.0-dev` once Actions is enabled), 12 (web host, npm package with `--install`,
  `release-npm.yml`, Docker image, compose, proxy docs, `release-docker.yml`), 8 (UI feature
  parity: every 2.7 tab in `packages/ui`, 445 component tests, browser mode green), 18 (optional
  addon login against ReGa, D-32: implemented, container-tested, and checked on the x86_64 box
  with the admin user), 17 agent side (screenshots, announcement, release checklist, hardware
  checklist with D-31 timings, OQ-16 = A-17, version `3.0.0-dev.1`), 14 (test
  infrastructure: browser mode default, 20 Playwright e2e specs, merged coverage, strict UI lint,
  shellcheck), 15 (backlog: #124 change set, #87, #26, #25, #21, #54, #94, #97 BidCos, D-31 idle
  unsubscribe, image chain in the backend, hm-simulator 1.0.0 from npm; 1820 tests in the
  workspace), 10 (five
  device-specific editors; OQ-16 weekday bit order to check in the lab), 16 (docs: README with
  the install matrix, one page per install type, migration notes, BUILD.md, CHANGELOG.md), 13 (CCU
  addon: three packages, container replay, all three lab boxes checked; the Charly runs the
  addon now, pre-image-fix build), 6 (lab study: `docs/config-pending.md`,
  `devices.repairConfig`, hm-simulator calibrated; M1 complete). Lab state after the study is in
  the private lab note (one DRS8 channel poisoned on purpose, needs re-pairing). Workspace was green at the last full run: 73 test files,
  1082 tests, `npm run lint`, `npm run typecheck`.
- In progress by background subagents (Opus), committing distinct commits on
  `master` in the shared working tree (each stages only its own files):
  - **Issue triage** (agent): comments, closes and keeps open every open issue and PR with the
    footer that Claude wrote it on the maintainer's behalf.
  - Tasks 21, 22 and 23 are archived; `v3.0.0-beta.0` is public (pre-release); master is at
    `3.0.0-beta.2` and deployed to the x86_64 box; the npm publish of the beta waits for the
    trusted-publisher fix on npmjs.com.
    The Electron investigation is archived (`roadmap-archive/task-11-electron-startup.md`):
    the quit no-op, the early smoke wait, the image scheme and the unpackaged data path are fixed
    at `3.0.0-dev.5`.
  - Tasks 19 and 20 (UI after the maintainer.s first and second look) are archived; version
    `3.0.0-dev.4` is deployed to the x86_64 lab box.
    Next lab run: a live `install_addon` update on the CCU3 box (the `/proc/1/root` start path
    is container-tested only), and the task 18 login with a lower-level CCU user.
- If a session ends with those agents mid-flight: uncommitted files in the working tree are
  theirs. Look at `git status`, `git diff`, run `npm test -w <workspace>`; either finish the
  piece and commit it with an explanatory message, or `git stash` it with a note here. Do not
  discard it silently.

## What the maintainer still has to do (agent cannot)

- GitHub Actions is enabled (2026-09-06) and npm trusted publishing is configured for the
  `homematic-manager` name; the trusted publisher on npmjs.com must name the workflow file
  `release-npm.yml` (it was entered as `release.yml`). Workflow dispatch does not work while
  `master` lacks the workflow files; the push trigger on `3.0-dev` does.
- hm-simulator 1.0.0 is published (2026-09-05, tag `v1.0.0`, branch `1.0-dev` pushed; `master`
  of that repository still points at 0.1.1 and wants a fast-forward). Task 15 switches the
  backend to the registry package and makes a missing simulator a CI failure. Later simulator
  changes (task 15 adds `setTempKey`) are committed on `1.0-dev` and released as 1.0.1 by the
  main session on request.
- OQ-14 decided as D-33 (2026-09-06): the npm package is `homematic-manager`, trusted publishing configured; the npmjs.com publisher entry must name `release-npm.yml`.

## Next steps, in order

1. **The maintainer publishes `v3.0.0-beta.6`** (release checklist, step 4): check the assets and
   their `.cdx.json`, `gh attestation verify`, tick "pre-release", publish the draft, post the
   announcement (`docs/announcement-3.0-beta.md`, placeholders at the top). The agent never
   publishes.
2. **Hardware that is still owed** (all in `docs/hardware-checklist.md` "not done" lists): the
   task 25 tree dialog clicked through against the CCU3 with the current addon build; task 26's
   channel-0 dialog on an HmIP channel (suppress `UNREACH` through the preview, look at the WebUI's
   service messages, unsuppress) and a `ROUTING_TABLE` from a radio router - none of the lab's
   HmIPW devices is one; task 18 with a CCU user below level 8 (needs a second user made in the
   WebUI). The lab CCU3 runs an old addon build in `token` mode; updating it is a maintainer's
   call (the CCU3 firmware installs addons at boot).
3. **The install-from-published-artefacts round of D-25** once beta.6 is public: the three addon
   packages on the lab boxes, `docker run` on the image (the new warning line should be the first
   thing in its log), the npm package with `--install` in a fresh LXC, the three Electron apps.
4. **Recurring**: OQ-12 with the next Electron bump (last check 2026-09-08: typescript-eslint
   `<6.1.0`, svelte-check `^5||^6`, electron-vite `vite ^5||^6||^7` - no TypeScript 7, no vite 8).
5. Nothing on the roadmap is open below task 27; new work comes from the maintainer as task 28+
   (numbers are never reused). The "Known issues" of the beta.6 changelog section is what a
   tester will hit first.

## Environment (short form; details in the memory note and AGENTS.md)

- Repo lives in WSL Debian at `/home/basti/repos/homematic-manager`; from Windows it is
  `\\wsl.localhost\Debian\home\basti\repos\homematic-manager`.
- Every git/gh/npm call goes through `wsl.exe -d Debian -- bash -c '...'`. The Windows→WSL
  command line drops `$vars` and executes backticks: write scripts to `/tmp/<name>.sh` (Windows
  path `\\wsl.localhost\Debian\tmp\`), run after `sed -i 's/\r$//'`.
- Files written from Windows can carry CRLF: normalise before committing.
- Commits: `git -c core.autocrlf=false commit`, one commit per significant change, trailer
  `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Subagents: Opus 5, one task each, they commit themselves; only the main session pushes.

## Decisions made today that are easy to miss

D-18 (3.0.0-dev.n, distinct commits), D-19 (no HVL), D-20 (no Homegear-specific work), D-21
(push `3.0-dev` for CI), D-22 (dark mode required), D-23 (jsdom default, browser mode later),
D-24 (four independent release pipelines), D-25 (install matrix: addon ×3, Docker, npm
`--install` with Proxmox LXC recommended, Electron ×3), D-26 (AGPL-3.0-or-later; `legacy/`
stays GPL-3.0 with its contributors), D-27 (CycloneDX SBOM + attestation for every artefact).
Hard constraints from the maintainer: no JSON-API, XML/BIN-RPC and ReGa scripts only; ReGa
strictly optional.
