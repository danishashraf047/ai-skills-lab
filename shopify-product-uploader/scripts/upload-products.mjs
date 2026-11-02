import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const configFilename = "shopify-product-upload.json";

function fail(message) {
  throw Error(message);
}

function usage() {
  console.log(`Usage:
  node <skill-dir>/scripts/upload-products.mjs --project-root <project> --folder <final-folder> --profile <profile> [options]

Options:
  --project-root <path>           Project containing ${configFilename} and assets-to-upload.
  --folder <path>                 Folder containing standardized product images.
  --profile <name>                Upload profile from ${configFilename}.
  --extra-collections <keys>      Comma-separated additional collection keys.
  --config <path>                 Alternate project configuration file.
  --receipt <path>                Alternate receipt JSON path.
  --apply                         Perform Shopify writes after an approved dry-run.
  --no-move                       Keep verified files in the source folder.
  --help                          Show this message.

Examples:
  node <skill-dir>/scripts/upload-products.mjs \\
    --project-root "/path/to/store-project" \\
    --folder "assets-to-upload/Pret/Formal/final" \\
    --profile pret-formal \\
    --extra-collections winter

  node <skill-dir>/scripts/upload-products.mjs \\
    --project-root "/path/to/store-project" \\
    --folder "assets-to-upload/Unstiched/2 Piece/final" \\
    --profile unstiched-2-piece \\
    --extra-collections winter \\
    --apply`);
}

function parseArgs(argv) {
  const options = {
    apply: false,
    move: true,
    extraCollections: [],
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    }
    if (arg === "--apply") {
      options.apply = true;
      continue;
    }
    if (arg === "--no-move") {
      options.move = false;
      continue;
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) fail(`Missing value for ${arg}.`);
    index += 1;
    if (arg === "--folder") options.folder = value;
    else if (arg === "--profile") options.profileName = value;
    else if (arg === "--config") options.configPath = value;
    else if (arg === "--project-root") options.projectRoot = value;
    else if (arg === "--receipt") options.receipt = value;
    else if (arg === "--extra-collections") {
      options.extraCollections.push(...value.split(",").map((item) => item.trim()).filter(Boolean));
    } else fail(`Unknown option: ${arg}`);
  }
  if (!options.folder) fail("--folder is required.");
  if (!options.profileName) fail("--profile is required.");
  return options;
}

function findProjectRoot(start) {
  let candidate = path.resolve(start);
  while (true) {
    if (fs.existsSync(path.join(candidate, configFilename))) return candidate;
    const parent = path.dirname(candidate);
    if (parent === candidate) return null;
    candidate = parent;
  }
}

function resolveOptions(rawOptions) {
  const cwd = process.cwd();
  const explicitProjectRoot = rawOptions.projectRoot
    ? path.resolve(cwd, rawOptions.projectRoot)
    : null;
  const explicitConfigPath = rawOptions.configPath
    ? path.resolve(cwd, rawOptions.configPath)
    : null;
  const initialFolder = path.isAbsolute(rawOptions.folder)
    ? rawOptions.folder
    : path.resolve(explicitProjectRoot || cwd, rawOptions.folder);
  const projectRoot = explicitProjectRoot
    || (explicitConfigPath ? path.dirname(explicitConfigPath) : null)
    || findProjectRoot(initialFolder)
    || findProjectRoot(cwd);
  if (!projectRoot) fail(`Could not find ${configFilename}. Pass --project-root or --config.`);
  const configPath = explicitConfigPath || path.join(projectRoot, configFilename);
  const folder = path.isAbsolute(rawOptions.folder)
    ? path.resolve(rawOptions.folder)
    : path.resolve(projectRoot, rawOptions.folder);
  const receipt = rawOptions.receipt
    ? path.resolve(projectRoot, rawOptions.receipt)
    : null;
  return { ...rawOptions, projectRoot, configPath, folder, receipt };
}

function loadJson(filename, label) {
  if (!fs.existsSync(filename)) fail(`${label} not found: ${filename}`);
  try {
    return JSON.parse(fs.readFileSync(filename, "utf8"));
  } catch (error) {
    fail(`Invalid ${label}: ${error.message}`);
  }
}

function unique(values) {
  return [...new Set(values)];
}

function slug(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function timestamp() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeSize(value) {
  if (value.toLowerCase() === "unstitched") return "Unstitched";
  return value.toUpperCase();
}

function mimeType(extension) {
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "png") return "image/png";
  if (extension === "webp") return "image/webp";
  fail(`Unsupported image extension: ${extension}`);
}

const options = resolveOptions(parseArgs(process.argv.slice(2)));
const projectRoot = options.projectRoot;
const config = loadJson(options.configPath, "upload configuration");
const profile = config.profiles?.[options.profileName];
if (!profile) fail(`Unknown profile: ${options.profileName}.`);
if (!fs.existsSync(options.folder) || !fs.statSync(options.folder).isDirectory())
  fail(`Product folder not found: ${options.folder}`);
if (!config.store || !config.apiVersion || !config.currency || !config.vendor || !config.managedTag)
  fail("Upload configuration is missing required store fields.");
if (!config.sizeGuideMetafield?.namespace || !config.sizeGuideMetafield?.key)
  fail("Upload configuration is missing sizeGuideMetafield namespace or key.");

const baseCollectionKeys = unique([...(profile.collections || []), ...options.extraCollections]);
for (const key of baseCollectionKeys) {
  if (!config.collections?.[key]) fail(`Unknown collection key: ${key}.`);
}

const titlePrefix = String(config.titlePrefix || "BBS").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const filenamePattern = new RegExp(
  `^\\(TITLE\\\\(${titlePrefix}-\\d+)\\)-\\(SALE PRICE\\\\(\\d+)\\)-\\(SIZES\\\\([^)]+)\\)-\\(DESCRIPTION\\\\([^)]+)\\)-\\(DISCOUNT PERCENTAGE\\\\(\\d+)\\)-\\(ORIGINAL PRICE\\\\(\\d+)\\)(?:-\\(SIZE GUIDE\\\\(\\d+)\\))?(?:-\\(IMAGE\\\\(\\d+)\\))?\\.(png|jpe?g|webp)$`,
  "i",
);

function parseProducts() {
  const entries = fs.readdirSync(options.folder, { withFileTypes: true })
    .filter((entry) => entry.isFile() && !entry.name.startsWith("."));
  if (!entries.length) fail(`No product images found in ${options.folder}.`);
  const parsedImages = entries.map((entry) => {
    const match = entry.name.match(filenamePattern);
    if (!match) fail(`Unsupported product filename: ${entry.name}`);
    const [, title, sale, sizes, description, discount, original, sizeGuideId, imageNumber, extension] = match;
    const calculated = Math.round(Number(sale) / (1 - Number(discount) / 100));
    if (Number(original) !== calculated)
      fail(`Original price mismatch in ${entry.name}; expected ${calculated}.`);
    return {
      title: title.toUpperCase(),
      handle: title.toLowerCase(),
      sale: Number(sale),
      sizes: sizes.split("-").map(normalizeSize),
      description: description.trim(),
      discount: Number(discount),
      original: Number(original),
      sizeGuideId: sizeGuideId || null,
      imageNumber: imageNumber ? Number(imageNumber) : null,
      extension: extension.toLowerCase(),
      sourceName: entry.name,
      sourcePath: path.join(options.folder, entry.name),
    };
  });

  const groups = new Map();
  for (const image of parsedImages) {
    if (!groups.has(image.title)) groups.set(image.title, []);
    groups.get(image.title).push(image);
  }

  const products = [...groups.entries()].map(([title, images]) => {
    const first = images[0];
    const metadataKeys = ["handle", "sale", "description", "discount", "original", "sizeGuideId"];
    for (const image of images.slice(1)) {
      for (const key of metadataKeys) {
        if (image[key] !== first[key]) fail(`Inconsistent ${key} across images for ${title}.`);
      }
      if (JSON.stringify(image.sizes) !== JSON.stringify(first.sizes))
        fail(`Inconsistent sizes across images for ${title}.`);
    }
    if (images.length > 1 && images.some((image) => image.imageNumber === null))
      fail(`Every image for ${title} must include an IMAGE field.`);
    const orderedImages = images
      .map((image) => ({ ...image, imageNumber: image.imageNumber ?? 1 }))
      .sort((left, right) => left.imageNumber - right.imageNumber);
    for (const [index, image] of orderedImages.entries()) {
      if (image.imageNumber !== index + 1)
        fail(`Images for ${title} must be numbered consecutively from 01.`);
    }
    const discountCollectionKey = config.discountCollections?.[first.discount];
    if (!discountCollectionKey || !config.collections?.[discountCollectionKey])
      fail(`No configured collection for ${first.discount}% in ${first.sourceName}.`);
    const collectionKeys = unique([...baseCollectionKeys, discountCollectionKey]);
    const collections = collectionKeys.map((key) => ({ key, ...config.collections[key] }));
    const tags = unique([
      config.managedTag,
      ...(profile.tags || []),
      ...collections.map((collection) => collection.tag).filter(Boolean),
    ]);
    return {
      title,
      handle: first.handle,
      sale: first.sale,
      sizes: first.sizes,
      description: first.description,
      discount: first.discount,
      original: first.original,
      sizeGuideId: first.sizeGuideId,
      sizeGuideGid: first.sizeGuideId ? `gid://shopify/Metaobject/${first.sizeGuideId}` : null,
      images: orderedImages,
      collections,
      tags,
    };
  }).sort((a, b) => Number(a.title.split("-").at(-1)) - Number(b.title.split("-").at(-1)));

  const handles = products.map((product) => product.handle);
  if (new Set(handles).size !== handles.length) fail("Duplicate product handle detected.");
  return products;
}

const products = parseProducts();
const uploadedFolder = path.join(path.dirname(options.folder), "uploaded");
const batchName = slug(path.relative(path.join(projectRoot, "assets-to-upload"), path.dirname(options.folder))) || options.profileName;
const receiptFile = options.receipt
  || path.join(projectRoot, "docs", "product-upload-receipts", `product-upload-${batchName}-${timestamp()}.json`);
const store = config.store;
const apiVersion = config.apiVersion;

const operations = {
  context: `query ProductUploadContext { shop { name currencyCode } publications(first: 20) { nodes { id catalog { title } } } }`,
  product: `query ProductUploadProduct($handle: String!, $publicationId: ID!, $sizeGuideNamespace: String!, $sizeGuideKey: String!) { productByIdentifier(identifier: {handle: $handle}) { id handle status tags sizeGuide: metafield(namespace: $sizeGuideNamespace, key: $sizeGuideKey) { jsonValue } publishedOnPublication(publicationId: $publicationId) collections(first: 100) { nodes { id } } variants(first: 100) { nodes { title price compareAtPrice sku } } media(first: 100) { nodes { status } } } }`,
  collections: `query ProductUploadCollections($ids: [ID!]!) { nodes(ids: $ids) { ... on Collection { id title sources { __typename id } } } }`,
  sizeGuides: `query ProductUploadSizeGuides($ids: [ID!]!) { nodes(ids: $ids) { ... on Metaobject { id type } } }`,
  stagedUpload: `mutation ProductUploadStage($input: [StagedUploadInput!]!) { stagedUploadsCreate(input: $input) { stagedTargets { url resourceUrl parameters { name value } } userErrors { field message } } }`,
  productSet: `mutation ProductUploadProductSet($input: ProductSetInput!) { productSet(input: $input, synchronous: true) { product { id handle tags } userErrors { field message } } }`,
  publish: `mutation ProductUploadPublish($id: ID!, $input: [PublicationInput!]!) { publishablePublish(id: $id, input: $input) { userErrors { field message } } }`,
  setMetafields: `mutation ProductUploadSetMetafields($metafields: [MetafieldsSetInput!]!) { metafieldsSet(metafields: $metafields) { metafields { namespace key jsonValue } userErrors { field message code } } }`,
  addToFlexibleCollection: `mutation ProductUploadAddToFlexibleCollection($collectionId: ID!, $sourceId: ID!, $selections: [CollectionInclusionProductSelectionInput!]!) { collectionUpdate(collection: { id: $collectionId, sourcesToUpdate: [{ condition: { id: $sourceId, inclusion: { selectionsToAdd: $selections } } }] }) { collection { id title } userErrors { field message } } }`,
  addToLegacyCollection: `mutation ProductUploadAddToLegacyCollection($id: ID!, $productIds: [ID!]!) { collectionAddProducts(id: $id, productIds: $productIds) { collection { id title } userErrors { field message } } }`,
};

function operationErrors(result) {
  if (result.errors?.length) return result.errors;
  const payload = result.data || result;
  for (const value of Object.values(payload)) {
    if (value?.userErrors?.length) return value.userErrors;
  }
  return null;
}

async function execute(temp, sequence, query, variables = {}, mutation = false) {
  const number = sequence.value++;
  const queryFile = path.join(temp, `operation-${number}.graphql`);
  const variableFile = path.join(temp, `variables-${number}.json`);
  fs.writeFileSync(queryFile, query, { mode: 0o600 });
  fs.writeFileSync(variableFile, JSON.stringify(variables), { mode: 0o600 });
  const args = [
    "store", "execute", "--store", store, "--version", apiVersion,
    "--query-file", queryFile, "--variable-file", variableFile,
    "--json", "--no-input",
  ];
  if (mutation) args.push("--allow-mutations");
  try {
    const { stdout } = await run("shopify", args, {
      env: {
        ...process.env,
        SHOPIFY_CLI_AGENT_INFO: "n:codex|v:none|p:openai|m:gpt-5",
      },
      maxBuffer: 8 * 1024 * 1024,
    });
    const result = JSON.parse(stdout);
    const errors = operationErrors(result);
    if (errors) fail(JSON.stringify(errors));
    return result.data || result;
  } finally {
    fs.rmSync(queryFile, { force: true });
    fs.rmSync(variableFile, { force: true });
  }
}

async function uploadImage(executeOperation, product, productImage) {
  const image = fs.readFileSync(productImage.sourcePath);
  const filename = `${product.handle}-${String(productImage.imageNumber).padStart(2, "0")}.${productImage.extension}`;
  const staged = await executeOperation(operations.stagedUpload, {
    input: [{
      filename,
      mimeType: mimeType(productImage.extension),
      resource: "IMAGE",
      httpMethod: "POST",
      fileSize: String(image.length),
    }],
  }, true);
  const target = staged.stagedUploadsCreate.stagedTargets[0];
  if (!target) fail(`No staged upload target for ${product.title}.`);
  const form = new FormData();
  for (const parameter of target.parameters) form.append(parameter.name, parameter.value);
  form.append("file", new Blob([image], { type: mimeType(productImage.extension) }), filename);
  const response = await fetch(target.url, { method: "POST", body: form });
  if (!response.ok) fail(`Image upload failed (${response.status}) for ${product.title}.`);
  return target.resourceUrl;
}

async function productState(executeOperation, product, publicationId) {
  return (await executeOperation(operations.product, {
    handle: product.handle,
    publicationId,
    sizeGuideNamespace: config.sizeGuideMetafield.namespace,
    sizeGuideKey: config.sizeGuideMetafield.key,
  }))
    .productByIdentifier;
}

function verifyProduct(product, record, publicationId) {
  if (!record) return "product missing";
  if (record.status !== "ACTIVE") return `status is ${record.status}`;
  if (!record.publishedOnPublication) return `not published on ${publicationId}`;
  for (const tag of product.tags) if (!record.tags.includes(tag)) return `missing tag ${tag}`;
  if (product.sizeGuideGid && record.sizeGuide?.jsonValue !== product.sizeGuideGid)
    return "size guide mismatch";
  const collectionIds = new Set(record.collections.nodes.map((item) => item.id));
  for (const collection of product.collections) {
    if (!collectionIds.has(collection.id)) return `missing collection ${collection.id}`;
  }
  if (record.variants.nodes.length !== product.sizes.length) return "variant count mismatch";
  for (const size of product.sizes) {
    const variant = record.variants.nodes.find((item) => item.title === size);
    if (!variant) return `missing ${size} variant`;
    if (Number(variant.price) !== product.sale) return `${size} sale price mismatch`;
    if (Number(variant.compareAtPrice) !== product.original) return `${size} compare-at price mismatch`;
    if (variant.sku !== `${product.title}-${size.toUpperCase()}`) return `${size} SKU mismatch`;
  }
  if (record.media.nodes.length !== product.images.length) return "media count mismatch";
  if (record.media.nodes.some((item) => item.status === "FAILED")) return "media processing failed";
  if (record.media.nodes.some((item) => item.status !== "READY")) return "media processing";
  return null;
}

function save(receipt) {
  fs.mkdirSync(path.dirname(receiptFile), { recursive: true });
  fs.writeFileSync(receiptFile, `${JSON.stringify(receipt, null, 2)}\n`);
}

const plan = products.map((product) => ({
  title: product.title,
  handle: product.handle,
  productType: profile.productType,
  price: product.sale,
  compareAtPrice: product.original,
  sizes: product.sizes,
  images: product.images.map((image) => ({
    number: image.imageNumber,
    filename: image.sourceName,
  })),
  sizeGuide: product.sizeGuideGid,
  tags: product.tags,
  collections: product.collections.map((collection) => collection.title),
}));

if (!options.apply) {
  console.log(JSON.stringify({
    mode: "dry-run",
    store,
    profile: options.profileName,
    sourceFolder: options.folder,
    uploadedFolder,
    moveAfterVerification: options.move,
    products: plan,
    effect: "No network requests or changes. Re-run with --apply only after reviewing and confirming the live Shopify operation.",
  }, null, 2));
  process.exit(0);
}

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "bbs-product-upload-"));
const sequence = { value: 1 };
const executeOperation = (query, variables = {}, mutation = false) =>
  execute(temp, sequence, query, variables, mutation);
const receipt = {
  store,
  apiVersion,
  profile: options.profileName,
  sourceFolder: path.relative(projectRoot, options.folder),
  startedAt: new Date().toISOString(),
  status: "running",
  products: [],
};
save(receipt);

try {
  const context = await executeOperation(operations.context);
  if (context.shop.currencyCode !== config.currency)
    fail(`Expected ${config.currency} store currency; found ${context.shop.currencyCode}.`);
  const onlineStores = context.publications.nodes.filter((item) => /\bOnline Store\b/i.test(item.catalog?.title || ""));
  if (onlineStores.length !== 1) fail("Could not uniquely resolve the Online Store publication.");
  const publicationId = onlineStores[0].id;
  receipt.publicationId = publicationId;
  receipt.shopName = context.shop.name;
  save(receipt);

  const requiredCollectionMap = new Map();
  for (const product of products) {
    for (const collection of product.collections) requiredCollectionMap.set(collection.id, collection);
  }
  const requiredCollections = [...requiredCollectionMap.values()];
  const collectionRecords = (await executeOperation(
    operations.collections,
    { ids: requiredCollections.map((collection) => collection.id) },
  )).nodes;
  const collectionSourceIds = new Map();
  for (const expected of requiredCollections) {
    const actual = collectionRecords.find((item) => item?.id === expected.id);
    if (!actual) fail(`Collection not found: ${expected.title} (${expected.id}).`);
    if (actual.title !== expected.title) fail(`Collection title mismatch for ${expected.id}: ${actual.title}.`);
    const sources = actual.sources.filter((source) => source.__typename === "CollectionConditionsSource");
    if (sources.length > 1) fail(`Expected at most one editable source for ${expected.title}.`);
    collectionSourceIds.set(expected.id, sources[0]?.id || null);
  }

  const sizeGuideProducts = products.filter((product) => product.sizeGuideGid);
  if (sizeGuideProducts.length) {
    const metafield = config.sizeGuideMetafield;
    if (!metafield?.namespace || !metafield?.key || !metafield?.metaobjectType)
      fail("Upload configuration is missing sizeGuideMetafield settings.");
    const expectedIds = unique(sizeGuideProducts.map((product) => product.sizeGuideGid));
    const sizeGuideRecords = (await executeOperation(operations.sizeGuides, { ids: expectedIds })).nodes;
    for (const id of expectedIds) {
      const actual = sizeGuideRecords.find((item) => item?.id === id);
      if (!actual) fail(`Size-guide metaobject not found: ${id}.`);
      if (actual.type !== metafield.metaobjectType)
        fail(`Expected ${id} to be a ${metafield.metaobjectType} metaobject; found ${actual.type}.`);
    }
  }

  const records = new Map();
  for (const [index, product] of products.entries()) {
    let record = await productState(executeOperation, product, publicationId);
    const created = !record;
    if (record && !record.tags.includes(config.managedTag))
      fail(`Refusing to modify unrelated existing product: ${product.handle}.`);
    if (!record) {
      const uploadedImages = [];
      for (const productImage of product.images) {
        uploadedImages.push({
          productImage,
          url: await uploadImage(executeOperation, product, productImage),
        });
      }
      const input = {
        title: product.title,
        handle: product.handle,
        vendor: config.vendor,
        productType: profile.productType,
        status: "ACTIVE",
        tags: product.tags,
        descriptionHtml: `<p>${escapeHtml(product.description)}</p>`,
        productOptions: [{ name: "Size", values: product.sizes.map((name) => ({ name })) }],
        variants: product.sizes.map((size) => ({
          price: String(product.sale),
          compareAtPrice: String(product.original),
          optionValues: [{ optionName: "Size", name: size }],
          inventoryPolicy: "CONTINUE",
          inventoryItem: {
            sku: `${product.title}-${size.toUpperCase()}`,
            tracked: false,
          },
        })),
        files: uploadedImages.map(({ productImage, url }) => ({
          originalSource: url,
          contentType: "IMAGE",
          alt: `${product.title} - ${product.description} - Image ${productImage.imageNumber}`,
        })),
      };
      record = (await executeOperation(operations.productSet, { input }, true)).productSet.product;
      if (!record || record.handle !== product.handle) fail(`Unexpected product result for ${product.title}.`);
    }
    if (product.sizeGuideGid) {
      const metafield = config.sizeGuideMetafield;
      await executeOperation(operations.setMetafields, {
        metafields: [{
          ownerId: record.id,
          namespace: metafield.namespace,
          key: metafield.key,
          value: product.sizeGuideGid,
        }],
      }, true);
    }
    records.set(product.title, record);
    const state = await productState(executeOperation, product, publicationId);
    if (!state.publishedOnPublication)
      await executeOperation(operations.publish, { id: record.id, input: [{ publicationId }] }, true);
    receipt.products.push({
      id: record.id,
      handle: product.handle,
      title: product.title,
      created,
      verified: false,
      moved: false,
      collections: product.collections.map((collection) => collection.id),
      tags: product.tags,
      sizeGuide: product.sizeGuideGid,
      images: product.images.map((image) => image.sourceName),
      url: `https://${store}/products/${product.handle}`,
    });
    save(receipt);
    console.log(`${created ? "Created" : "Reused"} ${index + 1}/${products.length}: ${product.title}`);
  }

  for (const collection of requiredCollections) {
    const members = products.filter((product) => product.collections.some((item) => item.id === collection.id));
    const missingIds = [];
    for (const product of members) {
      const state = await productState(executeOperation, product, publicationId);
      if (!state.collections.nodes.some((item) => item.id === collection.id))
        missingIds.push(records.get(product.title).id);
    }
    if (missingIds.length) {
      const sourceId = collectionSourceIds.get(collection.id);
      if (sourceId) {
        await executeOperation(operations.addToFlexibleCollection, {
          collectionId: collection.id,
          sourceId,
          selections: missingIds.map((productId) => ({ productId })),
        }, true);
      } else {
        await executeOperation(operations.addToLegacyCollection, {
          id: collection.id,
          productIds: missingIds,
        }, true);
      }
    }
    console.log(`Verified collection assignment: ${collection.title} (${members.length} products)`);
  }

  for (const [index, product] of products.entries()) {
    let error = null;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const state = await productState(executeOperation, product, publicationId);
      error = verifyProduct(product, state, publicationId);
      if (!error) break;
      const retriable = ["media processing", "media count mismatch", "size guide mismatch"].includes(error)
        || error.startsWith("missing collection");
      if (!retriable) break;
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
    if (error) fail(`Verification failed for ${product.title}: ${error}.`);
    receipt.products[index].verified = true;
    save(receipt);
    console.log(`Verified Shopify product ${index + 1}/${products.length}: ${product.title}`);
  }

  if (options.move) {
    const moves = products.flatMap((product) => product.images.map((image) => ({
      title: product.title,
      source: image.sourcePath,
      target: path.join(uploadedFolder, image.sourceName),
    })));
    for (const move of moves) if (fs.existsSync(move.target)) fail(`Uploaded target already exists: ${move.target}`);
    fs.mkdirSync(uploadedFolder, { recursive: true });
    for (const move of moves) {
      fs.renameSync(move.source, move.target);
      const receiptProduct = receipt.products.find((product) => product.title === move.title);
      receiptProduct.localFiles ||= [];
      receiptProduct.localFiles.push(path.relative(projectRoot, move.target));
      save(receipt);
    }
    for (const receiptProduct of receipt.products) receiptProduct.moved = true;
    save(receipt);
  }

  receipt.status = "complete";
  receipt.completedAt = new Date().toISOString();
  save(receipt);
  console.log(`Completed ${products.length} products; verified Shopify records${options.move ? " and moved all source files" : ""}.`);
} catch (error) {
  receipt.status = "failed";
  receipt.failedAt = new Date().toISOString();
  receipt.error = error instanceof Error ? error.message : String(error);
  save(receipt);
  throw error;
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
