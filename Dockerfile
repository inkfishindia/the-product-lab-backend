FROM node:22-slim AS deps
WORKDIR /app

RUN apt-get update \
  && apt-get install -y python3 make g++ --no-install-recommends \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build
WORKDIR /app
COPY . .
RUN npm run build

FROM node:22-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=9000

RUN apt-get update \
  && apt-get install -y python3 make g++ --no-install-recommends \
  && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/.medusa/server ./
RUN npm ci --omit=dev

EXPOSE 9000
CMD ["npm", "run", "start"]
