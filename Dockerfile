FROM node:24-bookworm-slim AS build
RUN npm install --global pnpm@11.19.0
WORKDIR /build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY patches ./patches
RUN pnpm install --frozen-lockfile --ignore-scripts
COPY . .
RUN mkdir -p /package && pnpm build && pnpm pack --pack-destination /package

FROM node:24-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates git ripgrep bash python3 bubblewrap \
    && rm -rf /var/lib/apt/lists/* \
    && npm install --global pnpm@11.19.0
WORKDIR /opt/prism
COPY deploy/container/runtime-package.json ./package.json
COPY deploy/container/pnpm-workspace.yaml ./pnpm-workspace.yaml
RUN --mount=type=cache,id=prism-pnpm-store,target=/root/.local/share/pnpm/store pnpm install --ignore-scripts
COPY --from=build /package/prism-ai-dsh-redteam-1.4.0.tgz ./redteam.tgz
RUN --mount=type=cache,id=prism-pnpm-store,target=/root/.local/share/pnpm/store DSH_HOME=/opt/prism-seed pnpm exec dsh plugin --profile web add /opt/prism/redteam.tgz \
    && DSH_HOME=/opt/prism-seed pnpm exec dsh plugin --profile web exec dsh-redteam install --profile web \
    && mkdir -p /data /workspace/projects \
    && chown -R node:node /data /workspace /opt/prism-seed
COPY deploy/container/cordis.patch.yml /opt/prism/container.patch.yml
COPY deploy/container/entrypoint.mjs /opt/prism/entrypoint.mjs
ENV NODE_ENV=production DSH_HOME=/data HOME=/home/node PATH=/opt/prism/node_modules/.bin:$PATH
USER node
WORKDIR /workspace
EXPOSE 3080
ENTRYPOINT ["node", "/opt/prism/entrypoint.mjs"]
