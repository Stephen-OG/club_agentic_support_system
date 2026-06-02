# syntax=docker/dockerfile:1

FROM node:22-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN npm ci

FROM deps AS build
WORKDIR /app

COPY tsconfig.base.json ./
COPY apps/api apps/api
COPY packages/database packages/database
COPY packages/shared packages/shared

RUN npm run prisma:generate -w @guestos/database
RUN npm run build -w @guestos/api
RUN npm prune --omit=dev

FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4000

COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api/package.json apps/api/package.json
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/packages/database/package.json packages/database/package.json
COPY --from=build /app/packages/database/prisma packages/database/prisma
COPY --from=build /app/packages/shared/package.json packages/shared/package.json
COPY --from=build /app/packages/shared/dist packages/shared/dist

EXPOSE 4000

CMD ["npm", "run", "start", "-w", "@guestos/api"]
