FROM node:20-slim

# Chromium produces the PDF: it renders the very same document that is also
# the standalone HTML version (see pdf.js). The font packages are not
# optional -- without them the browser in the container has no font at all,
# and themes that fetch their own from the web would have no fallback.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      chromium \
      fonts-dejavu-core \
      fonts-liberation \
 && rm -rf /var/lib/apt/lists/*
ENV BROWSER_PATH=/usr/bin/chromium

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY app.js config.js deck.js dokument.js layouts.js pdf.js render.js storage.js ./
COPY routes ./routes
COPY views ./views
COPY public ./public
CMD ["node", "app.js"]
