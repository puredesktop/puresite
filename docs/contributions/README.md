# puresite contribution roadmap

[View roadmap issues](https://github.com/puredesktop/puresite/issues?q=is%3Aissue%20label%3Aroadmap)

Build something you can see and try in the app. The first five items are **good first contributions**: bounded changes with a concrete demonstration. Choose a feature below, fix a bug, or propose your own improvement.

## Scope

Keep real HTML, CSS, script and asset files, the site board, preview and existing configured publishing destinations.

Size describes scope, not a promised completion time: **Small** = one focused interface change; **Medium** = coordinated interface/state work; **Large** = a feature across several flows, storage or export paths. All items are proposals, not claims that existing features are absent. Check the current code and extend what is there. Maintainers review code and tests before merging. Attribution is your choice.

## Good first contributions

1. **[Copy a page’s preview link.](https://github.com/puredesktop/puresite/issues/4)** Add a copy control for a page's existing preview route, clearly distinguishing it from any published address.
   <!-- contribution: {"id": "route-copy-action", "size": "small", "goodFirstIssue": true, "guide": "docs/contributions/route-copy-action.md"} -->
   [Small · Good first contribution · Implementation brief](https://github.com/puredesktop/puresite/blob/main/docs/contributions/route-copy-action.md)

2. **[See the exact preview width.](https://github.com/puredesktop/puresite/issues/5)** Display the actual preview width beside mobile, tablet and desktop controls so screenshots can be interpreted consistently.
   <!-- contribution: {"id": "viewport-size-labels", "size": "small", "goodFirstIssue": true, "guide": "docs/contributions/viewport-size-labels.md"} -->
   [Small · Good first contribution · Implementation brief](https://github.com/puredesktop/puresite/blob/main/docs/contributions/viewport-size-labels.md)

3. **[Spot oversized image assets.](https://github.com/puredesktop/puresite/issues/6)** Show image dimensions and file size in the assets area so users can identify unexpectedly large source images.
   <!-- contribution: {"id": "asset-dimensions-and-size", "size": "small", "goodFirstIssue": true, "guide": "docs/contributions/asset-dimensions-and-size.md"} -->
   [Small · Good first contribution · Implementation brief](https://github.com/puredesktop/puresite/blob/main/docs/contributions/asset-dimensions-and-size.md)

4. **[Copy an asset reference with confidence.](https://github.com/puredesktop/puresite/issues/7)** Confirm when the existing usable asset reference is copied, including the relative path needed by the selected page.
   <!-- contribution: {"id": "asset-reference-copy-feedback", "size": "small", "goodFirstIssue": true, "guide": "docs/contributions/asset-reference-copy-feedback.md"} -->
   [Small · Good first contribution · Implementation brief](https://github.com/puredesktop/puresite/blob/main/docs/contributions/asset-reference-copy-feedback.md)

5. **[Know which element an instruction will change.](https://github.com/puredesktop/puresite/issues/8)** Show a short tag and text summary above an element-specific request so users can verify what their instruction will target.
   <!-- contribution: {"id": "selected-element-context", "size": "small", "goodFirstIssue": true, "guide": "docs/contributions/selected-element-context.md"} -->
   [Small · Good first contribution · Implementation brief](https://github.com/puredesktop/puresite/blob/main/docs/contributions/selected-element-context.md)

## More improvements

6. **[Read long page titles and routes.](https://github.com/puredesktop/puresite/issues/9)** Keep long page titles readable on board cards and expose the full route on focus without widening the entire board.
   <!-- contribution: {"id": "page-title-overflow-handling", "size": "small", "goodFirstIssue": false, "guide": "docs/contributions/page-title-overflow-handling.md"} -->
   [Small · Implementation brief](https://github.com/puredesktop/puresite/blob/main/docs/contributions/page-title-overflow-handling.md)

7. **[Correct a page-name conflict before creation.](https://github.com/puredesktop/puresite/issues/10)** Explain filename or route collisions beside the new-page input before creating a file.
   <!-- contribution: {"id": "duplicate-page-name-feedback", "size": "medium", "goodFirstIssue": false, "guide": "docs/contributions/duplicate-page-name-feedback.md"} -->
   [Medium · Implementation brief](https://github.com/puredesktop/puresite/blob/main/docs/contributions/duplicate-page-name-feedback.md)

8. **[Give assets unambiguous names.](https://github.com/puredesktop/puresite/issues/11)** Give field-level feedback when an asset's human-readable name is blank or ambiguous, retaining the underlying file path.
   <!-- contribution: {"id": "asset-name-validation", "size": "medium", "goodFirstIssue": false, "guide": "docs/contributions/asset-name-validation.md"} -->
   [Medium · Implementation brief](https://github.com/puredesktop/puresite/blob/main/docs/contributions/asset-name-validation.md)

9. **[Locate a missing image or file.](https://github.com/puredesktop/puresite/issues/12)** List the referencing page and unresolved asset path when preview verification detects a missing local resource.
   <!-- contribution: {"id": "missing-asset-diagnostics", "size": "medium", "goodFirstIssue": false, "guide": "docs/contributions/missing-asset-diagnostics.md"} -->
   [Medium · Implementation brief](https://github.com/puredesktop/puresite/blob/main/docs/contributions/missing-asset-diagnostics.md)

10. **[Find a broken internal link.](https://github.com/puredesktop/puresite/issues/13)** Show the source page, link label and missing destination together in existing site-link checks.
   <!-- contribution: {"id": "broken-internal-link-context", "size": "medium", "goodFirstIssue": false, "guide": "docs/contributions/broken-internal-link-context.md"} -->
   [Medium · Implementation brief](https://github.com/puredesktop/puresite/blob/main/docs/contributions/broken-internal-link-context.md)

11. **[Tell a blank page from a failed preview.](https://github.com/puredesktop/puresite/issues/14)** Distinguish loading, failed rendering and an intentionally empty page instead of showing the same blank frame for each.
   <!-- contribution: {"id": "preview-loading-states", "size": "medium", "goodFirstIssue": false, "guide": "docs/contributions/preview-loading-states.md"} -->
   [Medium · Implementation brief](https://github.com/puredesktop/puresite/blob/main/docs/contributions/preview-loading-states.md)

12. **[Retry a preview without losing your request.](https://github.com/puredesktop/puresite/issues/15)** Keep the page selection and request text when a preview fails, with an explicit retry action for the affected frame.
   <!-- contribution: {"id": "preview-error-recovery", "size": "medium", "goodFirstIssue": false, "guide": "docs/contributions/preview-error-recovery.md"} -->
   [Medium · Implementation brief](https://github.com/puredesktop/puresite/blob/main/docs/contributions/preview-error-recovery.md)

13. **[Reset filters hiding every page.](https://github.com/puredesktop/puresite/issues/16)** Offer a direct reset when page or work filters hide every item, while keeping an actually empty site state distinct.
   <!-- contribution: {"id": "board-filter-reset", "size": "small", "goodFirstIssue": false, "guide": "docs/contributions/board-filter-reset.md"} -->
   [Small · Implementation brief](https://github.com/puredesktop/puresite/blob/main/docs/contributions/board-filter-reset.md)

14. **[Identify a file-history entry.](https://github.com/puredesktop/puresite/issues/17)** Show the affected filename, timestamp and available change summary together in the existing history list.
   <!-- contribution: {"id": "history-entry-context", "size": "medium", "goodFirstIssue": false, "guide": "docs/contributions/history-entry-context.md"} -->
   [Medium · Implementation brief](https://github.com/puredesktop/puresite/blob/main/docs/contributions/history-entry-context.md)

15. **[Check the version before restoring.](https://github.com/puredesktop/puresite/issues/18)** Repeat the selected file and version time before restoring a historical file, preserving the current restore behavior.
   <!-- contribution: {"id": "restore-version-recap", "size": "medium", "goodFirstIssue": false, "guide": "docs/contributions/restore-version-recap.md"} -->
   [Medium · Implementation brief](https://github.com/puredesktop/puresite/blob/main/docs/contributions/restore-version-recap.md)

16. **[Keep the publishing destination visible.](https://github.com/puredesktop/puresite/issues/19)** Keep the selected destination name and known URL visible throughout the publishing dialog so users can check where the site will go.
   <!-- contribution: {"id": "publish-destination-visibility", "size": "medium", "goodFirstIssue": false, "guide": "docs/contributions/publish-destination-visibility.md"} -->
   [Medium · Implementation brief](https://github.com/puredesktop/puresite/blob/main/docs/contributions/publish-destination-visibility.md)

17. **[Review changed pages before publishing.](https://github.com/puredesktop/puresite/issues/20)** Present added, changed and removed page counts from the existing publication comparison before starting a publish.
   <!-- contribution: {"id": "publish-change-summary", "size": "medium", "goodFirstIssue": false, "guide": "docs/contributions/publish-change-summary.md"} -->
   [Medium · Implementation brief](https://github.com/puredesktop/puresite/blob/main/docs/contributions/publish-change-summary.md)

18. **[See which publishing stage failed.](https://github.com/puredesktop/puresite/issues/21)** Separate build, upload and destination errors when the existing publisher exposes them, retaining the chosen destination for retry.
   <!-- contribution: {"id": "publish-failure-detail", "size": "medium", "goodFirstIssue": false, "guide": "docs/contributions/publish-failure-detail.md"} -->
   [Medium · Implementation brief](https://github.com/puredesktop/puresite/blob/main/docs/contributions/publish-failure-detail.md)

19. **[Distinguish published content from newer local edits.](https://github.com/puredesktop/puresite/issues/22)** Show the exact last-published time beside the address and distinguish it from a more recent local save.
   <!-- contribution: {"id": "published-timestamp-clarity", "size": "medium", "goodFirstIssue": false, "guide": "docs/contributions/published-timestamp-clarity.md"} -->
   [Medium · Implementation brief](https://github.com/puredesktop/puresite/blob/main/docs/contributions/published-timestamp-clarity.md)

20. **[Check a page export’s width and format.](https://github.com/puredesktop/puresite/issues/23)** Show the selected page, current preview width and chosen PNG or PDF output before exporting a review copy.
   <!-- contribution: {"id": "export-viewport-recap", "size": "medium", "goodFirstIssue": false, "guide": "docs/contributions/export-viewport-recap.md"} -->
   [Medium · Implementation brief](https://github.com/puredesktop/puresite/blob/main/docs/contributions/export-viewport-recap.md)

21. **[Review mobile and desktop previews side by side.](https://github.com/puredesktop/puresite/issues/24)** Add an optional two-viewport preview for the same page, with fixed named widths and independent scrolling. Editing the underlying files refreshes both without publishing.
   <!-- contribution: {"id": "review-mobile-and-desktop-previews-side-by-side", "size": "large", "goodFirstIssue": false, "guide": "docs/contributions/review-mobile-and-desktop-previews-side-by-side.md"} -->
   [Large · Implementation brief](https://github.com/puredesktop/puresite/blob/main/docs/contributions/review-mobile-and-desktop-previews-side-by-side.md)

## References

- [App guide](https://github.com/puredesktop/puresite/blob/main/docs/app-guide.md)
- [Development guide](https://github.com/puredesktop/puresite/blob/main/docs/development.md)
- [Contributing](https://github.com/puredesktop/puresite/blob/main/CONTRIBUTING.md)
