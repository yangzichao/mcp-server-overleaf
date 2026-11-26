FROM node:24-bookworm-slim AS build
WORKDIR /app

COPY package.json npm-shrinkwrap.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund

COPY tsconfig.json ./
COPY scripts/compilation/cleanOutput.mjs ./scripts/compilation/
COPY src/ ./src/
RUN npm run build && npm prune --omit=dev --ignore-scripts --no-audit --no-fund

FROM node:24-bookworm-slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates git latexmk texlive-latex-base \
    && rm -rf /var/lib/apt/lists/* \
    && install -d -o node -g node /home/node/.overleaf-mcp/projects

ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

USER node
ENTRYPOINT ["node", "dist/index.js", "--stdio"]
