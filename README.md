# Dydra documentation collection

The collection is the tree in `site/`. It is what gets served. It has three
levels:

    site/index.html                     the kinds of documentation   generated
    site/<kind>/index.html              a kind's documents           generated
    site/<kind>/<document>/...          a document                   never touched

    site/
    ├── index.html
    ├── manuals/
    │   ├── index.html
    │   └── temporal-collated-retrieval/
    ├── references/
    │   ├── index.html
    │   └── api/                        installed from sphinx-api
    └── shared/tschichold.css

    make index      regenerate the index pages
    make list       report what would be written, writing nothing
    make upload     regenerate, then rsync site/ to the server
    make serve      serve site/ at http://localhost:8000

## Who puts what in place

Each component installs itself and owns that step; the collection never
enumerates components — it does not know where any of them live. The reference
does it from the `sphinx-api` project, which is not a github repository and so
sits under `org/datagraph` rather than beside this one:

    cd ../../../../org/datagraph/sphinx-api && make install

which builds, rsyncs into `site/references/api/`, and regenerates the index
pages here. The path back to this collection is that project's `COLLECTION`
variable, overridable on the command line
(`make install COLLECTION=/path/to/documentation`). A new document follows the same shape: put a directory holding an
`index.html` into a kind, then regenerate. A new *kind* is just a new directory
at the top of `site/` — its index page is written for you.

Authored manuals have no build step, so they are edited in place under
`site/manuals/`.

## How an index page is kept up to date

**A page which does not exist is written whole**, with plain placeholder wording
for the author to improve.

**A page which exists keeps everything except its listing.** The listing is the
`<div class="cards">` of a collection page or the `<ul class="entries">` of a
kind page: its items are rewritten from the directories below, and the width
hint on a cards grid (`two`, `three`) follows the number of cards. Nothing else
in the file is touched — not the wording, not the navigation band, not the
`<h2>` above the listing. A page with neither listing is reported and left
alone; delete it to have it written afresh.

`build-index.js` reads the `index.html` of everything below the page, and takes
from each:

| what | from |
| --- | --- |
| name | `<title>`, up to any `—`; else the `<h1>` |
| blurb | `<meta name="description">`; else `<p class="lede">`; else the first paragraph |
| date | `<meta name="date">`; else the file's modification time |

A `<meta>` may be written either way — `content="…"` or with the value as
element content, `<meta name="date">2026-08-31</meta>`, as `site/home/` does.

So a document says what it is, in its own page, and the index above it repeats
it. To change how something is described, give its `index.html` a
`<meta name="description">` — that is how `site/manuals/index.html` describes
itself as something other than its lede, and how the reference describes itself
(`tschichold_description` in `sphinx-api/tschichold/conf.py`, emitted on every
page by the theme).

A page written for the first time borrows what is not its own — the eyebrow, the
footer — from a neighbouring page, and says the rest plainly. Improve that
wording in the page; it will not be written over again.

Note that an index page's own blurb is what the level above shows for it. So a
kind's card on the landing page is only as good as that kind's page says it is:
edit the kind's lede or its `<meta name="description">`, then `make index`.

`make list` reports, for every index page, whether it is generated or the
author's, and which source each blurb came from.

## The generator tag

A generated page carries

    <meta name="generator" content="build-index.js">

and **no page without that tag is written to at all**. So the first run writes
an initial page; later runs bring only its listing up to date; and when you want
even the listing left alone — a hand-ordered or hand-worded set of cards —
delete that one tag and the page is yours for good.

- To start a page over from nothing, delete it and run `make index`.
- `--force` brings the listing of a page without the tag up to date as well. It
  is there for a page which has fallen behind a rename; prefer editing.

## Release

    make upload                                   # to dydra.com:/opt/documentation
    make upload SERVER=user@host SERVERDIR=/path  # elsewhere

`upload` regenerates the index pages first, then `rsync -az --delete site/
DEST/`. The destination default corresponds to the documentation served from
`https://dydra.com/opt/documentation`; the Makefile writes it as an rsync target
(`dydra.com:/opt/documentation`) because rsync takes a host and a path rather
than a URL. Confirm the account and the path before the first release.

`api.dydra.com` is unaffected: `make upload` in `sphinx-api` still publishes the
reference to that host's root, independently of this collection.

## Conventions in the script

Two, both at the top of `build-index.js`, and neither required:

- `ORDER` — the order kinds are presented in (`manuals`, `references`, then
  anything else alphabetically).
- `LABELS` — names which are not simply capitalised, so `api` is "API".

A directory in neither still appears; it just sorts last under a capitalised
version of its own name.

`site/shared/tschichold.css` is the stylesheet for the whole collection. The
`sphinx-api` theme keeps a copy of it under
`tschichold/theme/tschichold/static/`, from which the built reference's own
`_static/` is filled; keep the two in step, or the reference will drift away
from the pages around it.

## What belongs in git

This is a github repository, so the question is live. Authored content does:
`build-index.js`, the `Makefile`, this file, the index pages, the manuals, the
stylesheet.

`site/references/api/` is another project's build output, reproduced by `make
install` there. Whether to track it depends on whether you want a clone of this
repository to be publishable on its own — say from github pages — or only a
place the authored parts live. `.gitignore` has the line ready to uncomment
either way.
