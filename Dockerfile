# Build: web (Vite) + server (tsc). Run: one node process serving site + /api + /ws + /gallery.
FROM node:22-alpine AS build
WORKDIR /app
COPY web/package.json web/package-lock.json web/
COPY server/package.json server/package-lock.json server/
RUN npm ci --prefix web && npm ci --prefix server
COPY . .
RUN npm run build --prefix web && npm run build --prefix server

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=8787
COPY server/package.json server/package-lock.json server/
RUN npm ci --omit=dev --prefix server && npm cache clean --force
COPY contracts contracts
COPY demo/feeds demo/feeds
COPY --chown=node gallery gallery
COPY --from=build /app/server/dist server/dist
COPY --from=build /app/web/dist web/dist
USER node
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- "http://127.0.0.1:${PORT}/api/health" || exit 1
CMD ["node", "server/dist/index.js"]
