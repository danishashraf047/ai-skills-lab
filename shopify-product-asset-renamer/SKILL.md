---
name: shopify-product-asset-renamer
description: Rename Shopify product image files into the BBS metadata convention, continue title numbering across assets-to-upload, assign allowed random discounts, and calculate original prices. Use when a user asks to prepare or rename product assets in a final folder for Shopify upload. Do not use for uploading files to Shopify or editing image pixels.
---

# Shopify Product Asset Renamer

Use `scripts/rename-product-assets.mjs` for the filename transformation. It preserves the image bytes and changes filenames only.

## Required outcome

Create names in this exact form:

```text
(TITLE\BBS-19)-(SALE PRICE\2499)-(SIZES\Unstitched)-(DESCRIPTION\Allover Print Khaddar)-(DISCOUNT PERCENTAGE\20)-(ORIGINAL PRICE\3124).png
```

- Continue numbering after the highest existing `TITLE\<prefix>-N` found under `assets-to-upload`, unless the user provides a starting number.
- Preserve sale price, sizes, description, and extension from source metadata.
- Pick each discount from 20, 30, or 40 percent unless the user supplies a different allowed set.
- Calculate `original = round(sale / (1 - discount / 100))`.
- Treat unstitched products as `SIZES\Unstitched` when the folder path says `Unstiched` or `Unstitched` and no sizes are encoded.
- Do not invent a missing description or ready-to-wear size. Supply an override only when it is supported by the user's request or folder context; otherwise ask.

## Workflow

1. Inspect the target folder and identify missing metadata.
2. Run a dry-run. Record the printed seed so the preview and apply run produce identical discounts.

```bash
node <skill-dir>/scripts/rename-product-assets.mjs '<folder>'
```

3. Review the complete mapping. Resolve every reported ambiguity rather than guessing. Useful overrides are `--description`, `--sizes`, `--start`, `--prefix`, and `--assets-root`.
4. Apply the reviewed plan with the same seed:

```bash
node <skill-dir>/scripts/rename-product-assets.mjs '<folder>' --seed '<seed-from-preview>' --apply
```

5. Report the number of files renamed and the new title range. Mention any rounding used for original prices.

The user's request to rename the folder authorizes the apply step. Stop before applying only when metadata is ambiguous, a target collision is detected, or the requested path is unclear.

## Source filenames

The script accepts image names shaped like these:

```text
2-6600-s-m-l-xl-(Dhanak Marina Maxi).png
1-5999-s-m-l-(Kaftan Khaddar).jpeg
1-2499-(Allover Print Khaddar).png
```

It ignores dotfiles and already standardized BBS filenames. Run it with `--help` for all options.
