# Bugs

Numbered B-n, whoever found them - a tester in the forum, the maintainer, or a session. An entry
stays here whether it is open or fixed; "open" means _not fixed_, and says what is missing to fix
it. The commit that fixes one is named in its entry. Issues on GitHub are the maintainer's
preferred channel; a forum report is recorded here so that it is not lost between threads.

## Open

Nothing from the forum. GitHub has #140 (umlauts in the addon overview) and #141 (no feedback
when an addon update has finished), both from Baxxy13 against the CCU addon on OpenCCU; they are
tracked there.

## Fixed

- B-1 (**fixed 2026-09-08**, `3.0.0-beta.7`; reported 2026-09-08 by NickHM in the forum against
  3.0.0-beta.5, then as #143) - **on the VirtualDevices interface the devices are counted (31)
  but the grid lists none.** Cause: a filter typed into a column of the device grid outlived the
  switch to another interface. The grid is one component for every interface, its column filters
  were its own state, and nothing cleared them; a filter typed for BidCos-RF addresses hid every
  `INT…` group, the header popup and the band still counted 31 from the unfiltered index, and the
  empty grid said "the interface has not reported any yet". In the reporter's screenshot the
  Name and ADDRESS filter fields sit under the open popup, the visible ones are empty. Reproduced
  in a component test with 31 groups in the shape a CCU3 sends (the hm2mqtt.js fixture: `CHILDREN`
  is `""` on a channel, `UPDATABLE` a boolean, `VERSION` 131072 on an HmIP-HEATING group) - the
  groups render, the carried-over filter empties the grid. Fixed in `DataTable`: the column
  filters and the scroll position belong to the interface (`scope`) and are cleared when it
  changes; while a filter hides rows the count says "Showing 0 of 31" and the body says that no
  row matches, with a button that clears the filter; the device grid also drops its selection on a
  switch. Guarded by `packages/ui/src/routes/virtualDevices.test.ts`, the group round trip through
  the real XML-RPC path by `packages/backend/test/simulator/connection.test.ts` and
  `apps/web/test/e2e/receiver.spec.ts`. Not verified against the reporter's CCU - the lab CCU3 has
  no groups.
- B-2 (**fixed 2026-09-08**, `3.0.0-beta.7`; reported 2026-09-08 by NickHM in the forum against
  3.0.0-beta.5, then as #142) - **the device overview does not show which receiver a BidCos-RF
  device uses**, and in the Funk tab the bold row of the `setBidcosInterface` dialog is the
  best-heard interface, not the configured one. 2.7 had the `INTERFACE` column of the device grid
  commented out and showed the receivers in the Funk tab alone, under jqGrid group headers - one per
  interface with the serial and, in small print, the description. Fixed twice the same evening:
  first an `INTERFACE` column with the bare serial (`ec471af`), then, on the maintainer's hint, the
  2.7 form: the column names the receiver as `listBidcosInterfaces` describes it (the CCU's own
  module, a named LAN gateway) and falls back to the serial, with `⇄` for roaming; the Funk grid
  has the group header row back over `← dBm` / `→ dBm` and a marker column (`◉` configured, `○`
  other) that opens the dialog on that gateway; the dialog's bold row is the configured receiver,
  the best-heard one is named below the table. HmIP and Wired show none of it. Tests in
  `DevicesPage.test.ts`, `radio.test.ts`, `DataTable.test.ts`, core `rssi/index.test.ts`, and the
  e2e spec above against hm-simulator's `HM-MOD-RPI-PCB`.
