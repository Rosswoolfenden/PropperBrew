# Local preview image, used by compose.yaml. Build context is the repo root.
FROM node:22-slim
WORKDIR /repo
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 NEXT_TELEMETRY_DISABLED=1
RUN corepack enable

# Fetch dependencies from the lockfile alone so source edits don't invalidate this layer.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN pnpm fetch
COPY . .
RUN pnpm install --offline --frozen-lockfile --filter @propperbrew/web... && chown -R node apps/web

USER node
WORKDIR /repo/apps/web
ENV PATH=/repo/apps/web/node_modules/.bin:$PATH
EXPOSE 3000
# The home page is prerendered from the API, so build once the API is reachable rather than at image build.
CMD ["sh", "-c", "next build && next start --port 3000"]
