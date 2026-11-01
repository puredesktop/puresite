# Publication comparison and the shared output contract

Req-0013 incorporates req-0012's immutable local revision
`f5f639cb8991f4506c8900bc47e8912acb20f865` (PureDev task
`4de578ed-7809-449d-942c-f1f51fc1ab95`, branch
`puredev/publish-the-same-files-puresite-checked-cef480`). That commit is a
retained local checkpoint: this identifies its source, and does not assert that
it has reached GitHub or merged.

Both build and the existing human Publish handler use `prepareCheckedSite`
from `siteOutput.ts`. Its `PreparedSite` contains the captured `snapshot`,
final `PublishFile[]` in `files`, and the build result. `sendSiteOutput` passes
that snapshot document and those exact files to `publishWithComparison`, which
captures the page/style/decoded-asset-byte comparison before starting the host
upload. Only successful finalization returns that comparison to App's
publication-record update. Build and comparison share the
`localAssetReferences` resolver; there is no second asset parser or output
preparation. Page fingerprints retain the existing source-page reporting;
the source snapshot is the one used by `shipPage` to produce the payload.

Asset bytes sit outside the snapshot and outside a page's render hash, so a
replacement at the same path needs its own guard. `prepareCheckedSite` reads
the files again after the final check and refuses if they differ, and App
measures again from fresh previews when a replacement arrives while text edits
are unsaved. A replacement landing during a build's writing stage refreshes the
comparison, but its measurements are not redone until the next change.

`App.output.test.tsx` exercises that real handler with a delayed fake host,
changes HTML, CSS and equal-length real SVG bytes during upload, persists the
result through the app's serializer, reopens the project, and publishes the
later draft through the same fake host. The baseline is judged against the
bytes the fake host received. It also checks upload and finalization failure.
No tests publish a real site.

## Final review-head verification

PureDev owns committing and pushing. After those steps, in a clean checkout
of the exact review head, run:

```
npm run verify:head -- <40-character-head> refs/heads/<published-review-branch>
```

This verifies that origin points to the supplied head, then runs the complete
app tests, typecheck and normal Vite build with the existing SWC styling
configuration. It checks head/cleanliness/origin again and retains a receipt
and logs outside source, including the commit, tree, every source file hash,
commands, exit codes and the integrated related revision. A dirty checkout,
unpushed head, moved branch or failed check refuses a completed receipt.
The command never commits, pushes, merges or publishes a website.

The implementation-stage checks run before this step and judge the completed
source files: their receipts, kept outside source, record file hashes, commands
and exit codes, and are never published-head evidence. A pre-commit rubric
cannot truthfully require a post-push receipt: PureDev must schedule this
command after pushing the review head and assess that receipt at final
review, rather than retrying source edits for missing future-stage evidence.

Product profile `puredesktop`, design revision 4; existing app chrome is retained.
