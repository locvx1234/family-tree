# syntax=docker/dockerfile:1

FROM node:24-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS build
COPY vite.config.js ./
COPY client ./client
RUN npm run build

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production \
    PORT=3001 \
    DATA_DIR=/app/server/data

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY server ./server
COPY --from=build /app/dist ./dist

# The empty directory is copied into a new named volume with this ownership,
# allowing the non-root node user to create SQLite and JWT secret files.
RUN mkdir -p /app/server/data && chown -R node:node /app

USER node
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3001/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]

CMD ["npm", "start"]
