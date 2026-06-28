FROM node:22-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y python3 make g++ curl --no-install-recommends \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --prefer-offline --no-audit --no-fund --legacy-peer-deps

COPY . .
RUN npm run build \
  && npm prune --omit=dev

ENV NODE_ENV=production \
    PORT=9000

EXPOSE 9000

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD curl -fsS http://localhost:9000/health || exit 1

CMD ["npm", "run", "start"]
