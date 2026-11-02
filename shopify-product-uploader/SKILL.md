---
name: shopify-product-uploader
description: Dry-run, upload, publish, tag, classify, verify, and archive prepared Shopify product-image batches using a reusable bundled uploader. Supports single- and multi-image products, profile-based collections, discount collections, and size-guide metaobject references. Use when a user asks to insert or upload prepared products from an assets-to-upload final folder. Do not use for renaming source assets or editing image pixels.
---

# Shopify Product Uploader

Use `scripts/upload-products.mjs` from this skill. Store-specific values belong in `shopify-product-upload.json` at the target project root; never copy store IDs, titles, or credentials from another project.

For a new store or project, read [references/configuration.md](references/configuration.md) and copy `assets/shopify-product-upload.example.json` to the project root. When creating or reorganizing asset folders, also read [references/folder-structure.md](references/folder-structure.md).

## Accepted assets

The uploader accepts the metadata convention produced by `$shopify-product-asset-renamer`.

- A single image may omit `IMAGE` and `SIZE GUIDE`.
- Multiple images share the same `TITLE` and metadata and use consecutive `IMAGE\01`, `IMAGE\02`, and so on.
- `IMAGE\01` is the featured image.
- `SIZE GUIDE` contains a numeric Shopify metaobject entry ID. Every image in the product group must use the same ID.
- All grouped images must agree on sale price, sizes, description, discount, original price, and size guide.

## Prepare the operation

Select a profile from the project configuration, derive the folder from the request, and add only explicitly requested or clearly established seasonal or campaign collection keys.

Run a dry-run first:

```bash
node <skill-dir>/scripts/upload-products.mjs \
  --project-root '<store-project>' \
  --folder 'assets-to-upload/<category>/<subcategory>/final' \
  --profile '<configured-profile>' \
  --extra-collections '<comma-separated-keys>'
```

The script can discover the project root by walking upward from the current directory or source folder, but pass `--project-root` when operating across repositories. `--config` may select an alternate JSON file.

The dry-run makes no network request. Review the exact product count, image count, title range, variants, prices, tags, collections, discount routing, size-guide GIDs, move destination, and store domain. Resolve parser errors and target collisions instead of bypassing them.

## Live confirmation boundary

Before adding `--apply`, show the exact command, target store, transmitted files and metadata, collection and tag effects, metafield effects, publishing behavior, receipt path, and local file moves. Obtain the user's explicit confirmation in a separate turn.

After confirmation, run the same reviewed command with `--apply`. Do not change the folder, profile, collections, or other inputs between confirmation and execution.

## Upload guarantees

The uploader must:

1. Validate store currency, publication, collection IDs and titles, and every referenced size-guide metaobject.
2. Group images by title, preserve image order, and create one product per title.
3. Create size variants, prices, compare-at prices, SKUs, tags, and configured collection memberships.
4. Write the configured size-guide metafield with `metafieldsSet` when `SIZE GUIDE` is present.
5. Publish to the Online Store.
6. Verify product status, publication, variants, prices, SKUs, tags, media count and status, collections, and size-guide reference.
7. Move every verified source image to the sibling `uploaded` folder only after the whole batch passes verification.
8. Write a timestamped JSON receipt under `docs/product-upload-receipts/`.

Use `--no-move` only when the user asks to retain verified source files. The uploader may reuse an existing product only when it has the configured managed tag; otherwise it must refuse to modify it.

Monitor the process until it completes or reports a concrete error. On failure, preserve the receipt and unmoved files, explain the exact stopping point, and do not claim completion.
