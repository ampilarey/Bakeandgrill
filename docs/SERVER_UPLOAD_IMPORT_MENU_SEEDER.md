# Upload ImportMenuSeeder to server

The server is missing `ImportMenuSeeder.php` and `export_items.csv`. Upload both so the menu seeder can run.

## Option 1: Upload from your computer (recommended)

1. On your computer, open the **Bake&Grill** project folder.
2. In cPanel **File Manager**, go to:  
   `test.bakeandgrill.mv` → `backend` → `database` → `seeders`
3. Upload these two files from your project into that `seeders` folder:
   - `backend/database/seeders/ImportMenuSeeder.php`
   - `backend/database/seeders/export_items.csv`

## Option 2: Create the file on the server

If you can't upload from your computer:

1. In File Manager go to:  
   `test.bakeandgrill.mv` → `backend` → `database` → `seeders`
2. Create a new file named **ImportMenuSeeder.php**.
3. Copy the full contents from **docs/ImportMenuSeeder_for_server.php** in this repo and paste into the new file. Save.
4. You still need **export_items.csv** in the same folder (upload or create from `backend/database/seeders/export_items.csv`).

## Then run on the server (SSH)

```bash
cd /home/bakeandgrill/test.bakeandgrill.mv/backend
php artisan db:seed --class=ImportMenuSeeder --force
```
