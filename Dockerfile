# Build stage. Compiles TypeScript to dist/ and is then thrown away.
FROM node:22-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
# --ignore-scripts skips the "prepare": "husky" hook, which needs a .git
# directory that does not exist inside the image. None of the runtime
# dependencies have install scripts.
RUN pnpm install --frozen-lockfile --ignore-scripts
COPY tsconfig.json ./
COPY src ./src
COPY register-commands.ts ./
RUN pnpm build

# Runtime stage. Production dependencies plus the compiled output only.
FROM node:22-slim AS runtime
WORKDIR /app
RUN corepack enable
ENV NODE_ENV=production

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod --ignore-scripts
COPY --from=build /app/dist ./dist

# The pose list ships in the image and changes by pull request. It is read and
# validated at startup, and the bot refuses to start if it is invalid.
COPY poses.json ./

# Drop root. node:22-slim ships a `node` user, and everything under /app is
# world-readable, so the bot needs nothing more. A compromised dependency then
# runs without uid 0.
USER node

# Nothing persists. There is no volume and no DATA_DIR. Pose timers live in
# memory and a restart drops them.

CMD ["node", "dist/src/index.js"]
