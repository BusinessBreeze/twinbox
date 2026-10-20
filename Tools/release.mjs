#!/usr/bin/env node
// Tools/release.mjs: update pinned Nuxt base layers, release this project's version, push, open Actions.
// Keep this file identical in every repo that uses it. Node only, no dependencies, Linux.
const TOOL_VERSION = '1.0.1';

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url))); // repo root (this file lives in Tools/)
const CONFIG = 'nuxt.config.ts';
const VERSION_RE = /^(\d+)\.(\d+)\.(\d+)$/;
const TAG_RE = /^v(\d+)\.(\d+)\.(\d+)$/;

const HELP = `
release.mjs ${TOOL_VERSION}: release helper for Nuxt projects and base layers

USAGE
  node Tools/release.mjs run        start the release flow
  node Tools/release.mjs            show this help (also -h, --help)

STEPS (each step asks first; pressing Enter answers "no")
  1. Checks: working tree clean, branch is main, git remote and upstream exist.
     Any failure stops the script.
  2. Base layers (only if ${CONFIG} has github: entries in "extends"):
     looks up the newest vX.Y.Z tag on GitHub for each layer. If the project is
     unpinned or on an older tag, it offers the update (with a warning for a
     new major version), writes 'github:owner/repo#vX.Y.Z' with { install: true }
     into ${CONFIG} and commits it ("chore: bump <layer> to vX.Y.Z").
  3. Own version: offers patch / minor / major and runs "npm version"
     (updates package.json + lockfile, commits, tags vX.Y.Z).
     A missing version in package.json starts at 0.0.0.
  4. Push: git push --follow-tags (only if this run created commits).
  5. Actions: opens https://github.com/<owner>/<repo>/actions in the browser,
     only if .github/workflows/ has a workflow that runs on tag pushes
     (e.g. an image build); otherwise there is nothing to watch.

TYPICAL ORDER
  Base layer changed? Run this script in the base layer repo first (releases
  e.g. v0.2.0), then in each project repo (adopts v0.2.0, releases the project).

LIMITATIONS
  - Versions are plain X.Y.Z only: no -rc or other pre-release suffixes.
  - Only github: layers are checked. Local paths and other sources are reported
    and left unchanged. Layers without vX.Y.Z tags are reported, not updated.
  - Never creates tags in base layer repos; run the script in that repo instead.
  - Never move or reuse a tag; always release a new version.
  - Reads "extends" from ${CONFIG} only; keep each layer as a quoted string.
  - Linux only (opens the browser with xdg-open). Needs git, node, npm.
`;

// ---------- helpers ----------
const sh = (cmd, args, { inherit = false } = {}) => {
  const r = spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8', stdio: inherit ? 'inherit' : 'pipe' });
  return { ok: r.status === 0, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() || r.error?.message || '' };
};
const git = (...args) => sh('git', args);
const fail = (msg) => { console.error(`\n✖ ${msg}`); process.exit(1); };
const info = (msg) => console.log(msg);
const parseVer = (v) => (v.match(VERSION_RE) || []).slice(1).map(Number);
const cmpVer = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
const fmt = (v) => v.join('.');

// Answers are read from a line queue, so typed-ahead or piped answers are never lost; end of input (Ctrl+D) = "no".
let rl, lines;
const readAnswer = async (prompt) => {
  process.stdout.write(prompt);
  const { value, done } = await lines.next();
  if (done) process.stdout.write('\n');
  if (!process.stdin.isTTY && !done) process.stdout.write(`${value}\n`); // echo piped answers
  return done ? '' : value.trim();
};
const ask = async (q) => /^y(es)?$/i.test(await readAnswer(`${q} [y/N] `));
const choose = async (q, options) => {
  options.forEach((o, i) => info(`  ${i + 1}) ${o.label}`));
  const a = await readAnswer(`${q} [1-${options.length}, Enter = cancel] `);
  const i = Number(a) - 1;
  return Number.isInteger(i) && options[i] ? options[i] : null;
};

// ---------- step 1: checks ----------
function checks() {
  if (!git('rev-parse', '--is-inside-work-tree').ok) fail(`${ROOT} is not a git repository.`);
  const dirty = git('status', '--porcelain');
  if (dirty.out) fail(`Uncommitted changes, commit or stash them first:\n${dirty.out}`);
  const branch = git('rev-parse', '--abbrev-ref', 'HEAD').out;
  if (branch !== 'main') fail(`Releases are only made from main (current branch: ${branch}).`);
  const remote = git('remote', 'get-url', 'origin');
  if (!remote.ok) fail('No git remote "origin" configured.');
  if (!git('rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}').ok) fail('Branch main has no upstream (git push -u origin main once).');
  info(`✔ Clean working tree on main, remote ${remote.out}`);
  return remote.out;
}

// ---------- step 2: base layers ----------
// Replaces comments with spaces (outside of strings), so offsets in the result match the original text.
function blankComments(t) {
  let out = '';
  for (let i = 0; i < t.length;) {
    const c = t[i];
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < t.length && t[j] !== c && !(c !== '`' && t[j] === '\n')) j += t[j] === '\\' ? 2 : 1;
      out += t.slice(i, j + 1);
      i = j + 1;
    } else if (c === '/' && t[i + 1] === '/') {
      const j = t.indexOf('\n', i) < 0 ? t.length : t.indexOf('\n', i);
      out += ' '.repeat(j - i);
      i = j;
    } else if (c === '/' && t[i + 1] === '*') {
      const j = t.indexOf('*/', i + 2) < 0 ? t.length : t.indexOf('*/', i + 2) + 2;
      out += t.slice(i, j).replace(/[^\n]/g, ' ');
      i = j;
    } else { out += c; i++; }
  }
  return out;
}

// Finds the "extends" value in nuxt.config.ts and the string literals (layer sources) inside it.
function findLayers(text) {
  const code = blankComments(text);
  const m = /\bextends\s*:\s*/.exec(code);
  if (!m) return null;
  const start = m.index + m[0].length;
  let end = start;
  const isArray = code[start] === '[';
  if (isArray) {
    for (let depth = 0, i = start, q = null; i < code.length; i++) {
      const c = code[i];
      if (q) { if (c === q && code[i - 1] !== '\\') q = null; continue; }
      if (c === '"' || c === "'" || c === '`') q = c;
      else if (c === '[') depth++;
      else if (c === ']' && --depth === 0) { end = i; break; }
    }
  } else end = code.indexOf('\n', start);
  const items = [];
  const lit = /(['"`])([^'"`\n]*)\1/g;
  lit.lastIndex = start;
  for (let x; (x = lit.exec(code)) && x.index < end;) {
    let p = x.index - 1;
    while (/\s/.test(code[p])) p--;
    items.push({ pos: x.index, len: x[0].length, quote: x[1], value: x[2], tuple: isArray && code[p] === '[' && p !== start });
  }
  return { text, code, isArray, start, end, items };
}

function setLayerRef(cfg, item, newSource) {
  const { text, code } = cfg;
  const q = item.quote;
  const after = item.pos + item.len;
  if (!cfg.isArray) return text.slice(0, item.pos) + `[[${q}${newSource}${q}, { install: true }]]` + text.slice(after);
  if (!item.tuple) return text.slice(0, item.pos) + `[${q}${newSource}${q}, { install: true }]` + text.slice(after);
  // tuple form ['github:...', { ... }]: replace the string, make sure install: true is set
  let out = text.slice(0, item.pos) + `${q}${newSource}${q}`;
  let rest = text.slice(after);
  const m = /^\s*,\s*\{/.exec(code.slice(after));
  if (!m) return out + `, { install: true }` + rest;
  const brace = m[0].length;
  const close = code.indexOf('}', after + brace);
  if (!/\binstall\s*:/.test(code.slice(after + brace, close))) rest = rest.slice(0, brace) + ' install: true,' + rest.slice(brace);
  return out + rest;
}

function latestTag(ownerRepo) {
  const r = sh('git', ['ls-remote', '--tags', '--refs', `https://github.com/${ownerRepo}.git`]);
  if (!r.ok) return { error: r.err || 'git ls-remote failed' };
  const tags = r.out.split('\n').map((l) => l.split('refs/tags/')[1]).filter((t) => t && TAG_RE.test(t))
    .map((t) => t.match(TAG_RE).slice(1).map(Number)).sort(cmpVer);
  return { latest: tags.at(-1) };
}

async function baseLayers() {
  const path = join(ROOT, CONFIG);
  if (!existsSync(path)) return info(`– No ${CONFIG}, skipping base layers.`), 0;
  let cfg = findLayers(readFileSync(path, 'utf8'));
  if (!cfg || cfg.items.length === 0) return info('– No base layers in "extends", skipping.'), 0;
  let commits = 0;
  // walk by index: an update rewrites the file (offsets shift) but keeps the number and order of entries
  for (let k = 0; k < cfg.items.length; k++) {
    const item = cfg.items[k];
    const v = item.value;
    if (!v.startsWith('github:')) {
      info(/^[./~]/.test(v) ? `⚠ ${v}: local path in extends (dev mode), not updated.` : `– ${v}: not a github: layer, not updated.`);
      continue;
    }
    const [src, ref = ''] = v.slice('github:'.length).split('#');
    const ownerRepo = src.split('/').slice(0, 2).join('/');
    const layer = ownerRepo.split('/')[1];
    const { latest, error } = latestTag(ownerRepo);
    if (error) { info(`⚠ ${layer}: could not read tags (${error}), not updated.`); continue; }
    if (!latest) { info(`– ${layer}: no version tags, not updated.`); continue; }
    const cur = TAG_RE.test(ref) ? ref.match(TAG_RE).slice(1).map(Number) : null;
    if (cur && cmpVer(cur, latest) >= 0) { info(`✔ ${layer}: v${fmt(cur)} is up to date.`); continue; }
    info(`\n${layer}: ${cur ? `v${fmt(cur)}` : ref ? `#${ref} (not a version)` : 'unpinned'} → v${fmt(latest)} available`);
    if (cur && latest[0] > cur[0]) info(`⚠ New major version: may contain breaking changes.`);
    if (!(await ask(`Update ${layer} to v${fmt(latest)}?`))) continue;
    const newSource = `github:${src}#v${fmt(latest)}`;
    writeFileSync(path, setLayerRef(cfg, item, newSource));
    const check = findLayers(readFileSync(path, 'utf8'));
    if (!check?.items.some((i) => i.value === newSource)) fail(`Could not update ${CONFIG} reliably. Check it with: git diff ${CONFIG}`);
    const c = git('commit', '-m', `chore: bump ${layer} to v${fmt(latest)}`, '--', CONFIG);
    if (!c.ok) fail(`git commit failed:\n${c.err}`);
    info(`✔ ${CONFIG} updated and committed (${layer} v${fmt(latest)}, install: true).`);
    cfg = check; // offsets changed, continue with the updated file
    commits++;
  }
  return commits;
}

// ---------- step 3: own version ----------
async function ownVersion() {
  const pkgPath = join(ROOT, 'package.json');
  if (!existsSync(pkgPath)) return info('– No package.json, skipping own version.'), 0;
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  const raw = pkg.version;
  if (raw && !VERSION_RE.test(raw)) fail(`package.json version "${raw}" is not plain X.Y.Z (pre-release versions are not supported).`);
  const cur = raw ? parseVer(raw) : [0, 0, 0];
  const name = pkg.name || 'this project';
  if (!(await ask(`\nRelease a new version of ${name} (current ${raw ? 'v' + raw : 'none, starts at 0.0.0'})?`))) return 0;
  const pick = await choose('Which version?', [
    { kind: 'patch', label: `patch → ${fmt([cur[0], cur[1], cur[2] + 1])}  (fixes)` },
    { kind: 'minor', label: `minor → ${fmt([cur[0], cur[1] + 1, 0])}  (features)` },
    { kind: 'major', label: `major → ${fmt([cur[0] + 1, 0, 0])}  (breaking changes)` },
  ]);
  if (!pick) return info('Cancelled, no version change.'), 0;
  let commits = 0;
  if (!raw) {
    if (!sh('npm', ['pkg', 'set', 'version=0.0.0']).ok) fail('Could not set version 0.0.0 in package.json.');
    const c = git('commit', '-m', 'chore: set initial version 0.0.0', '--', 'package.json');
    if (!c.ok) fail(`git commit failed:\n${c.err}`);
    commits++;
  }
  const r = sh('npm', ['version', pick.kind], { inherit: true });
  if (!r.ok) fail('npm version failed (see the output above).');
  info(`✔ Released v${JSON.parse(readFileSync(pkgPath, 'utf8')).version} (commit + tag).`);
  return commits + 1;
}

// ---------- steps 4 + 5: push, actions ----------
// A workflow in .github/workflows/ that is triggered by pushed tags (the release builds an image or similar).
function tagWorkflow() {
  const dir = join(ROOT, '.github', 'workflows');
  if (!existsSync(dir)) return null;
  return readdirSync(dir).filter((f) => /\.ya?ml$/.test(f))
    .find((f) => /^\s*tags\s*:/m.test(readFileSync(join(dir, f), 'utf8'))) || null;
}

function actionsUrl(remote) {
  const m = remote.match(/github\.com[:/]+([^/]+)\/(.+?)(?:\.git)?\/?$/);
  return m ? `https://github.com/${m[1]}/${m[2]}/actions` : null;
}

async function pushAndActions(remote, commits) {
  if (commits === 0) return info('\nNothing new to push.');
  if (!(await ask(`\nPush ${commits} new commit(s) and tags (git push --follow-tags)?`))) return;
  const r = sh('git', ['push', '--follow-tags'], { inherit: true });
  if (!r.ok) return console.error('\n✖ git push failed (see the error above). Nothing else was changed.');
  info('✔ Pushed.');
  const workflow = tagWorkflow();
  if (!workflow) return info('– No workflow runs on tags in .github/workflows/, nothing to watch on Actions.');
  const url = actionsUrl(remote);
  if (!url) return info(`– Remote is not on GitHub (${remote}), no Actions page to open.`);
  if (await ask(`Workflow ${workflow} is building. Open ${url}?`)) {
    const o = spawnSync('xdg-open', [url], { stdio: 'ignore', detached: true });
    if (o.error || o.status !== 0) info(`Could not open the browser. URL: ${url}`);
  }
}

// ---------- main ----------
const arg = process.argv[2];
if (!arg || arg === '-h' || arg === '--help') { console.log(HELP); process.exit(0); }
if (arg !== 'run') { console.error(`Unknown argument: ${arg}`); console.log(HELP); process.exit(1); }

info(`release.mjs ${TOOL_VERSION}, project: ${ROOT}\n`);
const remote = checks();
rl = createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY });
lines = rl[Symbol.asyncIterator]();
try {
  let commits = await baseLayers();
  commits += await ownVersion();
  await pushAndActions(remote, commits);
} finally {
  rl.close();
}
