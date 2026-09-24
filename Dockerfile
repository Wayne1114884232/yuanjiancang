FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=10000
ENV OMP_THREAD_LIMIT=1
RUN apt-get update && apt-get install -y --no-install-recommends tesseract-ocr tesseract-ocr-eng tesseract-ocr-chi-sim ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY server.mjs cloud-store.mjs team-engine.mjs live-updates.mjs domain.mjs spreadsheet.mjs lcsc.mjs release.mjs lots.mjs picking.mjs preview-store.mjs owner-preview-release.mjs owner-config.json ./
COPY lib ./lib
COPY public ./public
COPY scripts ./scripts
EXPOSE 10000
USER node
CMD ["node", "server.mjs"]
