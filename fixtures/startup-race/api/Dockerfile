FROM node:24-alpine AS build

WORKDIR /workspace

COPY package.json package-lock.json tsconfig.base.json ./
COPY fixtures/startup-race/api/package.json fixtures/startup-race/api/package.json
COPY fixtures/startup-race/api/tsconfig.json fixtures/startup-race/api/tsconfig.json
COPY fixtures/startup-race/api/src fixtures/startup-race/api/src

RUN npm ci --workspace @dsrd/fixture-api --include-workspace-root
RUN npm run build --workspace @dsrd/fixture-api

FROM node:24-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /workspace/node_modules /app/node_modules
COPY --from=build /workspace/fixtures/startup-race/api/dist /app/dist

USER node
CMD ["node", "dist/main.js"]
