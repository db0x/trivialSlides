# 22 and not 20, for two reasons that both come from the same place: the
# app itself uses what a current node brings -- fetch for the model
# (ai.js), no client library -- and reading PDFs rests on a package that
# declares node >= 22 (pdf-text.js). An optional dependency whose engine
# does not match is skipped SILENTLY by npm, which is the right behaviour
# and was also why the PDF button was quietly absent in a container built
# on 20 while development ran on 22.
FROM node:22-slim

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
