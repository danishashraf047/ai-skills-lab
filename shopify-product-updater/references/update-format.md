# Product update format

Use this project structure:

```text
assets-updated/
├── final/
│   ├── BBS-46/
│   │   ├── update.json
│   │   └── new-01.png
│   └── BBS-57/
│       ├── update.json
│       ├── new-01.png
│       └── new-02.png
└── updated/
```

Every direct child of `final` is one existing product. Its folder name is converted to a lowercase Shopify handle after validation against the configured `titlePrefix`.

## `update.json`

```json
{
  "description": "Updated product description.",
  "images": ["new-01.png", "new-02.png"],
  "imagePlacement": "first",
  "collections": {
    "add": ["summer", "new-arrival"],
    "remove": ["winter"],
    "syncTags": true
  }
}
```

- `description` is optional plain text. It replaces the description and must not be empty. Paragraph breaks are preserved as HTML paragraphs.
- `images` is an optional ordered list of local `.png`, `.jpg`, `.jpeg`, or `.webp` filenames. Every listed image must exist, filenames must be unique, and undeclared image files are rejected.
- `imagePlacement` is `first` or `last`; it defaults to `last` when images are present.
- `collections.add` and `collections.remove` contain aliases from `shopify-product-upload.json`. Unknown aliases, duplicates, or the same alias in both arrays are rejected.
- `collections.syncTags` defaults to `false`. When true, configured tags for added collections are added. A removed collection tag is removed only when no retained configured collection uses the same tag.

Omitted properties remain unchanged. Each file must request at least one effective update. The first resulting media item is the featured image.

The updater intentionally does not create products, remove existing images, replace image pixels, or change titles, handles, product types, variants, prices, inventory, status, publication, metafields, or size guides.
