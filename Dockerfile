# 1. Build the web app and regenerate the data the Go binary embeds
FROM node:22-alpine AS web
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npx tsx scripts/export-go-data.ts && npm run build

# 2. One static binary with the app inside it
FROM golang:1.24-alpine AS bin
WORKDIR /src
COPY go/ ./
COPY --from=web /app/go/data ./data
COPY --from=web /app/dist ./web
RUN CGO_ENABLED=0 go build -trimpath -ldflags "-s -w" -o /dwell .

# 3. Nothing but the binary. Diagrams are kept in /data so they survive the container.
FROM alpine:3.20
RUN adduser -D -u 10001 dwell && mkdir /data && chown dwell /data
COPY --from=bin /dwell /usr/local/bin/dwell
USER dwell
VOLUME /data
EXPOSE 5817
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:5817/api/diagrams >/dev/null || exit 1
ENTRYPOINT ["dwell", "--dir", "/data", "--host", "0.0.0.0"]
