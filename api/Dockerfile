# syntax=docker/dockerfile:1

# ---- build ----------------------------------------------------------------
# Pinned to the toolchain in go.mod. Stays on the build host's architecture and
# cross-compiles, which is much faster than emulating the target.
FROM --platform=$BUILDPLATFORM golang:1.25.7-alpine AS builder

WORKDIR /src

# Dependencies resolve on their own layer, so editing source does not re-download
# the module graph.
COPY go.mod go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod \
    go mod download

COPY . .

ARG TARGETOS
ARG TARGETARCH

# CGO stays off: the Statsig SDK loads its native library at runtime through
# purego, which still makes the binary dynamically linked. -I names the
# target's musl loader as its interpreter, since a cross build would otherwise
# get glibc's, which Alpine lacks. -trimpath and -s -w drop build paths and
# debug symbols.
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    case "$TARGETARCH" in \
      amd64) loader=/lib/ld-musl-x86_64.so.1 ;; \
      arm64) loader=/lib/ld-musl-aarch64.so.1 ;; \
      *) echo "unsupported TARGETARCH: $TARGETARCH" >&2; exit 1 ;; \
    esac \
    && CGO_ENABLED=0 GOOS=${TARGETOS:-linux} GOARCH=${TARGETARCH} \
    go build -trimpath -ldflags="-s -w -I $loader" -o /out/steadylearn-api .

# ---- runtime --------------------------------------------------------------
FROM alpine:3.22

# ca-certificates: the Cognito JWKS fetch and any outbound HTTPS need a trust
# store. tzdata: time.LoadLocation otherwise fails on a bare image. libgcc:
# Statsig's native library needs libgcc_s. It writes that library to /tmp
# before loading it, so /tmp must stay writable for the app user.
RUN apk add --no-cache ca-certificates tzdata libgcc \
    && adduser -D -H -u 10001 app

WORKDIR /app

COPY --from=builder /out/steadylearn-api /app/steadylearn-api

USER 10001

ENV GIN_MODE=release \
    PORT=8080

# Documentation only; the platform's injected PORT is what the process binds to.
EXPOSE 8080

ENTRYPOINT ["/app/steadylearn-api"]
