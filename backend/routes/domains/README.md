# Domain route fragments

**Only `finance.php` is loaded in production.**

`bootstrap/app.php` registers `routes/api.php` only. That file `require`s `domains/finance.php` (line ~325) for finance routes that must register before wildcard `{id}` routes.

All other `*.php` files in this directory are **archived drafts** from an incomplete route split. They are **not** loaded and must not be edited as if they were live. New routes belong in `routes/api.php` (or wire a fragment here and add an explicit `require` in `api.php`).

When modularizing routes incrementally:

1. Extract a section from `api.php` into a new file here.
2. Add `require __DIR__ . '/domains/your-file.php';` in `api.php` at the correct position (static paths before wildcards).
3. Delete the old inline block from `api.php`.
4. Run `StaffRouteMiddlewareTest` and route list smoke checks.
