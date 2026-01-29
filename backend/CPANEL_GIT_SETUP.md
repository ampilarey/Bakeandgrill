# cPanel Git Deploy Setup Guide

## SSH Key Information

**Repository URL**: `git@github.com:ampilarey/Bakeandgrill.git`  
**Branch**: `main`

### Deploy Key (for cPanel SSH)
```
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAID6G6F+RU1jU31+dEoutUvtX9uyOWjgk7vXO+/81jBkw bakeandgrill-deploy-key
```

## cPanel Setup Steps

### Step 1: Access Git Version Control
1. Login to cPanel
2. Look for **"Git Version Control"** (in Software section)
3. Click on it

### Step 2: Create Repository
1. Click **"Create"** button
2. **Repository Path**: `bakeandgrill` (or leave empty for root)
3. **Repository URL**: `git@github.com:ampilarey/Bakeandgrill.git`
4. Click **"Create"**

### Step 3: Add SSH Key (if needed)
If cPanel asks for SSH key setup:
1. Go to **"SSH Access"** in cPanel
2. Add the deploy key if requested

### Step 4: Clone/Pull Repository
1. In Git Version Control, click on your repository
2. Click **"Pull or Deploy"**
3. Make sure **"main"** branch is selected
4. Click **"Deploy HEAD Commit"**

### Step 5: Set Document Root
1. Go to **"Domains"** in cPanel
2. Find **bakeandgrill.mv**
3. Change **"Document Root"** to:
   ```
   /home/yourusername/public_html/bakeandgrill/public
   ```

### Step 6: Configure Environment
1. In File Manager, navigate to `public_html/bakeandgrill/`
2. Copy `.env.example` to `.env`
3. Edit `.env` with production settings:
   ```env
   APP_NAME="Bake & Grill"
   APP_ENV=production
   APP_DEBUG=false
   APP_URL=https://bakeandgrill.mv
   ```

### Step 7: Set Permissions
1. Right-click `storage` folder → Permissions → 755
2. Right-click `bootstrap/cache` folder → Permissions → 755

## Troubleshooting

### If Git Clone Fails
- Check that deploy key is added to GitHub with write access
- Verify repository URL is correct
- Make sure your hosting supports Git

### If Laravel Doesn't Load
- Verify document root points to `/public` folder
- Check file permissions (755 for folders, 644 for files)
- Ensure `.env` file exists and is configured

### For Future Updates
1. Go to **Git Version Control**
2. Click on your repository
3. Click **"Pull or Deploy"**
4. Select latest commit and deploy

Your site will be live at: https://bakeandgrill.mv
