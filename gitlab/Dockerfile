# Minimal image for the OCX setup GitLab Function.
# Holds install.sh + entrypoint.sh + their runtime dependencies.
# GitLab step-runner extracts content and execs `command:` from func.yml.
FROM alpine:3.20

RUN apk add --no-cache \
    bash \
    ca-certificates \
    coreutils \
    curl \
    tar \
    xz

WORKDIR /func
COPY install.sh entrypoint.sh func.yml ./
RUN chmod +x /func/install.sh /func/entrypoint.sh
