# frodo-cli MCP HTTP server container image.
#
# Multi-stage build:
#   1. build  — installs the full toolchain and runs `npm run build:only`
#               (tsdown), producing the self-contained dist/ bundle.
#   2. runtime — node:26-slim + dist/ only. The bundle was verified to have
#                zero runtime node_modules dependencies (every dependency is
#                compiled into dist/*.cjs), so the runtime image needs no
#                node_modules and no dev tooling: smaller surface, smaller
#                image, no prod-install pruning step to get wrong.
#
# node 26 matches the runtime the SEA release binary is built on
# (SEA_NODE_VERSION in the pipeline; package.json engines >= 26); the tag is
# pinned to -slim for a small, predictable base.
FROM node:26-slim AS build
WORKDIR /build

# Copy the manifests first: a source change that does not touch dependencies
# reuses the cached npm ci layer.
COPY package.json package-lock.json tsdown.config.ts tsconfig.json ./
RUN npm ci --include=dev

# Now the sources (tsconfig compiles the whole src tree; help data and
# templates are bundled into dist by tsdown).
COPY src ./src
COPY package.json ./
RUN npm run build:only

# ---------------------------------------------------------------------------
FROM node:26-slim AS runtime
WORKDIR /app

# Run as a non-root user (node user ships with the base image).
USER node

# Only the self-contained bundle: launch.cjs (the entry, which runs app.cjs in
# its own process), app.cjs (the CLI), the shared chunks and their sourcemaps
# (stack traces use them only when FRODO_SOURCE_MAPS=1 is set).
COPY --from=build --chown=node:node /build/dist ./dist

ENV NODE_ENV=production

# No compile cache in the image (docs/BUILD-ENV.md section 2.4). The entry would
# keep it in the config folder, which is the anonymous volume below: a new
# container does not share it, so it would pay the cost of filling the cache on
# every run and never get that back. A container that mounts its config folder
# turns the cache on again with `-e FRODO_NO_COMPILE_CACHE=0`.
ENV FRODO_NO_COMPILE_CACHE=1

# Connection profiles live on a volume the operator mounts (read-only is
# enough for `mcp server start`; the token cache (a TokenCache directory) and
# theme files are written to /home/node/.frodo when those features are used).
ENV FRODO_CONNECTION_PROFILES_PATH=/home/node/.frodo/Connections.json
RUN mkdir -p /home/node/.frodo && chown node:node /home/node/.frodo
VOLUME ["/home/node/.frodo"]

# The MCP HTTP transport's documented default port.
EXPOSE 6277

# launch.cjs is the documented entrypoint. It runs the CLI in its own process,
# which is PID 1 of the container, so `docker stop` (SIGTERM) reaches the MCP
# server's own handler: the graceful shutdown, and the port is released. PID 1
# has no default action for a signal that has no handler, so during start-up,
# and for a command that is not the server, SIGTERM is ignored and `docker
# stop` waits for its grace period (10 seconds) before it kills the process.
# Start the container with `docker run --init` (compose: `init: true`, as in
# docker/docker-compose.yml) to have a small init process as PID 1 that passes
# the signal on.
#
# The connection profile is NOT baked in: the tenant selector is the
# positional [host] argument (a saved profile's host URL, a unique
# substring, or its alias) or the FRODO_HOST environment variable. Without
# one the server starts unconnected (health answers, every tool call
# fails), so override CMD with the profile name — or set FRODO_HOST — when
# running. The profile's stored password is encrypted with the
# masterkey.key of the machine that saved it; mount both that file and
# Connections.json (see docker/docker-compose.yml for the working example).
ENTRYPOINT ["node", "dist/launch.cjs"]
CMD ["mcp", "server", "start", "--transport", "http", "--bind-host", "0.0.0.0", "--port", "6277"]
