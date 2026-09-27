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
# A pattern and not a list of names. The list had to be edited every time a
# module was added or renamed, it was forgotten twice, and the image then
# built fine and died on the first request -- which is the worst way for
# this to go wrong. What must not travel is kept out by .dockerignore.
COPY *.js ./
COPY i18n ./i18n
COPY routes ./routes
COPY views ./views
COPY public ./public
CMD ["node", "app.js"]
