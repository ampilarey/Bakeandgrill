FROM php:8.5-fpm-alpine

# Install system dependencies
RUN apk add --no-cache \
    git \
    curl \
    libpng-dev \
    libxml2-dev \
    zip \
    unzip \
    postgresql-dev \
    oniguruma-dev

# Install PHP extensions (including OPcache for production performance)
RUN docker-php-ext-install pdo pdo_pgsql mbstring exif pcntl bcmath gd opcache

# Install Composer
COPY --from=composer:latest /usr/bin/composer /usr/bin/composer

# Configure OPcache for production
RUN echo "opcache.enable=1\nopcache.memory_consumption=128\nopcache.max_accelerated_files=10000\nopcache.validate_timestamps=0" > /usr/local/etc/php/conf.d/opcache-prod.ini

# Set working directory
WORKDIR /var/www/html

# Copy existing application directory
COPY . /var/www/html

# Install dependencies
RUN composer install --no-dev --optimize-autoloader

# Set permissions
RUN chown -R www-data:www-data /var/www/html \
    && chmod -R 755 /var/www/html/storage

# Expose port
EXPOSE 8000

CMD ["php", "artisan", "serve", "--host=0.0.0.0", "--port=8000"]
