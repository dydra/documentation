# Makefile for the Dydra documentation collection.
#
# The collection is the tree in site/: kinds of documentation, each holding
# documents, put in place by whichever component maintains them -- see
# README.md. This Makefile does two things: regenerate the index pages from
# what is in place, and rsync the tree to the server.

NODE      = node
SITE      = site

# The release destination. Written as an rsync target: the documentation is
# served from https://dydra.com/opt/documentation.
#   make upload SERVER=www-data@dydra.com
SERVER    = dydra.com
SERVERDIR = /opt/documentation
DEST      = $(SERVER):$(SERVERDIR)

RSYNCOPTS = -azP --delete --exclude '.DS_Store' --exclude '*~' --exclude '* copy.html'

.PHONY: help index list release upload serve

help:
	@echo "Please use \`make <target>' where <target> is one of"
	@echo "  index    to regenerate the collection and kind index pages"
	@echo "  list     to report what would be written, writing nothing"
	@echo "  upload   to regenerate the index pages and rsync $(SITE)/ to the server"
	@echo "  release  the same as upload"
	@echo "  serve    to serve $(SITE)/ at http://localhost:8000"
	@echo
	@echo "Destination: $(DEST)"
	@echo "Override with: make upload SERVER=user@host SERVERDIR=/path"
	@echo
	@echo "An index page is generated only while it carries the generator meta"
	@echo "tag; delete that tag and the page is the author's for good. Delete"
	@echo "the page itself to have it written afresh."
	@echo
	@echo "Documents are put in place by their own component -- in sphinx-api,"
	@echo "'make install' builds the reference into $(SITE)/references/api."

index:
	$(NODE) build-index.js

list:
	@$(NODE) build-index.js --list

upload:
	rsync $(RSYNCOPTS) $(SITE)/ $(DEST)/
	@echo
	@echo "Released to $(DEST)."

release: index upload

# a static server for looking at the tree as it will be served, rather than
# over file://, where the directory URLs do not resolve to index.html
serve:
	@cd $(SITE) && python3 -m http.server 8000
