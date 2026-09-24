# syntax=docker/dockerfile:1
# Cayrnx image (plan D9/D12): the app, git, and the three agent CLIs at pinned versions with their
# auto-updaters off. /data holds app state, worktrees and the CLIs' own logins (HOME=/data/home);
# /projects is where target projects are bind-mounted.
#
#   docker build -f deploy/Dockerfile -t cayrnx .
#
# Bump a CLI by changing its build arg and rebuilding.

ARG NODE_VERSION=24

FROM node:${NODE_VERSION}-bookworm AS build
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /src
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY tools/fake-cli/package.json tools/fake-cli/
COPY tools/fixtures/package.json tools/fixtures/
RUN pnpm install --frozen-lockfile --config.store-dir=/pnpm-store
COPY . .
RUN pnpm build
# Runtime payload: the bundled server + SPA, plus only the native modules it keeps external.
RUN mkdir /out && cp -r apps/server/bin apps/server/dist apps/server/web /out/ \
 && cd /out && printf '{"name":"cayrnx","private":true,"type":"module"}\n' > package.json \
 && npm install --omit=dev --no-audit --no-fund node-pty@1.1.0 @node-rs/argon2@2.2.1

FROM node:${NODE_VERSION}-bookworm-slim
ARG CLAUDE_VERSION=2.1.280
ARG CODEX_VERSION=0.154.0
ARG OPENCODE_VERSION=2.0.14
RUN apt-get update && apt-get install -y --no-install-recommends \
      git ca-certificates curl tini gosu bash less procps openssh-client ripgrep unzip \
 && rm -rf /var/lib/apt/lists/*
# Claude Code and Codex from npm; OpenCode v2 ships as a binary via its install script.
RUN npm install -g --no-audit --no-fund @anthropic-ai/claude-code@${CLAUDE_VERSION} @openai/codex@${CODEX_VERSION} \
 && npm cache clean --force
RUN curl -fsSL https://opencode.ai/install -o /tmp/oc-install.sh \
 && HOME=/tmp/oc bash /tmp/oc-install.sh --version ${OPENCODE_VERSION} --no-modify-path \
 && install -m 0755 /tmp/oc/.opencode/bin/opencode /usr/local/bin/opencode \
 && rm -rf /tmp/oc /tmp/oc-install.sh \
 && opencode --version
COPY --from=build /out /app
COPY deploy/entrypoint.sh /usr/local/bin/cayrnx-entrypoint
RUN chmod +x /usr/local/bin/cayrnx-entrypoint /app/bin/cayrnx.js && ln -s /app/bin/cayrnx.js /usr/local/bin/cayrnx
ENV CAYRNX_DOCKER=1 \
    CAYRNX_HOME=/data \
    CAYRNX_HOST=0.0.0.0 \
    CAYRNX_PORT=4717 \
    HOME=/data/home \
    DISABLE_AUTOUPDATER=1 \
    OPENCODE_DISABLE_AUTOUPDATE=1 \
    NPM_CONFIG_UPDATE_NOTIFIER=false \
    PUID=1000 \
    PGID=1000
VOLUME ["/data"]
EXPOSE 4717
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:'+(process.env.CAYRNX_PORT||4717)+'/api/auth/state').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
ENTRYPOINT ["tini", "--", "cayrnx-entrypoint"]
CMD ["cayrnx"]
