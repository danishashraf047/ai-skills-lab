# Live update and recovery rules

The script delegates authentication and Admin API execution to Shopify CLI. The project configuration must provide `store`, `apiVersion`, `managedTag`, `titlePrefix`, and the referenced collection records. It must not contain credentials.

## Collection membership

- Direct/manual collections use direct add/remove membership operations.
- A flexible collection must have exactly one editable conditions source. Adding removes a manual exclusion and adds a manual inclusion. Removing removes a manual inclusion and adds a manual exclusion, so matching a general rule cannot immediately re-add the product.
- Sub-collection-only, app-managed, variant-targeted, or ambiguous multi-source collections are rejected rather than guessed.
- The pre-update inclusion and exclusion selections are recorded so rollback can restore the exact override state.

## Media

Images are staged, created as Shopify files, associated with the product, and polled until ready. Reordering is asynchronous: submit only required moves, poll the returned job, and then verify the complete media ID order. Existing media is never deleted by a normal update.

## Rollback limits

Rollback is best effort, not a transaction. It restores fields changed by the current product update and deletes only new Shopify files recorded in the receipt. If rollback is incomplete, stop even when continue-on-error was selected and report the receipt path for manual recovery.

The receipt is the recovery authority. Do not infer uploaded file IDs, collection overrides, or the pre-update media order from filenames after a failure.
