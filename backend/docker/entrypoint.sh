#!/bin/sh
set -eu

data_dir="${DOCKER_DATA_DIR:-/var/www/html/.docker-data}"
key_file="$data_dir/app-key"
database_file="${DB_DATABASE:-$data_dir/database.sqlite}"
seed_database=false

mkdir -p "$data_dir" "$(dirname "$database_file")"

if [ ! -s "$database_file" ]; then
    seed_database=true
fi

touch "$database_file"

if [ -z "${APP_KEY:-}" ]; then
    if [ ! -s "$key_file" ]; then
        php -r 'echo "base64:" . base64_encode(random_bytes(32));' > "$key_file"
    fi

    APP_KEY="$(cat "$key_file")"
    export APP_KEY
fi

chown -R www-data:www-data "$data_dir" storage bootstrap/cache

su-exec www-data php artisan migrate --force --no-interaction

if [ "$seed_database" = true ]; then
    su-exec www-data php artisan db:seed --force --no-interaction
fi

exec su-exec www-data "$@"
