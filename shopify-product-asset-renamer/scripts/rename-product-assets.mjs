#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.avif']);
const STANDARD_TITLE_RE = /\(TITLE\\([^()\\]+)-(\d+)\)/;
const SIZE_TOKEN_RE = /^(?:xxs|xs|s|m|l|xl|xxl|xxxl)$/i;

function fail(message) {
  console.error(`Error: ${message}`);
  process.exit(1);
}

function usage() {
  console.log(`Usage:
  rename-product-assets.mjs <folder> [options]

Options:
  --apply                 Rename files. Without this flag, print a dry-run only.
  --assets-root <path>    Root scanned for the highest existing title number.
  --prefix <text>         Title prefix (default: BBS).
  --start <number>        First title number, overriding automatic continuation.
  --discounts <list>      Comma-separated percentages (default: 20,30,40).
  --description <text>    Description override for files that do not encode one.
  --sizes <text>          Size override for files that do not encode sizes.
  --seed <text>           Reuse a dry-run seed so discounts remain identical.
  --help                  Show this message.

Examples:
  node rename-product-assets.mjs 'assets-to-upload/Pret/Casual/final'
  node rename-product-assets.mjs 'assets-to-upload/Unstiched/2 Piece/final' --seed abc123 --apply`);
}

function parseArgs(argv) {
  const options = {
    apply: false,
    prefix: 'BBS',
    discounts: [20, 30, 40],
  };
  const positional = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      usage();
      process.exit(0);
    }
    if (arg === '--apply') {
      options.apply = true;
      continue;
    }
    if (!arg.startsWith('--')) {
      positional.push(arg);
      continue;
    }

    const key = arg.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) fail(`Missing value for ${arg}`);
    index += 1;

    if (key === 'assets-root') options.assetsRoot = value;
    else if (key === 'prefix') options.prefix = value;
    else if (key === 'start') options.start = Number(value);
    else if (key === 'discounts') options.discounts = value.split(',').map(Number);
    else if (key === 'description') options.description = value;
    else if (key === 'sizes') options.sizes = value;
    else if (key === 'seed') options.seed = value;
    else fail(`Unknown option: ${arg}`);
  }

  if (positional.length !== 1) fail('Provide exactly one target folder.');
  options.folder = path.resolve(positional[0]);

  if (!options.prefix || /[\\/()]/.test(options.prefix)) fail('Prefix contains unsupported characters.');
  if (options.start !== undefined && (!Number.isInteger(options.start) || options.start < 1)) {
    fail('--start must be a positive integer.');
  }
  if (!options.discounts.length || options.discounts.some((value) => !Number.isFinite(value) || value <= 0 || value >= 100)) {
    fail('--discounts must contain percentages greater than 0 and less than 100.');
  }

  return options;
}

function validateMetadata(label, value) {
  if (!value || /[\\/()]/.test(value)) fail(`${label} is empty or contains unsupported characters: ${value ?? ''}`);
  return value.trim();
}

function findAssetsRoot(folder) {
  let current = folder;
  while (true) {
    if (path.basename(current) === 'assets-to-upload') return current;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function walkFiles(root) {
  const files = [];
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(absolute);
      else if (entry.isFile()) files.push(absolute);
    }
  }
  return files;
}

function highestTitle(root, prefix) {
  let highest = 0;
  for (const filename of walkFiles(root)) {
    const match = path.basename(filename).match(STANDARD_TITLE_RE);
    if (match && match[1] === prefix) highest = Math.max(highest, Number(match[2]));
  }
  return highest;
}

function parseSource(filename, options) {
  const extension = path.extname(filename);
  if (!IMAGE_EXTENSIONS.has(extension.toLowerCase())) return null;

  const basename = path.basename(filename, extension);
  if (STANDARD_TITLE_RE.test(basename)) return { standardized: true };

  const main = basename.match(/^(\d+)-(\d+)(?:-(.*))?$/);
  if (!main) fail(`Cannot parse source filename: ${filename}`);

  const sourceIndex = Number(main[1]);
  const sale = Number(main[2]);
  let remainder = main[3] ?? '';
  let description = options.description;

  const descriptionMatch = remainder.match(/(?:^|-)\(([^()]+)\)$/);
  if (descriptionMatch) {
    description = descriptionMatch[1].trim();
    remainder = remainder.slice(0, descriptionMatch.index).replace(/-$/, '');
  }

  let sizes = options.sizes;
  if (remainder) {
    const tokens = remainder.split('-').filter(Boolean);
    if (!tokens.length || tokens.some((token) => !SIZE_TOKEN_RE.test(token))) {
      fail(`Cannot parse sizes in ${filename}. Use --sizes if the value is known.`);
    }
    sizes = tokens.map((token) => token.toUpperCase()).join('-');
  }

  if (!sizes && /(?:^|[\\/])unstiched(?:[\\/]|$)/i.test(options.folder)) sizes = 'Unstitched';
  if (!sizes && /(?:^|[\\/])unstitched(?:[\\/]|$)/i.test(options.folder)) sizes = 'Unstitched';
  if (!description) fail(`Missing description for ${filename}. Use --description with a supported value.`);
  if (!sizes) fail(`Missing sizes for ${filename}. Use --sizes with a supported value.`);

  return {
    sourceIndex,
    sale,
    sizes: validateMetadata('Sizes', sizes),
    description: validateMetadata('Description', description),
    extension,
  };
}

function chooseDiscount(seed, sourceName, discounts) {
  const digest = crypto.createHash('sha256').update(`${seed}\0${sourceName}`).digest();
  return discounts[digest.readUInt32BE(0) % discounts.length];
}

function targetName(item, titleNumber, prefix, discount) {
  const original = Math.round(item.sale / (1 - discount / 100));
  const name = `(TITLE\\${prefix}-${titleNumber})-(SALE PRICE\\${item.sale})-(SIZES\\${item.sizes})-(DESCRIPTION\\${item.description})-(DISCOUNT PERCENTAGE\\${discount})-(ORIGINAL PRICE\\${original})${item.extension}`;
  return { name, original };
}

function applyPlan(plan) {
  for (const item of plan) {
    if (fs.existsSync(item.target)) fail(`Target already exists: ${item.target}`);
  }

  const moved = [];
  try {
    for (const item of plan) {
      fs.renameSync(item.source, item.target);
      moved.push(item);
    }
  } catch (error) {
    for (const item of moved.reverse()) {
      if (fs.existsSync(item.target) && !fs.existsSync(item.source)) fs.renameSync(item.target, item.source);
    }
    throw error;
  }

  for (const item of plan) {
    if (!fs.existsSync(item.target) || fs.existsSync(item.source)) fail(`Post-rename verification failed for ${item.target}`);
  }
}

const options = parseArgs(process.argv.slice(2));
if (!fs.existsSync(options.folder) || !fs.statSync(options.folder).isDirectory()) fail(`Folder not found: ${options.folder}`);

const assetsRoot = path.resolve(options.assetsRoot ?? findAssetsRoot(options.folder) ?? 'assets-to-upload');
if (!fs.existsSync(assetsRoot) || !fs.statSync(assetsRoot).isDirectory()) {
  fail(`Assets root not found: ${assetsRoot}. Use --assets-root.`);
}

const entries = fs.readdirSync(options.folder, { withFileTypes: true })
  .filter((entry) => entry.isFile() && !entry.name.startsWith('.'))
  .map((entry) => ({ name: entry.name, parsed: parseSource(entry.name, options) }))
  .filter((entry) => entry.parsed && !entry.parsed.standardized)
  .sort((left, right) => left.parsed.sourceIndex - right.parsed.sourceIndex || left.name.localeCompare(right.name));

if (!entries.length) {
  console.log('No unstandardized product images found. Nothing to rename.');
  process.exit(0);
}

const duplicateIndexes = entries.filter((entry, index) => index > 0 && entry.parsed.sourceIndex === entries[index - 1].parsed.sourceIndex);
if (duplicateIndexes.length) fail(`Duplicate source index: ${duplicateIndexes[0].parsed.sourceIndex}`);

const seed = options.seed ?? crypto.randomBytes(12).toString('hex');
const firstTitle = options.start ?? highestTitle(assetsRoot, options.prefix) + 1;
const plan = entries.map((entry, index) => {
  const discount = chooseDiscount(seed, entry.name, options.discounts);
  const titleNumber = firstTitle + index;
  const target = targetName(entry.parsed, titleNumber, options.prefix, discount);
  return {
    source: path.join(options.folder, entry.name),
    target: path.join(options.folder, target.name),
    sourceName: entry.name,
    targetName: target.name,
    titleNumber,
    sale: entry.parsed.sale,
    discount,
    original: target.original,
  };
});

const targetNames = new Set();
for (const item of plan) {
  if (targetNames.has(item.targetName)) fail(`Duplicate target filename: ${item.targetName}`);
  targetNames.add(item.targetName);
  if (fs.existsSync(item.target)) fail(`Target already exists: ${item.target}`);
}

console.log(`Mode: ${options.apply ? 'apply' : 'dry-run'}`);
console.log(`Folder: ${options.folder}`);
console.log(`Assets root: ${assetsRoot}`);
console.log(`Seed: ${seed}`);
console.log(`Title range: ${options.prefix}-${plan[0].titleNumber} through ${options.prefix}-${plan.at(-1).titleNumber}`);
console.log('');
for (const item of plan) {
  console.log(`${item.sourceName}`);
  console.log(`  -> ${item.targetName}`);
}

if (!options.apply) {
  console.log('');
  console.log(`Dry-run only. Re-run with --seed '${seed}' --apply after reviewing this mapping.`);
  process.exit(0);
}

try {
  applyPlan(plan);
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}

console.log('');
console.log(`Renamed and verified ${plan.length} file${plan.length === 1 ? '' : 's'}.`);
