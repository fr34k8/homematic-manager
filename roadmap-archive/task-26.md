# Task 26: HmIP service-message suppression, and the routing tables (done 2026-09-08)

## The task, as given

**From the maintainer, 2026-09-08 (openccu-lite task 28.9).** eQ-3's _Homematic IP Legacy API
(XML-RPC) Addendum_ documents, on the HmIP interface (port 2010) only:
`suppressServiceMessages(channelAddress, parameter, suppress)` (`parameter` is one with the
_Service_ flag, or `""` for all; suppression works by reporting a value that raises no message),
`getSuppressedServiceMessages(channelAddress)`, and for devices with `ROUTER_MODULE_ENABLED=true`
the paramset type **`ROUTING_TABLE`** - up to 400 numbered entries with destination, next hop,
distance, RSSI, flags - read over the air on every call (duty cycle: on demand only). Wanted: the
suppression status in the channel-0 paramset dialog with a suppress/unsuppress control per service
parameter (and "all"); a signature hint for the two methods in the RPC console; a visualisation of
the routing tables read when the user asks.

## What was done

Four commits: `147004b` (the first form of the suppression, in the VALUES dialog), `1c98ebf` (the
routing table), `dcf128d` (every colour of the graph from a token) and `5231e4c` (the rework after
the maintainer's look at beta.5, four points done as given):

1. **Suppression in the parameter table of the channel-0 dialog** on an HmIP interface, not in a
   box of its own: in the MASTER dialog as rows at the end of the table (`SuppressRow.svelte`, the
   three columns of `ParameterRow`; the names come from the channel's VALUES description because
   `UNREACH`, `LOWBAT`, `CONFIG_PENDING`, `SABOTAGE`, `ERROR*`… are VALUES datapoints - core's
   `isServiceMessageDatapoint`, `DUTY_CYCLE` only where boolean, `serviceMessageParameters` in
   `lib/util/paramsetForm.ts`), in the VALUES dialog as a _suppressed_ checkbox on the datapoints'
   own rows. Fed by `getSuppressedServiceMessages`; channel 0 only, HmIP only; an interface without
   the method answers nothing and the rows stay away.
2. **A checkbox sends nothing.** _Suppress all_ / _Unsuppress all_ tick the boxes; **Apply** builds
   `buildSuppressPreview` (`lib/stores/suppression.ts`, the `WritePreview` shape with a `calls`
   list) and opens the existing `WritePreviewDialog`, which prints the exact
   `suppressServiceMessages(<address>, "<parameter>", true|false)` lines, one per changed box, with
   the from/to table. Confirmation sends them one by one through
   `ParamsetStore.suppressServiceMessages`, then reads `getSuppressedServiceMessages` again.
3. **The RPC console draws a form for the two methods.** They were not in the 2.x catalogue, so the
   console had no inputs for them. `HMIP_ADDENDUM_METHODS` in `packages/core/src/rpc/methods.ts`
   carries their signatures (channel address with the address datalist, `parameter` as a
   `value_key`, `suppress` as a boolean) with German and English help; `rpcMethod` consults it,
   `RPC_METHOD_NAMES` stays the 51 of the 2.x file, and the methods are offered only where
   `system.listMethods` names them.
4. **The service-messages tab** has a _Suppress_ / _Unsuppress_ action per row on HmIP
   (`ServiceMessagesStore.suppress`; `loadSuppressed` reads each channel of the list once), hidden
   on BidCos. The **"quiet mode" is removed** - the bell of #102, a `localStorage` flag that muted
   the toast for a new message and nothing else; Homematic has no such state. Button, store state,
   string, component test and e2e test are gone; `ServiceMessagesStore` no longer takes a storage.
   `docs/migration-from-2.x.md` says so.

**The routing table**: opening a router's `ROUTING_TABLE` paramset (the button comes from the
device's `PARAMSETS`) draws the table as a graph - the router in the middle, neighbours and next
hops on a ring, everything routed through them outside, hops and RSSI on the router's edges, static
routes dashed - with the full table underneath (`lib/util/routingTable.ts`: `parseRoutingTable`,
`routingGraph`; `RoutingTable.svelte`); the raw numbered rows stay in the dialog, folded away. Read
once when the dialog opens, as the addendum's duty-cycle warning asks; never on a timer.

## What was measured

- `packages/core/src/rpc/methods.test.ts`: the two addendum signatures, `rpcMethod` finding them,
  `RPC_METHOD_NAMES` unchanged at 51.
- `packages/ui/src/lib/stores/suppress.test.ts` (6): `ParamsetStore` reads the suppressed list and
  toggles one parameter or all, answers `undefined` with no notice where the interface has no such
  method; the helpers print the call the preview shows and recognise the HmIP interface by name or
  type and nothing else; `ServiceMessagesStore` reads the list of every channel once and again after
  a change, and asks an interface without the method once.
- `packages/ui/src/lib/util/routingTable.test.ts` (3): the numbered fields parsed into entries in
  index order, tolerant of strings; neighbours drawn on the router and the rest behind their next
  hop; an empty table.
- `packages/ui/src/routes/paramset/paramset.test.ts`: the rows in the MASTER dialog, the checkbox
  on the VALUES rows, Apply opening the preview with the exact lines, the confirmation sending them,
  nothing sent by a checkbox alone; `console.test.ts`: the form for the two methods;
  `messagesAndEvents.test.ts`: the actions per row on HmIP and their absence on BidCos.
- Workspace at `5231e4c`: `npm run lint`, `npm run typecheck`, `npm test` green.

## What was not done

**Not seen against a real HmIP server or a real router.** The demo transport answers the two
methods with a stub and the component tests mock them; the lab's HmIPW devices hang on a wired
DRAP, whose `ROUTER_MODULE_ENABLED` state and channel-0 suppression list have not been read from a
CCU yet. The first pass on the CCU3 - open the channel-0 dialog of the DRI16, read the suppressed
list, suppress `UNREACH` through the preview, see the WebUI's service messages, unsuppress - is the
gate before anyone relies on it. `ROUTING_TABLE` needs a radio router (an HmIP-PSM or similar on
the OpenCCU x86_64 box would do) and has not been requested from one.
