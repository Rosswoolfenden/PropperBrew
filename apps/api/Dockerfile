# Build context is the repo root:  fly deploy --config apps/api/fly.toml .
FROM node:22-slim AS build
WORKDIR /repo
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile --filter @propperbrew/api...
# Bundles the API and its workspace packages into a single dist/index.js.
RUN pnpm --filter @propperbrew/api build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
# sharp (photo resizing) is native, so it's installed for this platform rather than bundled.
RUN npm install --no-save --no-package-lock --omit=dev sharp@0.35.5 && mkdir -p /app/uploads && chown node /app/uploads
COPY --from=build /repo/apps/api/dist ./dist
# Sample coffee photos for seeded/demo data (served at /mock/*).
COPY --from=build /repo/apps/api/public ./public
USER node
EXPOSE 8080
CMD ["node", "--enable-source-maps", "dist/index.js"]
