#!/usr/bin/env node
'use strict';

/*
 * Keeps the index pages of the collection in step with what is below them.
 *
 * The collection has three levels: the collection, its kinds of documentation,
 * and the documents within a kind.
 *
 *     site/index.html            the kinds
 *     site/<kind>/index.html     its documents
 *     site/<kind>/<doc>/...      a document       <- never touched
 *
 * There is no configuration file. A directory holding an index.html is a
 * document, and that page says what it is: its <title> gives the name, and a
 * <meta name="description">, a <p class="lede"> or its first paragraph gives
 * the blurb.
 *
 * An index page which does not exist is written whole. An index page which
 * exists is left exactly as it is apart from its listing -- the
 * <div class="cards"> of a collection page, or the <ul class="entries"> of a
 * kind page -- whose items are rewritten from the directories below it. All the
 * rest of the page, its wording included, belongs to its author.
 *
 * A generated page carries
 *
 *     <meta name="generator" content="build-index.js">
 *
 * and no page without that tag is written to at all. Delete the tag and even
 * the listing is left alone; delete the page and it is written afresh.
 *
 *     node build-index.js            bring the index pages up to date
 *     node build-index.js --list     report what it would do, write nothing
 *     node build-index.js --force    write to pages without the tag as well
 */

const fs = require('fs');
const path = require('path');

const SITE = path.join(__dirname, 'site');
const MARKER = 'name="generator" content="build-index.js"';

/* Kinds are presented in this order; anything else follows, alphabetically. */
const ORDER = ['manuals', 'references'];

/* Directory names which are not simply capitalised. */
const LABELS = { api: 'API' };

/* Directories which hold assets rather than documentation. */
const NOT_CONTENT = new Set(['shared', '_static', '_images', '_sources', '_downloads']);

// ---------------------------------------------------------------- text tools

const ENTITIES = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'",
  '&nbsp;': ' ', '&mdash;': '—', '&ndash;': '–', '&#8212;': '—',
  '&#8211;': '–', '&middot;': '·', '&copy;': '©', '&rarr;': '→',
  '&hellip;': '…', '&#8217;': '’', '&#8220;': '“', '&#8221;': '”',
};

/* The readable text of a fragment written by some other page. */
function text(html) {
  if (!html) return '';
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#(\d+);/g, (m, n) => String.fromCharCode(Number(n)))
    .replace(/&[a-z]+;/gi, (m) => (m in ENTITIES ? ENTITIES[m] : m))
    .replace(/\s+/g, ' ')
    .trim();
}

function escape(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function inner(re, html, fallback) {
  const m = re.exec(html || '');
  return m ? m[1].replace(/\s+/g, ' ').trim() : fallback;
}

function klass(name, tag) {
  return new RegExp(
    `<${tag}[^>]*class=["'][^"']*\\b${name}\\b[^"']*["'][^>]*>([\\s\\S]*?)</${tag}>`, 'i');
}

/* A named <meta>, written either as an attribute or, as some of these pages
   do, with the value as element content: <meta name="date">2026-08-31</meta> */
function meta(name, html) {
  const attr = new RegExp(
    `<meta\\s+name=["']${name}["']\\s+content=["']([^"']*)["'][^>]*>`, 'i');
  const element = new RegExp(
    `<meta\\s+name=["']${name}["']\\s*>([\\s\\S]*?)</meta\\s*>`, 'i');
  return text(inner(attr, html, '')) || text(inner(element, html, ''));
}

const RE = {
  title: /<title[^>]*>([\s\S]*?)<\/title>/i,
  h1: /<h1[^>]*>([\s\S]*?)<\/h1>/i,
  h2: /<h2[^>]*>([\s\S]*?)<\/h2>/i,
  lang: /<html[^>]*\blang=["']([^"']*)["']/i,
  para: /<p(?![^>]*class=["'][^"']*\bchapno\b)[^>]*>([\s\S]*?)<\/p>/i,
  eyebrow: klass('eyebrow', 'div'),
  chapno: klass('chapno', 'p'),
  lede: klass('lede', 'p'),
  footer: klass('fl', 'div'),
};

function label(slug) {
  return LABELS[slug] || slug.charAt(0).toUpperCase() + slug.slice(1);
}

function join(names) {
  if (names.length < 2) return names[0] || '';
  return names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
}

function read(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch (e) {
    return '';
  }
}

// ------------------------------------------------------------------ discovery

function hasIndex(dir) {
  return fs.existsSync(path.join(dir, 'index.html'));
}

/* Whether a directory is, or contains, documentation. A kind qualifies either
   way -- its own index page may be the one about to be written -- but a
   document has to present an index.html of its own. */
function contentful(dir) {
  if (hasIndex(dir)) return true;
  try {
    return fs.readdirSync(dir, { withFileTypes: true })
      .some((e) => (e.isDirectory() || e.isSymbolicLink()) &&
                   !e.name.startsWith('.') &&
                   !NOT_CONTENT.has(e.name) &&
                   hasIndex(path.join(dir, e.name)));
  } catch (e) {
    return false;
  }
}

/* The content-bearing directories under `dir`, in presentation order. */
function children(dir, requireIndex) {
  if (!fs.existsSync(dir)) return [];
  const found = fs.readdirSync(dir, { withFileTypes: true })
    .filter((e) => (e.isDirectory() || e.isSymbolicLink()) &&
                   !e.name.startsWith('.') &&
                   !NOT_CONTENT.has(e.name) &&
                   (requireIndex ? hasIndex(path.join(dir, e.name))
                                 : contentful(path.join(dir, e.name))))
    .map((e) => e.name);

  found.sort((a, b) => {
    const ia = ORDER.indexOf(a);
    const ib = ORDER.indexOf(b);
    if (ia !== -1 || ib !== -1) {
      return (ia === -1 ? ORDER.length : ia) - (ib === -1 ? ORDER.length : ib);
    }
    return a.localeCompare(b);
  });
  return found;
}

/* What a page says about itself. */
function describe(slug, file) {
  const html = read(file);
  const title = text(inner(RE.title, html, '')).split(/\s+[—–|]\s+/)[0];
  const heading = text(inner(RE.h1, html, ''));
  const described = meta('description', html);
  const lede = text(inner(RE.lede, html, ''));
  const para = text(inner(RE.para, html, ''));

  let updated = meta('date', html);
  if (!updated) {
    try {
      updated = fs.statSync(file).mtime.toISOString().slice(0, 10);
    } catch (e) {
      updated = '';
    }
  }

  return {
    slug,
    file,
    html,
    label: label(slug),
    title: title || heading || label(slug),
    blurb: described || lede || para || '',
    from: described ? 'meta description' : lede ? 'lede' : para ? 'first paragraph' : 'nothing',
    updated,
  };
}

// -------------------------------------------------------------- the listings

function cards(items, indent) {
  const pad = ' '.repeat(indent);
  return items.map((e, i) => `${pad}<a class="card" href="${e.slug}/index.html">
${pad}  <div class="no">${String(i + 1).padStart(2, '0')}</div>
${pad}  <h3>${escape(e.title)}</h3>
${pad}  <p>${escape(e.blurb)}</p>
${pad}</a>`).join('\n');
}

function entries(items, indent) {
  const pad = ' '.repeat(indent);
  return items.map((e, i) => `${pad}<li><a href="${e.slug}/index.html">
${pad}  <span class="tn">${String(i + 1).padStart(2, '0')}</span>
${pad}  <span><span class="et">${escape(e.title)}</span><span class="eb">${escape(e.blurb)}</span></span>
${pad}  <span class="ed">${escape(e.updated)}</span>
${pad}</a></li>`).join('\n');
}

/* The width hint on a cards grid follows the number of cards. */
function columns(classes, count) {
  const kept = classes.split(/\s+/).filter((c) => c && c !== 'two' && c !== 'three');
  if (!kept.includes('cards')) kept.unshift('cards');
  if (count === 2) kept.push('two');
  else if (count >= 3) kept.push('three');
  return kept.join(' ');
}

/* An element and its matching close, found by counting nested tags -- the
   listings hold markup of their own, so a lazy match will not do. */
function block(html, tag, cls) {
  const opener = new RegExp(
    `<${tag}[^>]*class=["'][^"']*\\b${cls}\\b[^"']*["'][^>]*>`, 'i');
  const m = opener.exec(html);
  if (!m) return null;

  const after = m.index + m[0].length;
  const nested = new RegExp(`<${tag}\\b|</${tag}\\s*>`, 'gi');
  nested.lastIndex = after;

  let depth = 1;
  let hit;
  while ((hit = nested.exec(html)) !== null) {
    depth += hit[0][1] === '/' ? -1 : 1;
    if (depth === 0) {
      const line = html.lastIndexOf('\n', m.index) + 1;
      return {
        open: m[0],
        start: m.index,
        inner: html.slice(after, hit.index),
        end: hit.index,
        close: hit[0],
        indent: m.index - line,
      };
    }
  }
  return null;
}

/* Rewrite just the listing of an existing page. */
function relist(html, items) {
  const grid = block(html, 'div', 'cards');
  if (grid) {
    const open = grid.open.replace(/class=(["'])([^"']*)\1/i,
      (m, q, v) => `class=${q}${columns(v, items.length)}${q}`);
    const body = cards(items, grid.indent + 2);
    return {
      page: html.slice(0, grid.start) + open + '\n' + body + '\n' +
            ' '.repeat(grid.indent) + html.slice(grid.end),
      what: 'cards',
    };
  }

  const list = block(html, 'ul', 'entries');
  if (list) {
    const body = entries(items, list.indent + 2);
    return {
      page: html.slice(0, list.start) + list.open + '\n' + body + '\n' +
            ' '.repeat(list.indent) + html.slice(list.end),
      what: 'entries',
    };
  }

  return { page: html, what: null };
}

// ------------------------------------------------------- a page from nothing

/* What to say on a page being written for the first time: borrowed from a
   neighbour where that makes sense, said plainly where it does not. */
function words(borrow, defaults) {
  const keep = (re, fallback) => {
    for (const other of borrow) {
      const theirs = inner(re, other, null);
      if (theirs !== null) return theirs;
    }
    return fallback;
  };
  return {
    lang: keep(RE.lang, 'en'),
    eyebrow: keep(RE.eyebrow, 'Documentation'),
    footer: keep(RE.footer, `Documentation<br>&copy; ${new Date().getFullYear()} Dydra`),
    title: defaults.title,
    meta: defaults.meta,
    chapno: defaults.chapno,
    vlabel: defaults.vlabel,
    headline: defaults.headline,
    lede: defaults.lede,
    section: 'What is here',
  };
}

function page(w, up, kinds, current, listing) {
  const cells = kinds.map((k) =>
    `    <a class="cell${k.slug === current ? ' on' : ''}" ` +
    `href="${up}${k.slug}/index.html">${escape(k.label)}</a>`);
  cells.push('    <span class="spacer"></span>');
  cells.push('    <a class="cell strong" href="https://dydra.com">dydra.com</a>');

  return `<!DOCTYPE html>
<html lang="${escape(w.lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(w.title)}</title>
<meta name="description" content="${escape(text(w.lede))}">
<!-- Generated by build-index.js. Its listing below is rewritten from the
     directories beneath this page; the rest, this wording included, is yours
     to edit. Delete the generator tag and the listing is left alone too. -->
<meta ${MARKER}>
<link rel="stylesheet" href="${up}shared/tschichold.css" type="text/css">
</head>
<body>
<div class="container">

  <header class="masthead">
    <div>
      <div class="eyebrow">${w.eyebrow}</div>
      <div class="wordmark"><a href="${up}index.html">dydra</a></div>
    </div>
    <div class="meta">${w.meta}</div>
  </header>

  <nav class="band" aria-label="Collection">
${cells.join('\n')}
  </nav>

  <section class="title">
    <div class="rail"><div class="vlabel">${w.vlabel}</div></div>
    <div class="content">
      <p class="chapno">${w.chapno}</p>
      <h1>${w.headline}</h1>
      <p class="lede">${w.lede}</p>
    </div>
  </section>

  <section class="section heavy">
    <div class="rail"><div class="numeral">01</div><div class="vlabel">${escape(w.vlabel)}</div></div>
    <div class="content">
      <h2>${w.section}</h2>
${listing}
    </div>
  </section>

  <footer class="footer">
    <div class="wm"><a href="${up}index.html">dydra</a></div>
    <div class="fl">${w.footer}</div>
  </footer>

</div>
</body>
</html>
`;
}

// ------------------------------------------------------------------ managing

function state(file) {
  if (!fs.existsSync(file)) return 'absent';
  return read(file).includes(MARKER) ? 'generated' : 'authored';
}

function update(file, items, fresh, force, listing) {
  const name = path.relative(__dirname, file);
  const was = state(file);

  if (was === 'absent') {
    fs.writeFileSync(file, fresh());
    console.log(`  ${name}: written, ${items.length} ${listing}`);
    return;
  }
  if (was === 'authored' && !force) {
    console.log(`  ${name}: the author's -- left alone`);
    return;
  }

  const html = read(file);
  const { page: next, what } = relist(html, items);
  if (!what) {
    console.log(`  ${name}: no cards or entries listing to bring up to date` +
                ' -- delete the page to have it written afresh');
    return;
  }
  if (next === html) {
    console.log(`  ${name}: ${what} unchanged`);
    return;
  }
  fs.writeFileSync(file, next);
  console.log(`  ${name}: ${what} brought up to date, ${items.length} now` +
              (was === 'authored' ? " -- over the author's page" : ''));
}

function main() {
  const listing = process.argv.includes('--list');
  const force = process.argv.includes('--force');

  if (!fs.existsSync(SITE)) {
    console.error(`no site directory at ${SITE}`);
    process.exit(1);
  }

  const collectionFile = path.join(SITE, 'index.html');
  const collection = read(collectionFile);
  const kindSlugs = children(SITE, false);

  if (!kindSlugs.length) {
    console.error(`nothing in ${SITE} -- a kind of documentation is a` +
                  ' directory holding an index.html');
    process.exit(1);
  }
  const kindCells = kindSlugs.map((s) => ({ slug: s, label: label(s) }));

  /* Each kind's page first: the collection's cards are read off them. */
  for (const slug of kindSlugs) {
    const dir = path.join(SITE, slug);
    const file = path.join(dir, 'index.html');
    const docs = children(dir, true).map((d) => describe(d, path.join(dir, d, 'index.html')));

    if (!docs.length) {
      console.log(`  ${path.relative(__dirname, file)}: a single page --` +
                  ' nothing below it to list');
      continue;
    }

    if (listing) {
      console.log(`  ${path.relative(__dirname, file)}: ${state(file)},` +
                  ` ${docs.length} document${docs.length === 1 ? '' : 's'}`);
      for (const d of docs) {
        console.log(`      ${d.slug} -- ${d.title}, blurb from its ${d.from}`);
      }
      continue;
    }

    update(file, docs, () => {
      const w = words([collection], {
        title: label(slug),
        meta: label(slug),
        chapno: `${text(inner(RE.chapno, collection, 'Documentation'))} · ${slug}`,
        vlabel: slug,
        headline: label(slug),
        lede: `${docs.length === 1 ? 'One document' : docs.length + ' documents'}: ` +
              `${join(docs.map((d) => d.title))}.`,
      });
      return page(w, '../', kindCells, slug,
                  `      <ul class="entries">\n${entries(docs, 8)}\n      </ul>`);
    }, force, 'entries');
  }

  /* Then the collection page, over the kind pages as they now stand. */
  const kinds = kindSlugs.map((s) => describe(s, path.join(SITE, s, 'index.html')));

  if (listing) {
    console.log(`  site/index.html: ${state(collectionFile)}, ${kinds.length} kinds`);
    for (const k of kinds) {
      console.log(`      ${k.slug} -- ${k.title}, blurb from its ${k.from}`);
    }
    return;
  }

  update(collectionFile, kinds, () => {
    const w = words(kinds.map((k) => k.html), {
      title: 'Documentation',
      meta: 'Documentation',
      chapno: 'Documentation',
      vlabel: 'collection',
      headline: 'Documentation',
      lede: `${kinds.length === 1 ? 'One kind' : kinds.length + ' kinds'} of ` +
            `documentation: ${join(kinds.map((k) => k.title))}.`,
    });
    return page(w, '', kindCells, null,
                `      <div class="cards${kinds.length === 2 ? ' two' : kinds.length >= 3 ? ' three' : ''}">\n` +
                `${cards(kinds, 8)}\n      </div>`);
  }, force, 'cards');
}

main();
