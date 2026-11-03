import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const configFilename = "shopify-product-upload.json";
const imageExtensions = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));

function fail(message) {
  throw Error(message);
}

function usage() {
  console.log(`Usage:
  node <skill-dir>/scripts/update-products.mjs --project-root <project> [options]

Options:
  --project-root <path>        Project containing ${configFilename} and assets-updated.
  --folder <path>              Update batch folder (default: assets-updated/final).
  --config <path>              Alternate project configuration file.
  --receipt <path>             Alternate live receipt JSON path.
  --plan-digest <sha256>       Digest printed by the approved dry-run; required with --apply.
  --apply                      Perform Shopify writes after an approved dry-run.
  --continue-on-error          Continue after a fully rolled-back product failure.
  --no-move                    Keep verified folders in final.
  --help                       Show this message.

Examples:
  node <skill-dir>/scripts/update-products.mjs \\
    --project-root "/path/to/store-project"

  node <skill-dir>/scripts/update-products.mjs \\
    --project-root "/path/to/store-project" \\
    --plan-digest "<reviewed-sha256>" \\
    --apply`);
}

function parseArgs(argv) {
  const options = { apply: false, move: true, continueOnError: false };
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
    if (arg === "--continue-on-error") {
      options.continueOnError = true;
      continue;
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) fail(`Missing value for ${arg}.`);
    index += 1;
    if (arg === "--project-root") options.projectRoot = value;
    else if (arg === "--folder") options.folder = value;
    else if (arg === "--config") options.configPath = value;
    else if (arg === "--receipt") options.receipt = value;
    else if (arg === "--plan-digest") options.planDigest = value.toLowerCase();
    else fail(`Unknown option: ${arg}`);
  }
  if (options.apply && !/^[a-f0-9]{64}$/.test(options.planDigest || ""))
    fail("--apply requires the 64-character --plan-digest from the approved dry-run.");
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

function resolveOptions(raw) {
  const cwd = process.cwd();
  const explicitProject = raw.projectRoot ? path.resolve(cwd, raw.projectRoot) : null;
  const explicitConfig = raw.configPath ? path.resolve(cwd, raw.configPath) : null;
  const projectRoot = explicitProject
    || (explicitConfig ? path.dirname(explicitConfig) : null)
    || findProjectRoot(cwd);
  if (!projectRoot) fail(`Could not find ${configFilename}. Pass --project-root or --config.`);
  const configPath = explicitConfig || path.join(projectRoot, configFilename);
  const folder = raw.folder
    ? path.resolve(projectRoot, raw.folder)
    : path.join(projectRoot, "assets-updated", "final");
  const receipt = raw.receipt ? path.resolve(projectRoot, raw.receipt) : null;
  return { ...raw, projectRoot, configPath, folder, receipt };
}

function loadJson(filename, label) {
  if (!fs.existsSync(filename)) fail(`${label} not found: ${filename}`);
  try {
    return JSON.parse(fs.readFileSync(filename, "utf8"));
  } catch (error) {
    fail(`Invalid ${label}: ${error.message}`);
  }
}

function objectOnly(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label} must be an object.`);
  return value;
}

function rejectUnknownKeys(value, allowed, label) {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length) fail(`${label} contains unsupported fields: ${unknown.join(", ")}.`);
}

function uniqueStrings(value, label) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item.trim()))
    fail(`${label} must be an array of non-empty strings.`);
  const normalized = value.map((item) => item.trim());
  if (new Set(normalized).size !== normalized.length) fail(`${label} contains duplicates.`);
  return normalized;
}

function naturalCompare(left, right) {
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });
}

function timestamp() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function mimeType(filename) {
  const extension = path.extname(filename).toLowerCase();
  if (extension === ".png") return "image/png";
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".webp") return "image/webp";
  fail(`Unsupported image extension: ${filename}`);
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function descriptionHtml(value) {
  return value.trim().split(/\n\s*\n/).map((paragraph) => {
    const lines = paragraph.split(/\n/).map((line) => escapeHtml(line.trim()));
    return `<p>${lines.join("<br>")}</p>`;
  }).join("");
}

function sameSet(left, right) {
  return left.length === right.length && left.every((item) => right.includes(item));
}

function loadOperations() {
  const source = fs.readFileSync(path.join(scriptDirectory, "operations.graphql"), "utf8");
  const operations = {};
  const marker = /^# -- ([a-zA-Z][a-zA-Z0-9]*) --\s*$/gm;
  const matches = [...source.matchAll(marker)];
  for (const [index, match] of matches.entries()) {
    const start = match.index + match[0].length;
    const end = matches[index + 1]?.index ?? source.length;
    operations[match[1]] = source.slice(start, end).trim();
  }
  if (!Object.keys(operations).length) fail("No GraphQL operations were loaded.");
  return operations;
}

const rawOptions = parseArgs(process.argv.slice(2));
const options = resolveOptions(rawOptions);
const config = loadJson(options.configPath, "product configuration");
if (!config.store || !config.apiVersion || !config.managedTag || !config.titlePrefix)
  fail("Configuration requires store, apiVersion, managedTag, and titlePrefix.");
if (!config.collections || typeof config.collections !== "object")
  fail("Configuration requires a collections object.");
if (!fs.existsSync(options.folder) || !fs.statSync(options.folder).isDirectory())
  fail(`Update folder not found: ${options.folder}`);

const operations = loadOperations();
const titlePrefix = String(config.titlePrefix).toUpperCase();
const productPattern = new RegExp(`^${titlePrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-\\d+$`, "i");
const updatedFolder = path.join(path.dirname(options.folder), "updated");

function parseBatch() {
  const entries = fs.readdirSync(options.folder, { withFileTypes: true })
    .filter((entry) => !entry.name.startsWith("."));
  const invalid = entries.filter((entry) => !entry.isDirectory());
  if (invalid.length) fail(`Only product folders are allowed in final: ${invalid.map((item) => item.name).join(", ")}.`);
  if (!entries.length) fail(`No product folders found in ${options.folder}.`);

  return entries.sort((a, b) => naturalCompare(a.name, b.name)).map((entry) => {
    if (!productPattern.test(entry.name)) fail(`Invalid product folder: ${entry.name}. Expected ${titlePrefix}-<number>.`);
    const title = entry.name.toUpperCase();
    const handle = title.toLowerCase();
    const folder = path.join(options.folder, entry.name);
    const destination = path.join(updatedFolder, entry.name);
    if (fs.existsSync(destination)) fail(`Updated destination already exists: ${destination}`);
    const update = objectOnly(loadJson(path.join(folder, "update.json"), `${title} update.json`), `${title} update.json`);
    rejectUnknownKeys(update, ["description", "images", "imagePlacement", "collections"], `${title} update.json`);

    let proposedDescription = null;
    if (update.description !== undefined) {
      if (typeof update.description !== "string" || !update.description.trim())
        fail(`${title} description must be a non-empty string.`);
      proposedDescription = descriptionHtml(update.description);
    }

    const images = uniqueStrings(update.images, `${title} images`);
    const placement = update.imagePlacement ?? (images.length ? "last" : null);
    if (placement !== null && placement !== "first" && placement !== "last")
      fail(`${title} imagePlacement must be first or last.`);
    if (placement && !images.length) fail(`${title} imagePlacement requires at least one image.`);

    const imageRecords = images.map((filename) => {
      if (path.basename(filename) !== filename || filename.startsWith("."))
        fail(`${title} image must be a plain filename: ${filename}`);
      if (!imageExtensions.has(path.extname(filename).toLowerCase()))
        fail(`${title} has an unsupported image: ${filename}`);
      const sourcePath = path.join(folder, filename);
      if (!fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isFile())
        fail(`${title} image not found: ${filename}`);
      const bytes = fs.readFileSync(sourcePath);
      return { filename, sourcePath, bytes: bytes.length, sha256: sha256(bytes) };
    });

    const folderItems = fs.readdirSync(folder, { withFileTypes: true })
      .filter((item) => !item.name.startsWith("."));
    const declared = new Set(["update.json", ...images]);
    const unexpected = folderItems.filter((item) => !item.isFile() || !declared.has(item.name));
    if (unexpected.length) fail(`${title} contains undeclared or unsupported entries: ${unexpected.map((item) => item.name).join(", ")}.`);

    let collectionRequest = { add: [], remove: [], syncTags: false };
    if (update.collections !== undefined) {
      const collections = objectOnly(update.collections, `${title} collections`);
      rejectUnknownKeys(collections, ["add", "remove", "syncTags"], `${title} collections`);
      const add = uniqueStrings(collections.add, `${title} collections.add`);
      const remove = uniqueStrings(collections.remove, `${title} collections.remove`);
      if (collections.syncTags !== undefined && typeof collections.syncTags !== "boolean")
        fail(`${title} collections.syncTags must be true or false.`);
      for (const key of [...add, ...remove]) {
        if (!config.collections[key]) fail(`${title} references unknown collection key: ${key}.`);
      }
      const overlap = add.filter((key) => remove.includes(key));
      if (overlap.length) fail(`${title} cannot add and remove the same collection: ${overlap.join(", ")}.`);
      collectionRequest = { add, remove, syncTags: collections.syncTags ?? false };
    }

    if (proposedDescription === null && !images.length
      && !collectionRequest.add.length && !collectionRequest.remove.length)
      fail(`${title} update.json does not request any updates.`);

    return {
      title,
      handle,
      folder,
      destination,
      proposedDescription,
      images: imageRecords,
      placement,
      collectionRequest,
    };
  });
}

const batch = parseBatch();
const store = config.store;
const apiVersion = config.apiVersion;

function operationErrors(result) {
  if (result.errors?.length) return result.errors;
  const payload = result.data || result;
  for (const value of Object.values(payload)) {
    if (value?.userErrors?.length) return value.userErrors;
    if (value?.mediaUserErrors?.length) return value.mediaUserErrors;
  }
  return null;
}

async function execute(temp, sequence, query, variables = {}, mutation = false) {
  const number = sequence.value++;
  const queryFile = path.join(temp, `operation-${number}.graphql`);
  const variableFile = path.join(temp, `variables-${number}.json`);
  fs.writeFileSync(queryFile, `${query}\n`, { mode: 0o600 });
  fs.writeFileSync(variableFile, `${JSON.stringify(variables)}\n`, { mode: 0o600 });
  const args = [
    "store", "execute", "--store", store, "--version", apiVersion,
    "--query-file", queryFile, "--variable-file", variableFile,
    "--json", "--no-input",
  ];
  if (mutation) args.push("--allow-mutations");
  try {
    const { stdout } = await run("shopify", args, {
      env: { ...process.env, SHOPIFY_CLI_AGENT_INFO: "n:codex|v:none|p:openai|m:gpt-6" },
      maxBuffer: 8 * 1024 * 1024,
    });
    const result = JSON.parse(stdout);
    const errors = operationErrors(result);
    if (errors) fail(JSON.stringify(errors));
    return result.data || result;
  } catch (error) {
    const stdout = typeof error?.stdout === "string" ? error.stdout.trim() : "";
    const stderr = typeof error?.stderr === "string" ? error.stderr.trim() : "";
    const details = [stdout, stderr].filter(Boolean).join("\n");
    if (!details) throw error;
    const message = error instanceof Error ? error.message : String(error);
    throw Error(`${message}\n${details}`, { cause: error });
  } finally {
    fs.rmSync(queryFile, { force: true });
    fs.rmSync(variableFile, { force: true });
  }
}

function productState(executeOperation, product) {
  return executeOperation(operations.productState, { handle: product.handle })
    .then((data) => data.productByIdentifier);
}

function selectionHasProduct(connection, productId) {
  return connection.nodes.some((selection) => selection.product?.id === productId);
}

async function buildPlan(executeOperation) {
  const states = new Map();
  for (const product of batch) {
    const state = await productState(executeOperation, product);
    if (!state) fail(`Existing Shopify product not found: ${product.handle}.`);
    if (!state.tags.includes(config.managedTag))
      fail(`Refusing to update unmanaged product: ${product.handle}.`);
    if (state.collections.pageInfo.hasNextPage) fail(`${product.title} has more than 100 collections.`);
    if (state.media.pageInfo.hasNextPage) fail(`${product.title} has more than 100 media items.`);
    states.set(product.title, state);
  }

  const requestedKeys = [...new Set(batch.flatMap((product) => [
    ...product.collectionRequest.add,
    ...product.collectionRequest.remove,
  ]))];
  const collectionByKey = new Map();
  if (requestedKeys.length) {
    const ids = requestedKeys.map((key) => config.collections[key].id);
    if (ids.some((id) => typeof id !== "string" || !id.startsWith("gid://shopify/Collection/")))
      fail("Every requested collection requires a Shopify collection GID in configuration.");
    const records = (await executeOperation(operations.collections, { ids: [...new Set(ids)] })).nodes;
    for (const key of requestedKeys) {
      const expected = config.collections[key];
      const record = records.find((item) => item?.id === expected.id);
      if (!record) fail(`Collection not found: ${key} (${expected.id}).`);
      if (record.title !== expected.title)
        fail(`Collection title mismatch for ${key}: expected ${expected.title}; found ${record.title}.`);
      const conditionSources = record.sources.filter((source) => source.__typename === "CollectionConditionsSource");
      let mode = "legacy";
      let source = null;
      if (record.sources.length) {
        if (record.sources.length !== 1 || conditionSources.length !== 1)
          fail(`Collection ${key} has inherited or ambiguous sources and cannot be safely overridden.`);
        source = conditionSources[0];
        if (source.app) fail(`Collection ${key} is app-managed and cannot be safely overridden.`);
        if (source.targetType !== "PRODUCTS") fail(`Collection ${key} targets variants, not whole products.`);
        if (source.inclusion.selections.pageInfo.hasNextPage || source.exclusion?.selections.pageInfo.hasNextPage)
          fail(`Collection ${key} has more than 250 manual selections; pagination is required.`);
        mode = "flexible";
      }
      collectionByKey.set(key, { key, ...expected, record, mode, source });
    }
  }

  const products = batch.map((product) => {
    const state = states.get(product.title);
    const currentCollectionIds = state.collections.nodes.map((item) => item.id);
    const requestedActions = [
      ...product.collectionRequest.add.map((key) => ({ key, action: "add" })),
      ...product.collectionRequest.remove.map((key) => ({ key, action: "remove" })),
    ];
    const actionById = new Map();
    const collectionChanges = requestedActions.map(({ key, action }) => {
      const collection = collectionByKey.get(key);
      const previous = actionById.get(collection.id);
      if (previous && previous !== action)
        fail(`${product.title} requests conflicting aliases for collection ${collection.id}.`);
      actionById.set(collection.id, action);
      const currentlyMember = currentCollectionIds.includes(collection.id);
      const source = collection.source;
      return {
        key,
        action,
        id: collection.id,
        title: collection.title,
        tag: collection.tag || null,
        mode: collection.mode,
        sourceId: source?.id || null,
        currentlyMember,
        effective: action === "add" ? !currentlyMember : currentlyMember,
        originalInclusion: source ? selectionHasProduct(source.inclusion.selections, state.id) : null,
        originalExclusion: source?.exclusion ? selectionHasProduct(source.exclusion.selections, state.id) : false,
      };
    });

    const desiredCollectionIds = new Set(currentCollectionIds);
    for (const change of collectionChanges) {
      if (change.action === "add") desiredCollectionIds.add(change.id);
      else desiredCollectionIds.delete(change.id);
    }

    const desiredTags = new Set(state.tags);
    if (product.collectionRequest.syncTags) {
      for (const change of collectionChanges.filter((item) => item.action === "add" && item.tag))
        desiredTags.add(change.tag);
      for (const change of collectionChanges.filter((item) => item.action === "remove" && item.tag)) {
        const retained = Object.values(config.collections).some((candidate) =>
          candidate.tag === change.tag && desiredCollectionIds.has(candidate.id));
        if (!retained) desiredTags.delete(change.tag);
      }
    }
    const tags = [...desiredTags].sort((a, b) => a.localeCompare(b));
    const currentMedia = state.media.nodes.map((media) => ({
      id: media.id,
      alt: media.alt,
      type: media.mediaContentType,
      status: media.status,
      url: media.image?.url || null,
    }));
    const newMedia = product.images.map((image) => ({
      id: `local:${image.filename}`,
      filename: image.filename,
      bytes: image.bytes,
      sha256: image.sha256,
    }));
    const desiredMedia = product.placement === "first"
      ? [...newMedia, ...currentMedia]
      : [...currentMedia, ...newMedia];
    const desiredDescription = product.proposedDescription ?? state.descriptionHtml;
    const hasEffectiveChange = desiredDescription !== state.descriptionHtml
      || product.images.length > 0
      || collectionChanges.some((item) => item.effective)
      || !sameSet(tags, state.tags);
    if (!hasEffectiveChange) fail(`${product.title} has no effective Shopify changes.`);

    return {
      ...product,
      state,
      desiredDescription,
      desiredTags: tags,
      currentMedia,
      desiredMedia,
      collectionChanges,
      currentCollectionIds,
      desiredCollectionIds: [...desiredCollectionIds].sort(),
    };
  });

  const digestInput = {
    store,
    apiVersion,
    sourceFolder: path.relative(options.projectRoot, options.folder),
    moveAfterVerification: options.move,
    continueOnError: options.continueOnError,
    products: products.map((product) => ({
      title: product.title,
      handle: product.handle,
      productId: product.state.id,
      currentDescription: product.state.descriptionHtml,
      desiredDescription: product.desiredDescription,
      currentTags: [...product.state.tags].sort(),
      desiredTags: product.desiredTags,
      currentCollections: [...product.currentCollectionIds].sort(),
      desiredCollections: product.desiredCollectionIds,
      currentMedia: product.currentMedia.map((item) => item.id),
      desiredMedia: product.desiredMedia.map((item) => item.id),
      images: product.images.map(({ filename, bytes, sha256: hash }) => ({ filename, bytes, sha256: hash })),
      collectionChanges: product.collectionChanges.map(({ key, action, id, mode, sourceId, currentlyMember, originalInclusion, originalExclusion }) =>
        ({ key, action, id, mode, sourceId, currentlyMember, originalInclusion, originalExclusion })),
    })),
  };
  return { products, planDigest: sha256(JSON.stringify(digestInput)) };
}

function publicPlan(plan) {
  return {
    mode: options.apply ? "apply-preflight" : "dry-run",
    store,
    apiVersion,
    sourceFolder: options.folder,
    updatedFolder,
    moveAfterVerification: options.move,
    continueOnError: options.continueOnError,
    planDigest: plan.planDigest,
    products: plan.products.map((product) => ({
      title: product.title,
      handle: product.handle,
      productId: product.state.id,
      description: {
        changed: product.desiredDescription !== product.state.descriptionHtml,
        current: product.state.descriptionHtml,
        proposed: product.desiredDescription,
      },
      media: {
        placement: product.placement,
        newFiles: product.images.map((image) => image.filename),
        currentOrder: product.currentMedia.map((item) => ({ id: item.id, url: item.url })),
        proposedOrder: product.desiredMedia.map((item) => item.filename || item.id),
      },
      collections: product.collectionChanges.map(({ key, action, title, mode, currentlyMember, effective }) =>
        ({ key, action, title, mode, currentlyMember, effective })),
      tags: {
        syncRequested: product.collectionRequest.syncTags,
        current: product.state.tags,
        proposed: product.desiredTags,
      },
      moveTo: options.move ? product.destination : null,
    })),
    receiptDirectory: path.join(options.projectRoot, "docs", "product-update-receipts"),
    effect: options.apply
      ? "Preflight only until the reviewed digest matches; mutations then run sequentially."
      : "Read-only Shopify queries only. Re-run with --apply and this planDigest after explicit confirmation.",
  };
}

function saveReceipt(receiptFile, receipt) {
  fs.mkdirSync(path.dirname(receiptFile), { recursive: true });
  fs.writeFileSync(receiptFile, `${JSON.stringify(receipt, null, 2)}\n`);
}

async function waitForJob(executeOperation, job, label) {
  if (!job || job.done) return;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const current = (await executeOperation(operations.job, { id: job.id })).job;
    if (!current) fail(`${label} job disappeared: ${job.id}.`);
    if (current.done) return;
  }
  fail(`${label} job did not complete within 60 seconds.`);
}

async function uploadFile(executeOperation, product, image) {
  const bytes = fs.readFileSync(image.sourcePath);
  if (sha256(bytes) !== image.sha256) fail(`${product.title} image changed after preflight: ${image.filename}.`);
  const staged = await executeOperation(operations.stagedUpload, {
    input: [{
      filename: `${product.handle}-${image.filename}`,
      mimeType: mimeType(image.filename),
      resource: "IMAGE",
      httpMethod: "POST",
      fileSize: String(bytes.length),
    }],
  }, true);
  const target = staged.stagedUploadsCreate.stagedTargets[0];
  if (!target) fail(`No staged upload target for ${product.title}/${image.filename}.`);
  const form = new FormData();
  for (const parameter of target.parameters) form.append(parameter.name, parameter.value);
  form.append("file", new Blob([bytes], { type: mimeType(image.filename) }), image.filename);
  const response = await fetch(target.url, { method: "POST", body: form });
  if (!response.ok) fail(`Image upload failed (${response.status}) for ${product.title}/${image.filename}.`);
  const created = await executeOperation(operations.fileCreate, {
    files: [{
      originalSource: target.resourceUrl,
      contentType: "IMAGE",
      alt: `${product.title} - ${image.filename}`,
    }],
  }, true);
  const file = created.fileCreate.files[0];
  if (!file?.id) fail(`Shopify file creation returned no ID for ${product.title}/${image.filename}.`);
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const record = (await executeOperation(operations.files, { ids: [file.id] })).nodes[0];
    if (record?.fileStatus === "READY") return { id: file.id, filename: image.filename };
    if (record?.fileStatus === "FAILED") fail(`Shopify file processing failed for ${product.title}/${image.filename}.`);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  fail(`Shopify file processing timed out for ${product.title}/${image.filename}.`);
}

function mediaMoves(current, desired) {
  const working = [...current];
  const moves = [];
  for (let position = 0; position < desired.length; position += 1) {
    if (working[position] === desired[position]) continue;
    const from = working.indexOf(desired[position]);
    if (from < 0) fail(`Cannot reorder missing media ${desired[position]}.`);
    const [id] = working.splice(from, 1);
    working.splice(position, 0, id);
    moves.push({ id, newPosition: String(position) });
  }
  return moves;
}

async function reorder(executeOperation, productId, current, desired, label) {
  const moves = mediaMoves(current, desired);
  if (!moves.length) return;
  const result = await executeOperation(operations.reorderMedia, { id: productId, moves }, true);
  await waitForJob(executeOperation, result.productReorderMedia.job, label);
}

async function setFlexibleOverride(executeOperation, productId, change, inclusion, exclusion) {
  const inclusionSelection = { productId };
  const exclusionSelection = { productId };
  const result = await executeOperation(operations.flexibleSelection, {
    collectionId: change.id,
    sourceId: change.sourceId,
    inclusionsToAdd: inclusion ? [inclusionSelection] : [],
    inclusionsToRemove: inclusion ? [] : [inclusionSelection],
    exclusionsToAdd: exclusion ? [exclusionSelection] : [],
    exclusionsToRemove: exclusion ? [] : [exclusionSelection],
  }, true);
  await waitForJob(executeOperation, result.collectionUpdate.job, `Collection ${change.key}`);
}

async function setMembership(executeOperation, productId, change, desired) {
  if (change.mode === "flexible") {
    await setFlexibleOverride(executeOperation, productId, change, desired, !desired);
    return;
  }
  if (desired) {
    await executeOperation(operations.collectionAdd, { id: change.id, productIds: [productId] }, true);
  } else {
    const result = await executeOperation(operations.collectionRemove, { id: change.id, productIds: [productId] }, true);
    await waitForJob(executeOperation, result.collectionRemoveProducts.job, `Collection ${change.key}`);
  }
}

async function assertFreshCollectionOverrides(executeOperation, product) {
  const flexible = product.collectionChanges.filter((item) => item.mode === "flexible");
  if (!flexible.length) return;
  const records = (await executeOperation(operations.collections, {
    ids: [...new Set(flexible.map((item) => item.id))],
  })).nodes;
  for (const change of flexible) {
    const record = records.find((item) => item?.id === change.id);
    const source = record?.sources.find((item) => item.id === change.sourceId);
    if (!source || source.__typename !== "CollectionConditionsSource")
      fail(`${product.title} collection source changed for ${change.key}.`);
    const inclusion = selectionHasProduct(source.inclusion.selections, product.state.id);
    const exclusion = source.exclusion ? selectionHasProduct(source.exclusion.selections, product.state.id) : false;
    if (inclusion !== change.originalInclusion || exclusion !== change.originalExclusion)
      fail(`${product.title} collection overrides changed after preflight for ${change.key}.`);
  }
}

async function verifyProduct(executeOperation, product, desiredMediaIds) {
  let lastError = "verification not started";
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const state = await productState(executeOperation, product);
    if (!state) lastError = "product missing";
    else if (state.descriptionHtml !== product.desiredDescription) lastError = "description mismatch";
    else if (!sameSet([...state.tags].sort(), product.desiredTags)) lastError = "tags mismatch";
    else {
      const memberships = state.collections.nodes.map((item) => item.id);
      const wrongCollection = product.collectionChanges.find((change) =>
        change.action === "add" ? !memberships.includes(change.id) : memberships.includes(change.id));
      if (wrongCollection) lastError = `${wrongCollection.action} collection ${wrongCollection.key} not settled`;
      else if (state.media.nodes.some((item) => item.status === "FAILED")) lastError = "media processing failed";
      else if (state.media.nodes.some((item) => item.status !== "READY")) lastError = "media processing";
      else if (JSON.stringify(state.media.nodes.map((item) => item.id)) !== JSON.stringify(desiredMediaIds))
        lastError = "media order mismatch";
      else return state;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  fail(`${product.title} verification failed: ${lastError}.`);
}

async function rollbackProduct(executeOperation, product, createdFileIds) {
  const errors = [];
  try {
    await executeOperation(operations.productUpdate, {
      product: { id: product.state.id, descriptionHtml: product.state.descriptionHtml, tags: product.state.tags },
    }, true);
  } catch (error) {
    errors.push(`fields: ${error.message}`);
  }
  for (const change of product.collectionChanges.filter((item) => item.effective)) {
    try {
      if (change.mode === "flexible") {
        await setFlexibleOverride(
          executeOperation,
          product.state.id,
          change,
          change.originalInclusion,
          change.originalExclusion,
        );
      } else {
        await setMembership(executeOperation, product.state.id, change, change.currentlyMember);
      }
    } catch (error) {
      errors.push(`collection ${change.key}: ${error.message}`);
    }
  }
  if (createdFileIds.length) {
    try {
      await executeOperation(operations.fileDelete, { fileIds: createdFileIds }, true);
    } catch (error) {
      errors.push(`files: ${error.message}`);
    }
  }
  try {
    let restoredMedia = false;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const state = await productState(executeOperation, product);
      const remaining = state.media.nodes.map((item) => item.id);
      if (remaining.length === product.currentMedia.length
        && product.currentMedia.every((item) => remaining.includes(item.id))) {
        await reorder(
          executeOperation,
          product.state.id,
          remaining,
          product.currentMedia.map((item) => item.id),
          `${product.title} rollback media`,
        );
        restoredMedia = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    if (!restoredMedia) fail("new media was not removed within 30 seconds");
  } catch (error) {
    errors.push(`media order: ${error.message}`);
  }
  try {
    let lastError = "rollback verification not started";
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const state = await productState(executeOperation, product);
      if (state.descriptionHtml !== product.state.descriptionHtml) lastError = "description mismatch";
      else if (!sameSet(state.tags, product.state.tags)) lastError = "tags mismatch";
      else if (JSON.stringify(state.media.nodes.map((item) => item.id))
        !== JSON.stringify(product.currentMedia.map((item) => item.id))) lastError = "media mismatch";
      else {
        const memberships = state.collections.nodes.map((item) => item.id);
        const wrong = product.collectionChanges.find((change) => change.effective
          && memberships.includes(change.id) !== change.currentlyMember);
        if (wrong) lastError = `collection ${wrong.key} mismatch`;
        else {
          lastError = null;
          break;
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    if (lastError) fail(lastError);
  } catch (error) {
    errors.push(`verification: ${error.message}`);
  }
  return { complete: errors.length === 0, errors };
}

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "shopify-product-update-"));
const sequence = { value: 1 };
const executeOperation = (query, variables = {}, mutation = false) =>
  execute(temp, sequence, query, variables, mutation);

try {
  const plan = await buildPlan(executeOperation);
  console.log(JSON.stringify(publicPlan(plan), null, 2));
  if (!options.apply) process.exitCode = 0;
  else {
    if (plan.planDigest !== options.planDigest)
      fail(`Plan digest changed. Expected ${options.planDigest}; current ${plan.planDigest}. Run a new dry-run and confirm it.`);

    const receiptFile = options.receipt || path.join(
      options.projectRoot,
      "docs",
      "product-update-receipts",
      `product-update-${timestamp()}.json`,
    );
    if (fs.existsSync(receiptFile)) fail(`Receipt already exists: ${receiptFile}`);
    const receipt = {
      store,
      apiVersion,
      planDigest: plan.planDigest,
      sourceFolder: path.relative(options.projectRoot, options.folder),
      startedAt: new Date().toISOString(),
      status: "running",
      continueOnError: options.continueOnError,
      products: [],
    };
    saveReceipt(receiptFile, receipt);
    let stopError = null;

    for (const [index, product] of plan.products.entries()) {
      const record = {
        title: product.title,
        handle: product.handle,
        productId: product.state.id,
        status: "running",
        original: {
          descriptionHtml: product.state.descriptionHtml,
          tags: product.state.tags,
          mediaIds: product.currentMedia.map((item) => item.id),
          collectionChanges: product.collectionChanges,
        },
        createdFiles: [],
        moved: false,
      };
      receipt.products.push(record);
      saveReceipt(receiptFile, receipt);
      try {
        const fresh = await productState(executeOperation, product);
        if (!fresh || fresh.id !== product.state.id) fail(`${product.title} identity changed after preflight.`);
        if (fresh.descriptionHtml !== product.state.descriptionHtml
          || !sameSet(fresh.tags, product.state.tags)
          || !sameSet(
            fresh.collections.nodes.map((item) => item.id),
            product.currentCollectionIds,
          )
          || JSON.stringify(fresh.media.nodes.map((item) => item.id)) !== JSON.stringify(product.currentMedia.map((item) => item.id)))
          fail(`${product.title} changed after preflight; run a new dry-run.`);
        await assertFreshCollectionOverrides(executeOperation, product);

        for (const image of product.images) {
          const created = await uploadFile(executeOperation, product, image);
          record.createdFiles.push(created);
          saveReceipt(receiptFile, receipt);
        }
        await executeOperation(operations.productUpdate, {
          product: { id: product.state.id, descriptionHtml: product.desiredDescription, tags: product.desiredTags },
        }, true);
        for (const file of record.createdFiles) {
          await executeOperation(operations.fileUpdate, {
            files: [{ id: file.id, referencesToAdd: [product.state.id] }],
          }, true);
        }

        const createdIds = record.createdFiles.map((item) => item.id);
        const desiredMediaIds = product.placement === "first"
          ? [...createdIds, ...product.currentMedia.map((item) => item.id)]
          : [...product.currentMedia.map((item) => item.id), ...createdIds];
        let associated = null;
        for (let attempt = 0; attempt < 60; attempt += 1) {
          associated = await productState(executeOperation, product);
          const ids = associated.media.nodes.map((item) => item.id);
          if (createdIds.every((id) => ids.includes(id))) break;
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
        const associatedIds = associated.media.nodes.map((item) => item.id);
        if (!createdIds.every((id) => associatedIds.includes(id)))
          fail(`${product.title} new media did not associate within 60 seconds.`);
        await reorder(
          executeOperation,
          product.state.id,
          associatedIds,
          desiredMediaIds,
          `${product.title} media reorder`,
        );

        for (const change of product.collectionChanges.filter((item) => item.effective))
          await setMembership(executeOperation, product.state.id, change, change.action === "add");

        const verified = await verifyProduct(executeOperation, product, desiredMediaIds);
        record.verified = {
          descriptionHtml: verified.descriptionHtml,
          tags: verified.tags,
          mediaIds: verified.media.nodes.map((item) => item.id),
          collectionIds: verified.collections.nodes.map((item) => item.id),
        };
        record.status = "verified";
        if (options.move) {
          if (fs.existsSync(product.destination)) fail(`Updated destination appeared during execution: ${product.destination}`);
          fs.mkdirSync(updatedFolder, { recursive: true });
          fs.renameSync(product.folder, product.destination);
          record.moved = true;
          record.localFolder = path.relative(options.projectRoot, product.destination);
        }
        record.status = "complete";
        record.completedAt = new Date().toISOString();
        saveReceipt(receiptFile, receipt);
        console.log(`Updated ${index + 1}/${plan.products.length}: ${product.title}`);
      } catch (error) {
        record.status = "failed";
        record.error = error instanceof Error ? error.message : String(error);
        record.failedAt = new Date().toISOString();
        let localRestoreError = null;
        if (record.moved) {
          try {
            if (fs.existsSync(product.folder)) fail(`Cannot restore local folder because it already exists: ${product.folder}`);
            fs.renameSync(product.destination, product.folder);
            record.moved = false;
            delete record.localFolder;
          } catch (moveError) {
            localRestoreError = moveError instanceof Error ? moveError.message : String(moveError);
          }
        }
        const rollback = await rollbackProduct(
          executeOperation,
          product,
          record.createdFiles.map((item) => item.id),
        );
        if (localRestoreError) {
          rollback.complete = false;
          rollback.errors.push(`local folder: ${localRestoreError}`);
        }
        record.rollback = rollback;
        saveReceipt(receiptFile, receipt);
        if (!rollback.complete || !options.continueOnError) {
          stopError = Error(`${product.title} failed: ${record.error}. Rollback ${rollback.complete ? "completed" : "was incomplete"}.`);
          break;
        }
      }
    }

    const complete = receipt.products.filter((item) => item.status === "complete").length;
    const failed = receipt.products.filter((item) => item.status === "failed").length;
    receipt.status = stopError ? (complete ? "partial" : "failed") : (failed ? "complete_with_errors" : "complete");
    receipt.completedAt = new Date().toISOString();
    receipt.summary = { complete, failed, unprocessed: plan.products.length - receipt.products.length };
    saveReceipt(receiptFile, receipt);
    console.log(`Receipt: ${receiptFile}`);
    if (stopError) throw stopError;
  }
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
