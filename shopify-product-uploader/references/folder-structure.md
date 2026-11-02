# Product asset folder structure

Use `assets-to-upload` at the store project root. Category and subcategory names are flexible; only the final two workflow folders are fixed.

```text
store-project/
├── shopify-product-upload.json
├── assets-to-upload/
│   ├── Pret/
│   │   ├── Casual/
│   │   │   ├── final/
│   │   │   └── uploaded/
│   │   └── Formal/
│   │       ├── final/
│   │       └── uploaded/
│   └── Unstitched/
│       ├── 2 Piece/
│       │   ├── final/
│       │   └── uploaded/
│       └── 3 Piece/
│           ├── final/
│           └── uploaded/
└── docs/
    └── product-upload-receipts/
```

## Folder rules

- `final` contains only standardized product images ready for the next dry-run.
- `uploaded` contains images moved after the entire batch passes live verification.
- Keep all images for one product in the same `final` folder.
- Do not manually move a partial or failed batch into `uploaded`.
- Receipts belong under `docs/product-upload-receipts`, not beside the images.
- Add more category levels when useful; pass the exact `final` folder to the uploader.

The sibling `uploaded` folder is created automatically after successful verification. Existing destination filenames cause the uploader to stop instead of overwriting them.
