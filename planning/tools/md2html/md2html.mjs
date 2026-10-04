#!/usr/bin/env node
// md2html: convert the planning Markdown files into standalone, styled HTML pages.
//
// Usage:
//   node planning/tools/md2html/md2html.mjs <file-or-dir> [more...] [--out <dir>] [--root <dir>] [--open]
//
//   <file-or-dir>   one or more .md files, or directories (searched recursively for *.md)
//   --out <dir>     write HTML into <dir>, mirroring the tree under --root, instead of next to the .md
//   --root <dir>    the folder the mirrored tree is relative to (default: the current directory)
//   --open          open the generated page in the default browser (single file only)
//
// Relative links to files rendered in the same run point at their .html; other relative links are
// rewritten so they still reach the source file from the output folder.
//
// Examples (from the repo root):
//   npm run plan:html
//   node planning/tools/md2html/md2html.mjs planning/plans/P10-questionnaire.md --open

import { readFileSync, writeFileSync, mkdirSync, statSync, readdirSync } from 'node:fs';
import { resolve, dirname, basename, extname, join, relative, sep } from 'node:path';
import { execFile } from 'node:child_process';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Markdown, { defaultUrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';

// ---------- CLI parsing ----------
function usage(code) {
  const lines = readFileSync(new URL(import.meta.url), 'utf8')
    .split('\n')
    .slice(1, 18);
  console.log(lines.map((l) => l.replace(/^\/\/ ?/, '')).join('\n'));
  process.exit(code);
}

const argv = process.argv.slice(2);
if (argv.length === 0 || argv.includes('--help') || argv.includes('-h')) usage(0);
let outDir = null;
let root = process.cwd();
let openAfter = false;
const inputs = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--out' || a === '--root') {
    const v = argv[++i];
    if (!v || v.startsWith('--')) {
      console.error(`${a} needs a directory.\n`);
      usage(1);
    }
    if (a === '--out') outDir = resolve(v);
    else root = resolve(v);
    continue;
  }
  if (a === '--open') {
    openAfter = true;
    continue;
  }
  inputs.push(resolve(a));
}

// ---------- collect .md files ----------
function collect(p) {
  const st = statSync(p);
  if (st.isDirectory()) {
    return readdirSync(p)
      .filter((n) => n !== 'node_modules' && n !== 'html' && !n.startsWith('.'))
      .flatMap((n) => collect(join(p, n)));
  }
  return extname(p).toLowerCase() === '.md' ? [p] : [];
}
const files = inputs.flatMap(collect);
if (files.length === 0) {
  console.error('No .md files found.');
  process.exit(1);
}

function outPathFor(file) {
  if (!outDir) return file.replace(/\.md$/i, '.html');
  const rel = relative(root, file);
  return join(outDir, rel.startsWith('..') ? basename(file) : rel).replace(/\.md$/i, '.html');
}
// Every output path is known before rendering, so links can target pages from the same run.
const outPaths = new Map(files.map((f) => [f, outPathFor(f)]));

// ---------- links ----------
// defaultUrlTransform drops unsafe schemes (javascript:, data:, ...). Relative paths are then
// resolved against the source file and re-expressed relative to the output page.
function makeUrlTransform(file, outPath) {
  return (url, key) => {
    const safe = defaultUrlTransform(url);
    if (!safe || /^([a-z][a-z0-9+.-]*:|[#/])/i.test(safe)) return safe;
    const cut = safe.search(/[?#]/);
    const pathPart = cut === -1 ? safe : safe.slice(0, cut);
    const suffix = cut === -1 ? '' : safe.slice(cut);
    if (!pathPart) return safe;
    let decoded;
    try {
      decoded = decodeURIComponent(pathPart);
    } catch {
      return safe;
    }
    const target = resolve(dirname(file), decoded);
    const dest = key === 'href' ? (outPaths.get(target) ?? target) : target;
    const rel = relative(dirname(outPath), dest).split(sep).join('/') || basename(dest);
    return encodeURI(rel) + suffix;
  };
}

// ---------- headings ----------
function hastText(node) {
  if (node.type === 'text') return node.value;
  return (node.children ?? []).map(hastText).join('');
}

function slugBase(text) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .trim()
    .replace(/\s+/g, '-');
}

// The TOC and the page title come from the headings the renderer actually emitted, so anchors
// always match ids and fenced code never contributes entries.
function makeComponents(headings) {
  const slugCounts = new Map();
  const heading =
    (depth) =>
    ({ node, children }) => {
      const text = hastText(node).trim();
      const base = slugBase(text) || 'section';
      const n = slugCounts.get(base) ?? 0;
      slugCounts.set(base, n + 1);
      const id = n === 0 ? base : `${base}-${n}`;
      headings.push({ depth, id, text });
      return createElement(
        `h${depth}`,
        { id },
        createElement('a', { className: 'anchor', href: `#${id}` }, '#'),
        children,
      );
    };
  const components = {
    table: ({ node: _node, ...props }) =>
      createElement('div', { className: 'table-wrap' }, createElement('table', props)),
  };
  for (const d of [1, 2, 3, 4, 5, 6]) components[`h${d}`] = heading(d);
  return components;
}

function buildToc(headings) {
  const items = headings.filter((h) => h.depth === 2 || h.depth === 3);
  if (items.length < 3) return '';
  const li = items
    .map(
      ({ depth, id, text }) =>
        `<li class="d${depth}"><a href="#${escapeHtml(id)}">${escapeHtml(text)}</a></li>`,
    )
    .join('\n');
  return `<nav class="toc"><div class="toc-title">Contents</div><ul>\n${li}\n</ul></nav>`;
}

// ---------- page template ----------
const CSS = `
:root{--bg:#fafafa;--fg:#1f2328;--muted:#656d76;--border:#d0d7de;--code-bg:#eff1f3;--accent:#0969da;--row:#f6f8fa;--th:#eaeef2;--answer:#fff8c5}
@media (prefers-color-scheme:dark){:root{--bg:#0d1117;--fg:#e6edf3;--muted:#8b949e;--border:#30363d;--code-bg:#161b22;--accent:#58a6ff;--row:#161b22;--th:#1f2630;--answer:#3b2f00}}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.6 -apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
.layout{display:grid;grid-template-columns:minmax(0,1fr)}
@media (min-width:1100px){.layout.has-toc{grid-template-columns:270px minmax(0,1fr)}}
main{max-width:1000px;padding:32px 16px 96px;margin:0 auto;width:100%}
.toc{position:sticky;top:0;align-self:start;max-height:100vh;overflow:auto;padding:24px 16px;border-right:1px solid var(--border);font-size:13px;display:none}
@media (min-width:1100px){.has-toc .toc{display:block}}
.toc-title{font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin-bottom:8px}
.toc ul{list-style:none;margin:0;padding:0}.toc li{margin:2px 0}.toc li.d3{padding-left:14px}
.toc a{color:var(--fg);text-decoration:none}.toc a:hover{color:var(--accent)}
h1,h2,h3,h4{line-height:1.25;margin:1.6em 0 .6em;position:relative}
h1{font-size:2em;border-bottom:1px solid var(--border);padding-bottom:.3em;margin-top:0}
h2{font-size:1.5em;border-bottom:1px solid var(--border);padding-bottom:.3em}
h3{font-size:1.2em}h4{font-size:1em;color:var(--muted)}
.anchor{position:absolute;left:-1.1em;color:var(--muted);text-decoration:none;opacity:0;font-weight:400}
h1:hover .anchor,h2:hover .anchor,h3:hover .anchor,h4:hover .anchor{opacity:1}
a{color:var(--accent)}
p{margin:0 0 1em}
hr{border:0;border-top:2px solid var(--border);margin:2.5em 0}
code{font:.9em ui-monospace,SFMono-Regular,Consolas,"Liberation Mono",monospace;background:var(--code-bg);padding:.15em .4em;border-radius:5px}
pre{background:var(--code-bg);padding:14px 16px;border-radius:8px;overflow:auto;border:1px solid var(--border)}
pre code{background:none;padding:0;font-size:.85em}
blockquote{margin:1em 0;padding:.5em 1em;border-left:4px solid var(--accent);background:var(--row)}
blockquote p:last-child{margin:0}
blockquote.answer{border-left-color:#d4a72c;background:var(--answer)}
ul,ol{padding-left:1.6em;margin:0 0 1em}li{margin:.25em 0}
li.task-list-item{list-style:none;margin-left:-1.4em}li.task-list-item input{margin-right:.5em;vertical-align:middle}
li.task-list-item p{display:inline;margin:0}
.table-wrap{overflow-x:auto;margin:0 0 1.2em}
table{border-collapse:collapse;width:100%;font-size:.92em}
th,td{border:1px solid var(--border);padding:8px 12px;vertical-align:top;text-align:left}
th{background:var(--th);font-weight:600}
tbody tr:nth-child(even){background:var(--row)}
img{max-width:100%}
.meta{color:var(--muted);font-size:.85em;margin-top:3em}
@media print{.toc{display:none!important}.layout{display:block}main{max-width:none;padding:0}}
`;

function escapeHtml(s) {
  return String(s).replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c],
  );
}

// Answer blocks ("> **Answer Qn:**") get their own colour so they are easy to find.
function markAnswers(html) {
  return html.replace(
    /<blockquote>\s*<p><strong>Answer /g,
    '<blockquote class="answer"><p><strong>Answer ',
  );
}

function page(title, toc, bodyHtml, sourceRel) {
  const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>${CSS}</style>
</head>
<body>
<div class="layout${toc ? ' has-toc' : ''}">
${toc}
<main>
${bodyHtml}
<p class="meta">Generated from <code>${escapeHtml(sourceRel)}</code> on ${stamp} UTC. Edit the Markdown, not this page.</p>
</main>
</div>
</body>
</html>
`;
}

function openInBrowser(p) {
  // An argument array, never a shell string, so the path can't break out of quoting.
  if (process.platform === 'win32') execFile('explorer.exe', [p]);
  else execFile(process.platform === 'darwin' ? 'open' : 'xdg-open', [p]);
}

// ---------- convert ----------
// Raw HTML in the Markdown is escaped (no rehype-raw), the same rule as the app's ChatMarkdown.
for (const file of files) {
  const outPath = outPaths.get(file);
  const headings = [];
  const body = renderToStaticMarkup(
    createElement(Markdown, {
      remarkPlugins: [remarkGfm],
      components: makeComponents(headings),
      urlTransform: makeUrlTransform(file, outPath),
      children: readFileSync(file, 'utf8'),
    }),
  );
  const title = headings.find((h) => h.depth === 1)?.text ?? basename(file, '.md');

  mkdirSync(dirname(outPath), { recursive: true });
  const sourceRel = relative(process.cwd(), file).split(sep).join('/');
  writeFileSync(outPath, page(title, buildToc(headings), markAnswers(body), sourceRel), 'utf8');
  console.log(`${sourceRel} -> ${relative(process.cwd(), outPath).split(sep).join('/')}`);
}
if (openAfter) {
  if (files.length === 1) openInBrowser(outPaths.get(files[0]));
  else console.error(`--open skipped: it opens a single page, and ${files.length} were rendered.`);
}
