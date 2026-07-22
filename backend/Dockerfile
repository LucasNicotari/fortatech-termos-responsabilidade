FROM node:22-bookworm-slim AS base
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

FROM base AS deps
WORKDIR /app
COPY backend/package*.json ./
RUN --mount=type=cache,target=/root/.npm npm ci

FROM base AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY backend/. .
RUN npm run prisma:generate && npm run build

FROM base AS production-deps
WORKDIR /app
COPY backend/package*.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
RUN rm -rf \
    node_modules/@prisma/client/runtime/*wasm* \
    node_modules/@prisma/engines/libquery_engine* \
    node_modules/prisma/prisma-client \
    node_modules/effect/src \
    node_modules/typescript \
  && find node_modules -type f \( \
    -name '*.map' -o \
    -name '*.d.ts' -o \
    -iname 'README*' -o \
    -iname 'CHANGELOG*' \
  \) -delete

FROM debian:bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    HOME=/home/node
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    openssl \
    tini \
    libreoffice-writer-nogui \
    fonts-liberation \
    fonts-crosextra-carlito \
    fonts-crosextra-caladea \
  && rm -rf /var/lib/apt/lists/* /var/cache/apt/* /tmp/* \
  && groupadd --gid 1000 node \
  && useradd --uid 1000 --gid 1000 --create-home --shell /usr/sbin/nologin node \
  && mkdir -p /app/storage-data /templates \
  && chown -R node:node /app /templates /home/node
COPY --from=base /usr/local/bin/node /usr/local/bin/node
COPY --chown=node:node backend/package*.json ./
COPY --chown=node:node --from=production-deps /app/node_modules ./node_modules
COPY --chown=node:node --from=build /app/dist ./dist
COPY --chown=node:node --from=build /app/prisma ./prisma
COPY --chown=node:node backend/docker-entrypoint.sh ./docker-entrypoint.sh
COPY --chown=node:node templates/term.docx /templates/term.docx
RUN chmod 0555 /app/docker-entrypoint.sh
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "const port=process.env.PORT||process.env.BACKEND_PORT||3000;fetch(`http://127.0.0.1:${port}/health`).then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["/app/docker-entrypoint.sh"]
