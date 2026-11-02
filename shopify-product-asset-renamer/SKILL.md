---
name: shopify-product-asset-renamer
description: Rename Shopify product images into the BBS metadata convention, including grouped multi-image products, optional size-guide IDs, continued title numbering, random discounts, and calculated original prices. Use when a user asks to prepare or rename product assets in a final folder for Shopify upload. Do not use for uploading files to Shopify or editing image pixels.
---

# Shopify Product Asset Renamer

Use `scripts/rename-product-assets.mjs` for the filename transformation. It preserves the image bytes and changes filenames only.

## Required outcome

Create names in this exact form:

```text
(TITLE\BBS-19)-(SALE PRICE\2499)-(SIZES\Unstitched)-(DESCRIPTION\Allover Print Khaddar)-(DISCOUNT PERCENTAGE\20)-(ORIGINAL PRICE\3124).png
```

For a product with multiple images and a size-guide metaobject, use:

```text
(TITLE\BBS-46)-(SALE PRICE\3499)-(SIZES\S-M-L-XL)-(DESCRIPTION\Kaftan Khaddar)-(DISCOUNT PERCENTAGE\20)-(ORIGINAL PRICE\4374)-(SIZE GUIDE\644285366369)-(IMAGE\01).png
```

- Continue numbering after the highest existing `TITLE\<prefix>-N` found under `assets-to-upload`, unless the user provides a starting number.
- Preserve sale price, sizes, description, and extension from source metadata.
- Pick each discount from 20, 30, or 40 percent unless the user supplies a different allowed set.
- Calculate `original = round(sale / (1 - discount / 100))`.
- Keep one title, discount, original price, and size-guide ID across every image in a product group.
- Number grouped images with two digits. `IMAGE\01` is the featured image, followed by `IMAGE\02`, `IMAGE\03`, and so on.
- Store only the numeric Shopify metaobject entry ID in `SIZE GUIDE`; do not embed an Admin URL or GID in the filename.
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

For grouped source images such as `46.png` and `46-1.png`, use multi-image mode with the product metadata supplied by the user:

```bash
node <skill-dir>/scripts/rename-product-assets.mjs '<folder>' \
  --multi-image \
  --sale-price 3499 \
  --sizes 'S-M-L-XL' \
  --description 'Kaftan Khaddar' \
  --size-guide 644285366369
```

In multi-image mode, `<group>.png` becomes `IMAGE\01`, `<group>-1.png` becomes `IMAGE\02`, and files sharing the same group number become one product. Reuse the dry-run seed when applying.

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
