# Void Dominion — static app served by nginx.
# The app is a build-step-free static site, so the image is just nginx + files.
# Serving over http:// (not file://) restores full IndexedDB persistence.

FROM nginx:1.27-alpine

# Copy the app into the web root. Hash-based routing means no SPA rewrite rule
# is required — every route lives under index.html already.
COPY . /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s \
  CMD wget -qO- http://localhost/ >/dev/null 2>&1 || exit 1
