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

# CGO off yields a static binary that runs on any base image; -trimpath and
# -s -w drop build paths and debug symbols.
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 GOOS=${TARGETOS:-linux} GOARCH=${TARGETARCH} \
    go build -trimpath -ldflags="-s -w" -o /out/steadylearn-api .

# ---- runtime --------------------------------------------------------------
FROM alpine:3.22

# ca-certificates: the Cognito JWKS fetch and any outbound HTTPS need a trust
# store. tzdata: time.LoadLocation otherwise fails on a bare image.
RUN apk add --no-cache ca-certificates tzdata \
    && adduser -D -H -u 10001 app

WORKDIR /app

COPY --from=builder /out/steadylearn-api /app/steadylearn-api

USER 10001

ENV GIN_MODE=release \
    PORT=8080

# Documentation only; the platform's injected PORT is what the process binds to.
EXPOSE 8080

ENTRYPOINT ["/app/steadylearn-api"]
