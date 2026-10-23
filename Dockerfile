# One image: the game server, serving the built web app on the same port.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/engine/package.json packages/engine/
COPY packages/bots/package.json packages/bots/
COPY packages/protocol/package.json packages/protocol/
COPY apps/web/package.json apps/web/
COPY apps/server/package.json apps/server/
RUN npm ci --no-audit --no-fund
COPY . .
# The web app is served by the server itself, so it talks to the same host.
RUN npm run build -w apps/web && npm prune --omit=dev

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=8787 DATA_DIR=/data
# Only what runs: the server and the packages it imports (as TypeScript, run by tsx), and the built web app.
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
# (A directory source is copied by its contents, so each src lands in its own src/.)
COPY --from=build /app/packages/engine/package.json ./packages/engine/
COPY --from=build /app/packages/engine/src ./packages/engine/src
COPY --from=build /app/packages/bots/package.json ./packages/bots/
COPY --from=build /app/packages/bots/src ./packages/bots/src
COPY --from=build /app/packages/protocol/package.json ./packages/protocol/
COPY --from=build /app/packages/protocol/src ./packages/protocol/src
COPY --from=build /app/apps/server/package.json ./apps/server/
COPY --from=build /app/apps/server/src ./apps/server/src
COPY --from=build /app/apps/web/dist ./apps/web/dist
RUN mkdir -p /data && chown -R node:node /data /app
USER node
# Rooms and sessions live here between restarts. Mount a volume on it.
VOLUME /data
EXPOSE 8787
HEALTHCHECK --interval=30s CMD wget -qO- http://localhost:8787/health || exit 1
CMD ["node_modules/.bin/tsx", "apps/server/src/index.ts"]
