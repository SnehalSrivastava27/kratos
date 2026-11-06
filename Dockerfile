# Build: web (Vite) + server (tsc). Run: one node process serving site + /api + /ws + /gallery.
# Node 24: node:sqlite works without flags or warnings (22 still prints ExperimentalWarning).
FROM node:24-alpine AS build
WORKDIR /app
COPY web/package.json web/package-lock.json web/
COPY server/package.json server/package-lock.json server/
RUN npm ci --prefix web && npm ci --prefix server
COPY . .
RUN npm run build --prefix web && npm run build --prefix server

FROM node:24-alpine
WORKDIR /app
RUN apk add --no-cache su-exec
ENV NODE_ENV=production PORT=8787 DATA_DIR=/data
COPY server/package.json server/package-lock.json server/
RUN npm ci --omit=dev --prefix server && npm cache clean --force
COPY contracts contracts
COPY demo/feeds demo/feeds
COPY --chown=node gallery gallery
COPY --from=build /app/server/dist server/dist
COPY --from=build /app/web/dist web/dist
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- "http://127.0.0.1:${PORT}/api/ready" || exit 1
# Mounted volumes (docker -v) come up root-owned: fix ownership, then run as `node`.
CMD ["sh", "-c", "mkdir -p \"$DATA_DIR\" && chown node:node \"$DATA_DIR\" && exec su-exec node node server/dist/index.js"]
