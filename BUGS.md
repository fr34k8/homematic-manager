# Bugs

Numbered B-n, whoever found them - a tester in the forum, the maintainer, or a session. An entry
stays here whether it is open or fixed; "open" means _not fixed_, and says what is missing to fix
it. The commit that fixes one is named in its entry. Issues on GitHub are the maintainer's
preferred channel; a forum report is recorded here so that it is not lost between threads.

## Open

- B-1 (**open**, reported 2026-09-08 by NickHM in the forum against 3.0.0-beta.5) - **on the
  VirtualDevices interface the devices are counted (31) but the grid lists none.** Not reproduced:
  a heating group as the group process describes it (`HM-CC-VG-1` with its `:0`, `:1`, `:2`
  channels, `INT0000001` addresses) is listed - `packages/ui/src/routes/virtualDevices.test.ts`
  guards that - and the lab CCU3 has no groups at all (its `VirtualDevices` `listDevices` answers
  an empty array, checked read-only). The count in the header popup and the grid's rows come from
  the same `DeviceIndex`, so whatever the 31 descriptions look like, they reach the index as
  devices and the grid drops or fails to draw them afterwards. What is missing: the reporter's own
  `listDevices` answer of the VirtualDevices interface (RPC console, `listDevices` on
  VirtualDevices, copied into an issue), or which build - beta.5 or later - and whether the grid
  says "0 devices" or is blank below a count. The row-window clamp of `visibleWindow` (a list that
  shrinks under a scrolled viewport) is in beta.5 already and is not it.

## Fixed

- B-2 (**fixed 2026-09-08**, reported by NickHM in the forum against 3.0.0-beta.5) - **the device
  overview does not show which receiver a BidCos-RF device uses.** 2.7 had the `INTERFACE` column
  of the device grid commented out; only the Funk tab showed it. The device grid on BidCos-RF now
  has an `INTERFACE` column - the gateway's serial as `listDevices` reports it, `✔` behind it when
  ROAMING is on - hidden on HmIP and Wired, which have no receivers. Two tests in
  `DevicesPage.test.ts`.
