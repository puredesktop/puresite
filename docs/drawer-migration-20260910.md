# Site: drawer migration — 2026-09-10

The app now saves explicit drawer requests instead of running a private model call. UI actions dispatch into a document-associated drawer session; preparation tools return immediately to the current runner. The app owns scoped writes, persistence, history, validation and export. There are no shell changes in this migration.

Requests persist identity, package path, revision, selection and image byte hashes. Commit rejects stale documents, replaced images, cancelled requests and out-of-scope edits. Repeated committed requests return their saved receipt. Image descriptions use actual UI image attachments and protect manual description/role changes. Save completion is separate from layout/build/render verification. Stopping the drawer leaves the saved request resumable; cancelDrawerRequest explicitly abandons it.

Live testing found and fixed a package-rename receipt problem and stale viewport session routing. Follow-ups now use the request's saved session, validate that session still exists, and bind the tab to it. The app releases its preparation lock before dispatching the drawer message.

Site drafting, selected-page/element edits and image descriptions use the drawer. prepareSite supports an optional brief; commit accepts coherent pages/styles/title for creation and selected pages for narrow edits. Publishing metadata and collections are preserved. Omitted existing pages remain present; deletion is an explicit separate operation. A saved proposal supports recovery from old/new mixtures after a partial multi-file save and rejects unrelated disk edits. This is recoverable persistence, not an OS-atomic filesystem transaction. Pending requests load when reopening a package. Publishing remains a separate explicitly authorized action.

## Verification

18 focused tests pass. Affected-app typecheck/build and git diff --check pass. No broad suite was run.

Commands: `npm test -- src/lib/drawerRequest.test.ts src/lib/siteDoor.test.ts`, `npm run typecheck`, `npm run build`. The changed request tests were rerun after the final request/session/description fixes.

Focused code tests cover scope, metadata preservation, malformed paths, partial-save recovery, session association and manual descriptions. The live Site creation/build run was not started: UI automation reported the Mac locked immediately after opening Site. Responsive checks, real build and UI reopen/handoff remain pending.

## Remaining acceptance work

Full fault-injected app I/O tests (save failure, double commit, cancellation/document switch), live image-pixel description handoff, and the remaining live scenarios are not certified by the helper tests. The Mac must be unlocked to continue UI acceptance. Large-bundle warnings are non-blocking build warnings.
