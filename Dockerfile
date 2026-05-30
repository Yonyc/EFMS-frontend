FROM node:22-alpine AS development-dependencies-env
RUN corepack enable && corepack prepare pnpm@9 --activate
COPY package.json pnpm-lock.yaml /app/
WORKDIR /app
RUN pnpm install --frozen-lockfile

FROM node:22-alpine AS build-env
RUN corepack enable && corepack prepare pnpm@9 --activate
COPY . /app/
COPY --from=development-dependencies-env /app/node_modules /app/node_modules
WORKDIR /app
RUN pnpm run build

FROM node:22-alpine
RUN corepack enable && corepack prepare pnpm@9 --activate
COPY package.json pnpm-lock.yaml /app/
WORKDIR /app
RUN pnpm install --frozen-lockfile --prod
COPY --from=build-env /app/build /app/build
CMD ["pnpm", "run", "start"]