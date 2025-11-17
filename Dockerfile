FROM node:20-alpine AS development-dependencies-env
RUN corepack enable && corepack prepare pnpm@latest --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml /app/
WORKDIR /app
RUN pnpm install --frozen-lockfile

FROM node:20-alpine AS build-env
RUN corepack enable && corepack prepare pnpm@latest --activate
COPY . /app/
COPY --from=development-dependencies-env /app/node_modules /app/node_modules
WORKDIR /app
RUN pnpm run build

FROM node:20-alpine
RUN corepack enable && corepack prepare pnpm@latest --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml /app/
WORKDIR /app
RUN pnpm install --frozen-lockfile --prod
COPY --from=build-env /app/build /app/build
CMD ["pnpm", "run", "start"]