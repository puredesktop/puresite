# puresite roadmap

## Scope

Keep real HTML, CSS, script and asset files, the site board, preview and existing configured publishing destinations.

These are proposed, incremental improvements, not a release schedule or a list of missing core features. Keep each change small and preserve existing file formats, user data and app workflows.

## Improvements

1. **Page title overflow handling.** Keep long page titles readable on board cards and expose the full route on focus without widening the entire board.

2. **Route copy action.** Add a copy control for a page's existing preview route, clearly distinguishing it from any published address.

3. **Duplicate page-name feedback.** Explain filename or route collisions beside the new-page input before creating a file.

4. **Asset name validation.** Give field-level feedback when an asset's human-readable name is blank or ambiguous, retaining the underlying file path.

5. **Asset dimensions and size.** Show image dimensions and file size in the assets area so users can identify unexpectedly large source images.

6. **Asset reference copy feedback.** Confirm when the existing usable asset reference is copied, including the relative path needed by the selected page.

7. **Missing asset diagnostics.** List the referencing page and unresolved asset path when preview verification detects a missing local resource.

8. **Broken internal link context.** Show the source page, link label and missing destination together in existing site-link checks.

9. **Viewport size labels.** Display the actual preview width beside mobile, tablet and desktop controls so screenshots can be interpreted consistently.

10. **Selected element context.** Show a short tag and text summary above an element-specific request so users can verify what their instruction will target.

11. **Preview loading states.** Distinguish loading, failed rendering and an intentionally empty page instead of showing the same blank frame for each.

12. **Preview error recovery.** Keep the page selection and request text when a preview fails, with an explicit retry action for the affected frame.

13. **Board filter reset.** Offer a direct reset when page or work filters hide every item, while keeping an actually empty site state distinct.

14. **History entry context.** Show the affected filename, timestamp and available change summary together in the existing history list.

15. **Restore version recap.** Repeat the selected file and version time before restoring a historical file, preserving the current restore behavior.

16. **Publish destination visibility.** Keep the selected destination name and known URL visible throughout the publishing dialog so users can check where the site will go.

17. **Publish change summary.** Present added, changed and removed page counts from the existing publication comparison before starting a publish.

18. **Publish failure detail.** Separate build, upload and destination errors when the existing publisher exposes them, retaining the chosen destination for retry.

19. **Published timestamp clarity.** Show the exact last-published time beside the address and distinguish it from a more recent local save.

20. **Export viewport recap.** Show the selected page, current preview width and chosen PNG or PDF output before exporting a review copy.

## References

- [App guide](docs/app-guide.md)
- [Development guide](docs/development.md)
- [Current implementation](src/components/SiteBoardView.tsx)
