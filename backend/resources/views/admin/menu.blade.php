@extends('layout')

@section('title', 'Manage Menu - Bake & Grill')

@section('styles')
<style>
    .admin-container { max-width: 900px; margin: 2rem auto; padding: 0 2rem; }
    .admin-card { background: white; border: 1px solid var(--border); border-radius: 16px; padding: 1.5rem; margin-bottom: 1.5rem; box-shadow: 0 2px 8px rgba(0,0,0,0.04); }
    .admin-card h2 { font-size: 1.25rem; margin-bottom: 1rem; color: var(--dark); }
    .admin-login input { width: 100%; padding: 0.75rem; border: 1px solid var(--border); border-radius: 8px; margin-bottom: 0.75rem; }
    .admin-login button { width: 100%; padding: 0.75rem; background: var(--teal); color: white; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; }
    .admin-login button:hover { background: var(--teal-hover); }
    .admin-logout { margin-bottom: 1rem; }
    .admin-logout button { padding: 0.5rem 1rem; background: #f8f9fa; border: 1px solid var(--border); border-radius: 8px; cursor: pointer; font-size: 0.9rem; }
    .item-row { display: flex; align-items: center; justify-content: space-between; padding: 0.75rem 0; border-bottom: 1px solid #f0f0f0; gap: 1rem; }
    .item-row:last-child { border-bottom: none; }
    .item-name { font-weight: 600; color: var(--dark); }
    .item-meta { font-size: 0.85rem; color: #636e72; }
    .item-delete { padding: 0.35rem 0.75rem; background: #fee2e2; color: #b91c1c; border: none; border-radius: 6px; cursor: pointer; font-size: 0.85rem; }
    .item-delete:hover { background: #fecaca; }
    .add-form label { display: block; margin-bottom: 0.35rem; font-weight: 500; font-size: 0.9rem; }
    .add-form input, .add-form select { width: 100%; padding: 0.6rem; border: 1px solid var(--border); border-radius: 8px; margin-bottom: 1rem; }
    .add-form button { padding: 0.75rem 1.5rem; background: var(--teal); color: white; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; }
    .add-form button:hover { background: var(--teal-hover); }
    .msg { padding: 0.75rem; border-radius: 8px; margin-bottom: 1rem; }
    .msg.success { background: #d1fae5; color: #065f46; }
    .msg.error { background: #fee2e2; color: #b91c1c; }
</style>
@endsection

@section('content')
<div class="admin-container">
    <div class="admin-card">
        <h2>Manage menu (add / delete items)</h2>
        <p style="color: #636e72; font-size: 0.95rem; margin-bottom: 1rem;">Staff login required. Use your PIN and a device ID (e.g. POS-001).</p>

        <div id="admin-login-box" class="admin-login" style="max-width: 320px;">
            <input type="password" id="admin-pin" placeholder="Staff PIN" maxlength="10" autocomplete="off" />
            <input type="text" id="admin-device" placeholder="Device ID (e.g. POS-001)" value="ADMIN-001" />
            <button type="button" id="admin-login-btn">Log in</button>
        </div>

        <div id="admin-content" style="display: none;">
            <div class="admin-logout">
                <button type="button" id="admin-logout-btn">Log out</button>
            </div>
            <div id="admin-msg"></div>

            <div class="admin-card">
                <h2>Add new item</h2>
                <form id="add-item-form" class="add-form">
                    <label for="new-category">Category *</label>
                    <select id="new-category" required></select>
                    <label for="new-name">Item name *</label>
                    <input type="text" id="new-name" required placeholder="e.g. Chicken Burger" />
                    <label for="new-price">Price (MVR) *</label>
                    <input type="number" id="new-price" step="0.01" min="0" required placeholder="25.00" />
                    <label for="new-description">Description (optional)</label>
                    <input type="text" id="new-description" placeholder="Short description" />
                    <button type="submit">Add item</button>
                </form>
            </div>

            <div class="admin-card">
                <h2>Existing items</h2>
                <p id="items-loading" style="color: #636e72;">Loading…</p>
                <div id="items-list"></div>
            </div>
        </div>
    </div>
</div>

<script>
(function() {
    const API = '/api';
    const TOKEN_KEY = 'admin_staff_token';

    function getToken() { return sessionStorage.getItem(TOKEN_KEY); }
    function setToken(t) { if (t) sessionStorage.setItem(TOKEN_KEY, t); else sessionStorage.removeItem(TOKEN_KEY); }

    function showMsg(text, isError) {
        const el = document.getElementById('admin-msg');
        el.className = 'msg ' + (isError ? 'error' : 'success');
        el.textContent = text;
    }

    async function api(method, path, body) {
        const opts = { method, headers: { 'Content-Type': 'application/json' } };
        const token = getToken();
        if (token) opts.headers['Authorization'] = 'Bearer ' + token;
        if (body) opts.body = JSON.stringify(body);
        const r = await fetch(API + path, opts);
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.message || data.error || 'Request failed');
        return data;
    }

    document.getElementById('admin-login-btn').onclick = async function() {
        const pin = document.getElementById('admin-pin').value.trim();
        const device = document.getElementById('admin-device').value.trim() || 'ADMIN-001';
        if (!pin) { showMsg('Enter your PIN', true); return; }
        try {
            const res = await api('POST', '/auth/staff/pin-login', { pin, device_identifier: device });
            setToken(res.token);
            document.getElementById('admin-login-box').style.display = 'none';
            document.getElementById('admin-content').style.display = 'block';
            loadCategories();
            loadItems();
        } catch (e) {
            showMsg(e.message || 'Login failed', true);
        }
    };

    document.getElementById('admin-logout-btn').onclick = function() {
        setToken(null);
        document.getElementById('admin-login-box').style.display = 'block';
        document.getElementById('admin-content').style.display = 'none';
        document.getElementById('admin-pin').value = '';
    };

    if (getToken()) {
        document.getElementById('admin-login-box').style.display = 'none';
        document.getElementById('admin-content').style.display = 'block';
        loadCategories();
        loadItems();
    }

    let categories = [];
    async function loadCategories() {
        try {
            const res = await fetch(API + '/categories');
            const data = await res.json();
            categories = (data.data || data.categories || data) || [];
            const sel = document.getElementById('new-category');
            sel.innerHTML = '<option value="">Select category</option>' +
                categories.map(c => '<option value="' + c.id + '">' + (c.name || c.title) + '</option>').join('');
        } catch (e) {
            document.getElementById('new-category').innerHTML = '<option value="">Failed to load categories</option>';
        }
    }

    async function loadItems() {
        const listEl = document.getElementById('items-list');
        const loadingEl = document.getElementById('items-loading');
        loadingEl.style.display = 'block';
        listEl.innerHTML = '';
        try {
            const res = await fetch(API + '/items?per_page=200');
            const data = await res.json();
            const items = data.data || [];
            loadingEl.style.display = 'none';
            if (items.length === 0) {
                listEl.innerHTML = '<p style="color:#636e72;">No items yet. Add one above.</p>';
                return;
            }
            const catMap = {};
            categories.forEach(c => { catMap[c.id] = c.name || c.title || ''; });
            items.forEach(item => {
                const row = document.createElement('div');
                row.className = 'item-row';
                row.innerHTML = '<div><span class="item-name">' + escapeHtml(item.name) + '</span><br><span class="item-meta">' +
                    (catMap[item.category_id] || '') + ' · MVR ' + (item.base_price != null ? Number(item.base_price).toFixed(2) : '0') + '</span></div>' +
                    '<button type="button" class="item-delete" data-id="' + item.id + '" data-name="' + escapeHtml(item.name) + '">Delete</button>';
                listEl.appendChild(row);
            });
            listEl.querySelectorAll('.item-delete').forEach(btn => {
                btn.onclick = function() { deleteItem(Number(this.dataset.id), this.dataset.name); };
            });
        } catch (e) {
            loadingEl.style.display = 'none';
            listEl.innerHTML = '<p class="msg error">Failed to load items.</p>';
        }
    }

    function escapeHtml(s) {
        const div = document.createElement('div');
        div.textContent = s;
        return div.innerHTML;
    }

    async function deleteItem(id, name) {
        if (!confirm('Delete “‘ + name +’”?')) return;
        try {
            await api('DELETE', '/items/' + id);
            showMsg('Item deleted.');
            loadItems();
        } catch (e) {
            showMsg(e.message || 'Delete failed', true);
        }
    }

    document.getElementById('add-item-form').onsubmit = async function(e) {
        e.preventDefault();
        const categoryId = document.getElementById('new-category').value;
        const name = document.getElementById('new-name').value.trim();
        const basePrice = document.getElementById('new-price').value.trim();
        if (!categoryId || !name || !basePrice) return;
        try {
            await api('POST', '/items', {
                category_id: Number(categoryId),
                name: name,
                base_price: Number(basePrice),
                description: document.getElementById('new-description').value.trim() || null
            });
            showMsg('Item added.');
            document.getElementById('new-name').value = '';
            document.getElementById('new-price').value = '';
            document.getElementById('new-description').value = '';
            loadItems();
        } catch (e) {
            showMsg(e.message || 'Add failed', true);
        }
    };
})();
</script>
@endsection
