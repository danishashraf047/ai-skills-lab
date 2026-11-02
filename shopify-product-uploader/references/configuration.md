# Project configuration

Keep one `shopify-product-upload.json` at the store project root. Copy `assets/shopify-product-upload.example.json`, then replace every example store domain, currency, vendor, collection GID, collection title, tag, and profile value with data verified for that store.

Do not store passwords, Admin API tokens, session cookies, or other credentials in this file. The uploader delegates authentication to Shopify CLI.

## Top-level fields

- `store`: exact `.myshopify.com` domain.
- `apiVersion`: Admin API version supported by the uploader operations.
- `currency`: expected shop currency; live upload stops on mismatch.
- `vendor`: vendor assigned to created products.
- `managedTag`: ownership marker. Existing products without this tag are never modified.
- `titlePrefix`: prefix encoded in filenames, such as `BBS`.
- `sizeGuideMetafield`: product metafield namespace, key, and expected referenced metaobject type.
- `collections`: named collection records with verified GID, exact title, and optional tag.
- `discountCollections`: maps an encoded discount percentage to a collection key.
- `profiles`: reusable product-type, tag, and base-collection presets.

Collection and profile keys are local aliases. They may be named for any category, subcategory, season, or campaign.

## Profiles and folders

A profile does not have to repeat the folder path. The command selects both explicitly:

```bash
node <skill-dir>/scripts/upload-products.mjs \
  --project-root '/path/to/store-project' \
  --folder 'assets-to-upload/Women/Casual/final' \
  --profile 'women-casual'
```

Use `--extra-collections winter,all-seasons` for temporary or cross-category assignments. Keep stable category membership in the profile.

## Size guides

`SIZE GUIDE` in a filename is the numeric part of a Shopify metaobject GID. For example, `SIZE GUIDE\644285366369` becomes `gid://shopify/Metaobject/644285366369`.

The configured metafield definition must already exist in Shopify and accept a reference to the configured metaobject type. The uploader validates the referenced entry type before writing the product metafield.

## Before a live upload

Verify configuration with a dry-run first. The live phase additionally checks shop currency, Online Store publication, exact collection titles, and referenced metaobjects before creating products. Never reuse a configuration from a different Shopify store without replacing and verifying its identifiers.
