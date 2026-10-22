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
RUN npm run build -w apps/web

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=8787 DATA_DIR=/data
COPY --from=build /app .
# Rooms and sessions live here between restarts. Mount a volume on it.
VOLUME /data
EXPOSE 8787
HEALTHCHECK --interval=30s CMD wget -qO- http://localhost:8787/health || exit 1
CMD ["npx", "tsx", "apps/server/src/index.ts"]
