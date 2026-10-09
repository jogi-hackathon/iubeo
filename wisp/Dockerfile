# ビルド段。bufferutil はネイティブ addon で、musl(alpine)向けの prebuilt が無いので
# toolchain を入れてソースからビルドする。実行段には node_modules の成果物だけコピーする
FROM node:24-alpine AS build
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY package.json ./
RUN npm install --omit=dev

FROM node:24-alpine
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY package.json server.mjs token.mjs ./
EXPOSE 8080
CMD ["node", "server.mjs"]
