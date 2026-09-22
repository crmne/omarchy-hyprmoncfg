# 2.4.0 release-candidate testing

Use panel `v2.4.0-rc.1` with backend `v1.19.0-rc.2`. The complete cross-product
rubric is in the backend repository at `docs/rc-testing-1.19.0.md`.

For the panel specifically, capture compact and expanded screenshots at a normal
desktop size and a short 1366x768-style logical viewport. Exercise pointer and
keyboard paths for all three pages; Identify and preview must never cover or steal
Keep/Revert. Verify profile menus anchor to their invoking row/button, Delete uses
the themed safe-cancel dialog, and all hardware details remain visible together.

Test First per display and All assigned workspace persistence, including restart
and reopen. With an older daemon, the control must say Requires newer daemon and
must not claim success. Confirm Marketplace verification does not appear as a
permanent update alert. Do not request marketplace verification for this RC.
