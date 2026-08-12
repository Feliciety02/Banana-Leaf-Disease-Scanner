FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG VITE_WEB_API_URL=/api
ARG VITE_CONFIDENCE_THRESHOLD=70
ENV VITE_WEB_API_URL=$VITE_WEB_API_URL
ENV VITE_CONFIDENCE_THRESHOLD=$VITE_CONFIDENCE_THRESHOLD

RUN npm run build

FROM nginx:1.27-alpine

COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://127.0.0.1/ || exit 1
