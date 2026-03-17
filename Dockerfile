# ── Stage 1: Build ──────────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ── Stage 2: Serve ──────────────────────────────────────────────
FROM nginx:1.27-alpine
# Remove default nginx site
RUN rm /etc/nginx/conf.d/default.conf
# Copy our nginx config
COPY nginx.conf /etc/nginx/conf.d/localstack-ui.conf
# Copy built assets
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
