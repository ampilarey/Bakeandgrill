#!/usr/bin/env bash
set -e

echo "Going to test site..."
cd /home/bakeandgrill/test.bakeandgrill.mv

echo "Pulling latest code from main..."
git pull origin main

echo "Going to backend..."
cd backend

echo "Installing Composer dependencies..."
composer install --no-dev --optimize-autoloader

echo "Ensuring storage symlink..."
php artisan storage:link --force 2>/dev/null || true

echo "Running migrations..."
php artisan migrate --force

echo "Caching Laravel config..."
php artisan config:cache

echo "Caching Laravel routes..."
php artisan route:cache

echo "Clearing Laravel views..."
php artisan view:clear

echo "Restarting Laravel queue..."
php artisan queue:restart

echo "Deployment completed successfully."
