---
name: shopify-product-updater
description: Dry-run, update, verify, roll back, and archive batches of existing Shopify products from assets-updated/final product folders. Supports descriptions, appended images with first/last placement, collection additions/removals, and optional configured tag synchronization. Use when a user asks to update already-uploaded Shopify products in bulk. Do not use for creating new products, changing variants/prices/inventory, deleting existing images, or renaming source assets.
---

# Shopify Product Updater

Use `scripts/update-products.mjs`. The target project must contain the same `shopify-product-upload.json` configuration used by `$shopify-product-uploader`; never embed store IDs or credentials in this skill.

Read [references/update-format.md](references/update-format.md) when preparing or reviewing product folders. Read [references/operations.md](references/operations.md) before a live update or recovery.

## Prepare and dry-run

The default source is `assets-updated/final` under the store project. Each direct child must be an exact product key such as `BBS-46` and contain `update.json` plus any declared new images.

Run the read-only dry-run:

```bash
node <skill-dir>/scripts/update-products.mjs \
  --project-root '<store-project>'
```

The dry-run reads Shopify but performs no mutations. It validates the entire batch, resolves every existing managed product and configured collection, checks destination collisions, and prints current and proposed descriptions, media order, collections, and tags. It also prints a `planDigest`.

Resolve every validation or unsupported-collection error instead of bypassing it. Never update a product that lacks the configured `managedTag`.

## Confirmation boundary

Before applying, show the user the exact dry-run, store, folders, affected products, new files, description changes, media ordering, collection changes, tag changes, receipt location, rollback limits, and local moves. Obtain explicit confirmation in a separate turn.

Use the unchanged command inputs plus the reviewed digest:

```bash
node <skill-dir>/scripts/update-products.mjs \
  --project-root '<store-project>' \
  --plan-digest '<reviewed-digest>' \
  --apply
```

If the recomputed digest differs, stop and dry-run again. Do not substitute a different folder, config, or digest after confirmation.

## Execution guarantees

The updater must:

1. Process products sequentially and snapshot each product immediately before mutation.
2. Append only declared image files, wait for Shopify file/media processing, and preserve existing media IDs and relative order.
3. Put new images first or last in declared order; position zero is the featured image.
4. Use configured collection aliases, verify live IDs and titles, and distinguish direct/manual from flexible source membership.
5. Apply optional collection-tag synchronization only when `syncTags` is true.
6. Re-fetch and verify description, media order/status, collections, and tags before moving a folder.
7. Move each verified product folder from `final` to sibling `updated` without overwriting a destination.
8. Write a timestamped JSON receipt under `docs/product-update-receipts/`.

On a product failure, attempt to restore its description, tags, collection overrides, media order, and delete only files created by that update. Record rollback results, stop by default, and leave the failed and pending folders in `final`. Previously verified products stay complete. Use `--continue-on-error` only when the user explicitly approved that behavior. Never describe a multi-product update as atomic.

Monitor the command until it completes or reports a concrete error. Report partial completion from the receipt rather than claiming the whole batch succeeded.
