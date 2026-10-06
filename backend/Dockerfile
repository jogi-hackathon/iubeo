# ビルド段は常にネイティブで動かす(--platform=$BUILDPLATFORM)。
# これが無いと linux/arm64 を作るときに Go コンパイラまで QEMU で動いて遅くなる。
FROM --platform=$BUILDPLATFORM golang:1.27.1-alpine AS build

# go.mod がこのイメージより新しい Go を要求したとき、黙って toolchain を
# ダウンロードせず、その場で失敗させる(ビルドの再現性のため)
ENV GOTOOLCHAIN=local

ARG TARGETOS
ARG TARGETARCH
WORKDIR /src

# モジュールとビルドキャッシュは層ではなく BuildKit のキャッシュに置く。
# 2 回目以降のビルドが速くなる
COPY go.mod go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod \
    go mod download

COPY . .
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 GOOS=${TARGETOS:-linux} GOARCH=${TARGETARCH:-amd64} \
    go build -trimpath -ldflags="-s -w" -o /out/iubeo-server ./cmd/server

# 実行段。CGO を切っているので libc が要らず、distroless static で足りる。
# ca-certificates と nonroot ユーザーはこのイメージに最初から入っている。
FROM gcr.io/distroless/static-debian13:nonroot

COPY --from=build /out/iubeo-server /iubeo-server
USER nonroot:nonroot
EXPOSE 8080
ENTRYPOINT ["/iubeo-server"]
