FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=10000
ENV COMPONENT_DATA_DIR=/app/data
COPY package.json server.mjs team-store.mjs domain.mjs spreadsheet.mjs lcsc.mjs ./
COPY public ./public
COPY scripts ./scripts
RUN mkdir -p /app/data
EXPOSE 10000
VOLUME ["/app/data"]
CMD ["node", "--no-warnings", "server.mjs"]
