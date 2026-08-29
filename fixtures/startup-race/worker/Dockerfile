FROM node:24-alpine AS build

WORKDIR /workspace

COPY package.json package-lock.json tsconfig.base.json ./
COPY fixtures/startup-race/worker/package.json fixtures/startup-race/worker/package.json
COPY fixtures/startup-race/worker/tsconfig.json fixtures/startup-race/worker/tsconfig.json
COPY fixtures/startup-race/worker/src fixtures/startup-race/worker/src

RUN npm ci --workspace @dsrd/fixture-worker --include-workspace-root
RUN npm run build --workspace @dsrd/fixture-worker

FROM node:24-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /workspace/fixtures/startup-race/worker/dist /app/dist

USER node
CMD ["node", "dist/main.js"]
