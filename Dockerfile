FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache python3 py3-cryptography

COPY --from=build /app/dist ./dist
COPY server.mjs ./server.mjs
COPY scripts ./scripts

EXPOSE 8080

# Run as the unprivileged `node` user (uid/gid 1000) provided by the base image.
USER node

CMD ["node", "server.mjs"]
