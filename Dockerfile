# Build stage
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

# Serve stage: static files behind nginx
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 5817
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:5817/ >/dev/null || exit 1
