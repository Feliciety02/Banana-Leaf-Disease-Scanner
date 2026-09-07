FROM composer:2 AS composer

FROM php:8.3-cli-alpine

RUN apk add --no-cache \
        curl \
        libjpeg-turbo-dev \
        libpng-dev \
        libwebp-dev \
        icu-dev \
        libxml2-dev \
        libzip-dev \
        oniguruma-dev \
        sqlite-dev \
        su-exec \
    && docker-php-ext-configure gd --with-jpeg --with-webp \
    && docker-php-ext-install -j"$(nproc)" \
        dom \
        exif \
        gd \
        intl \
        mbstring \
        pcntl \
        pdo_sqlite \
        zip

COPY --from=composer /usr/bin/composer /usr/bin/composer

WORKDIR /var/www/html

COPY composer.json composer.lock ./
RUN composer install \
    --no-dev \
    --no-interaction \
    --no-progress \
    --no-scripts \
    --optimize-autoloader \
    --prefer-dist

COPY . .
RUN composer dump-autoload --no-dev --optimize \
    && mkdir -p storage/framework/cache storage/framework/sessions storage/framework/views bootstrap/cache \
    && chown -R www-data:www-data storage bootstrap/cache

COPY docker/entrypoint.sh /usr/local/bin/dahonmd-entrypoint
RUN chmod +x /usr/local/bin/dahonmd-entrypoint

EXPOSE 8001

ENTRYPOINT ["dahonmd-entrypoint"]
CMD ["php", "artisan", "serve", "--host=0.0.0.0", "--port=8001"]
