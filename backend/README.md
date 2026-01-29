# Bake & Grill - Opening Soon (Laravel)

> **Laravel-based "Opening Soon" page for bakeandgrill.mv - Ready for future POS system expansion**

## 🎯 What This Is

This is a **Laravel project** that contains your "Opening Soon" page. Instead of just uploading static HTML files, this gives you a proper Laravel foundation that you can expand later with the full Bake & Grill POS system.

## ✨ Features

- ✅ **"Opening Soon"** page with countdown timer
- ✅ **Dhivehi text**: "އަސްލު ދިވެހި ރަހަ"  
- ✅ **Custom logo** with baking theme
- ✅ **Responsive design** for all devices
- ✅ **Professional styling** with orange gradient
- ✅ **Laravel foundation** ready for expansion

## 🚀 Quick Start

### Local Development
```bash
cd /Users/vigani/Website/bakeandgrill-laravel

# Install dependencies (if not already done)
composer install

# Start local server
php artisan serve
```

Visit: `http://localhost:8000`

### Production Deployment
See `DEPLOYMENT_GUIDE.md` for complete deployment instructions to bakeandgrill.mv.

## 📁 Project Structure

```
bakeandgrill-laravel/
├── app/Http/Controllers/
│   └── OpeningSoonController.php    # Handles opening soon page
├── public/
│   └── logo.svg                     # Your logo (accessible at /logo.svg)
├── resources/views/
│   └── opening-soon.blade.php      # Main page template
├── routes/web.php                   # Routes (main route: /)
└── .env                            # Environment configuration
```

## ⚙️ Configuration

### Routes
- `GET /` → Shows opening soon page

### Environment
- `APP_URL=https://bakeandgrill.mv`
- `APP_NAME="Bake & Grill"`
- `APP_ENV=production` (for live site)

## 🔧 Customization

### Update Opening Date
Edit `resources/views/opening-soon.blade.php`:
```javascript
const openingDate = new Date('2025-03-01T00:00:00').getTime();
```

### Contact Information
Update contact details in the same file:
- Phone: `+960 700-0000`
- Email: `contact@bakeandgrill.mv`
- Location: `Malé, Republic of Maldives`

## 🔮 Future Expansion

This Laravel setup makes it super easy to add the full POS system later:

1. **No additional setup** - Laravel is already configured
2. **Just add controllers** for POS features
3. **Run migrations** for database structure
4. **Add routes** for new functionality
5. **Use same asset management** for images, CSS, JS

## 📋 Next Steps

1. **Deploy to bakeandgrill.mv** (see DEPLOYMENT_GUIDE.md)
2. **Customize** opening date and contact info if needed
3. **Test** on live domain
4. **Later**: Add full POS system features

---

**Ready for deployment and future expansion!** 🎉