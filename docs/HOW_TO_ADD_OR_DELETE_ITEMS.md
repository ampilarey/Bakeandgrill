# How to Add or Delete Menu Items

## Option 1: Admin page (easiest)

1. **Open the admin page**
   - Main site: **http://localhost:8000/admin** (or your domain `/admin`)

2. **Log in (staff)**
   - Enter your **staff PIN** (e.g. the one you use for POS: 1111, 2222, etc.)
   - Device ID can stay as **ADMIN-001** (or use e.g. POS-001)
   - Click **Log in**

3. **Add an item**
   - Choose a **Category**
   - Enter **Item name** and **Price (MVR)**
   - Optionally add a description
   - Click **Add item**

4. **Delete an item**
   - Find the item in the list
   - Click **Delete** and confirm

---

## Option 2: API (curl / Postman)

You need a **staff token** first, then call the item endpoints.

### 1. Get staff token

```bash
curl -X POST http://localhost:8000/api/auth/staff/pin-login \
  -H "Content-Type: application/json" \
  -d '{"pin":"1111","device_identifier":"POS-001"}'
```

Use the `token` from the response in the next steps.

### 2. Add an item

```bash
curl -X POST http://localhost:8000/api/items \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "category_id": 1,
    "name": "New Item Name",
    "base_price": 25.00,
    "description": "Optional description"
  }'
```

Required: `name`, `base_price`. Optional: `category_id`, `name_dv`, `description`, `sku`, `barcode`, `image_url`, `cost`, `tax_rate`, `is_active`, `is_available`, `sort_order`, `modifier_ids`.

### 3. Update an item

```bash
curl -X PATCH http://localhost:8000/api/items/123 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"name":"Updated name","base_price":30}'
```

### 4. Delete an item (soft delete)

```bash
curl -X DELETE http://localhost:8000/api/items/123 \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### 5. List categories (to get category_id)

```bash
curl http://localhost:8000/api/categories
```

---

## Categories: add or delete

Categories also use the API (staff token required):

- **Add:** `POST /api/categories` with `{"name":"Category Name"}`
- **Update:** `PATCH /api/categories/{id}` with `{"name":"New Name"}`
- **Delete:** `DELETE /api/categories/{id}`

The admin page at `/admin` currently only manages **items**; categories can be managed via API or we can add category management to the admin page later.
