## Stages 7–10 — Content Studio optional backlog

Shipped as additive enhancements after Stage 6. Branch: `content/studio-backlog-7-10`.

### Stage 7 — Revision restore
- Table `content_revisions` (`key`, `scope`, `locale`, `value`, `user_id`, `created_at`)
- Every successful content write snapshots the **previous** value
- `GET /api/admin/content/{key}/revisions?scope=&locale=`
- `POST /api/admin/content/{key}/revisions/{id}/restore`
- Content Studio: History panel + Restore

### Stage 8 — Scheduled publish
- Table `content_schedules` (`key`, `scope`, `locale`, `value`, `publish_at`, `status`, …)
- `POST /api/admin/content/schedule` — queue pending changes for a future time
- `GET /api/admin/content/schedules`, `DELETE /api/admin/content/schedules/{id}`
- Artisan `content:publish-scheduled` every minute (routes/console.php)
- Content Studio: Schedule publish datetime + pending list

### Stage 9 — Multi-language (en / dv)
- `site_settings.locale` (default `en`), unique `(key, scope, locale)`
- Resolver + public `GET /api/content?app=&locale=`
- Content Studio language tab; order-app fetches content for active UI language when available

### Stage 10 — Import / export
- `GET /api/admin/content/export` → JSON bundle
- `POST /api/admin/content/import` → apply bundle (creates revisions)
- Content Studio: Export / Import buttons

### Commit boundary
Prefer one commit per stage, or a single commit if shipping together:
`content: revisions, schedules, locales, import/export (Stages 7–10)`.
