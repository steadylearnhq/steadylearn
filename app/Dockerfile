# syntax=docker/dockerfile:1

# ---- build ----------------------------------------------------------------
# The output is plain JS/CSS, so the build stays on the host's architecture
# instead of emulating the target. Node matches .nvmrc.
FROM --platform=$BUILDPLATFORM node:24-alpine AS builder

WORKDIR /src

# Dependencies resolve on their own layer, so editing source does not
# reinstall them.
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci

COPY . .

# Vite compiles import.meta.env into the bundle. Building with placeholders
# keeps the image environment-agnostic: 50-inject-env.sh swaps in the real
# values from the container's environment at startup.
ENV VITE_API_URL=__VITE_API_URL__ \
    VITE_USER_POOL_ID=__VITE_USER_POOL_ID__ \
    VITE_USER_POOL_CLIENT_ID=__VITE_USER_POOL_CLIENT_ID__ \
    VITE_USER_POOL_DOMAIN=__VITE_USER_POOL_DOMAIN__ \
    VITE_COGNITO_OAUTH_REDIRECT_SIGN_IN=__VITE_COGNITO_OAUTH_REDIRECT_SIGN_IN__ \
    VITE_COGNITO_OAUTH_REDIRECT_SIGN_OUT=__VITE_COGNITO_OAUTH_REDIRECT_SIGN_OUT__

RUN npm run build

# ---- runtime --------------------------------------------------------------
# Runs as a non-root user and listens on 8080 by default.
FROM nginxinc/nginx-unprivileged:1.29-alpine

# The image's entrypoint renders templates/*.template into conf.d with
# envsubst, and runs docker-entrypoint.d scripts before starting nginx.
COPY docker/default.conf.template /etc/nginx/templates/default.conf.template
COPY --chmod=755 docker/50-inject-env.sh /docker-entrypoint.d/50-inject-env.sh

# Owned by nginx so the startup script can rewrite the placeholders; sed -i
# also needs the directory itself writable for its temp files.
USER root
RUN rm -rf /usr/share/nginx/html/* && chown nginx:nginx /usr/share/nginx/html
USER nginx

COPY --from=builder --chown=nginx:nginx /src/dist /usr/share/nginx/html

ENV PORT=8080

# Documentation only; the platform's injected PORT is what nginx binds to.
EXPOSE 8080
