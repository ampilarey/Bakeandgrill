# Content & Branding — Catalog Inventory (2026-08-13)

Audit before/after the canonical component catalog work.

## Current content systems

| System | Storage | Admin surface |
|---|---|---|
| Content registry keys | `site_settings` via `config/content.php` | Brand & pages tasks / Content Hub editors |
| Page blocks | `page_blocks` + layout drafts | Surface Builder (Header/Home/Footer/Bottom nav) |
| Ops-owned mirrors | Delivery Settings / Business Details | Read-only `OpsOwnedSummary` in Hub |
| Legacy shared page content | `page_block_shared_contents` | Retired (`content_mode=shared` rejected) |

## Active surfaces (14)

| App | Desktop | Mobile |
|---|---|---|
| Website | header, home, footer | header, home, footer, bottom_navigation |
| Order App | header, home, footer | header, home, footer, bottom_navigation |

## Duplicates / overlaps found

1. **Surface card count ≠ editor rows** — cards counted enabled placements; editor showed the full slot type library (including “Not added”). **Fixed** via `canonicalCatalog.ts`.
2. **Registry keys ↔ page blocks** — e.g. `hero_slides` vs `hero` block (presentation dual-path; not auto-deleted).
3. **`shareable: true` flags** — leftover on dual-app registry keys; flagged in integrity `needs_review`.
4. **Ops-owned Contact keys** — already read-only (ownership PR); leftover app-scoped rows ignored by resolver.

## Operational settings in Content Hub

| Key | Owner | Hub behaviour |
|---|---|---|
| `delivery_threshold` | Delivery Settings | Read-only summary |
| Business phone/email/address/maps/WhatsApp/Viber/`site_name` | Business Details | Read-only summary |
| `delivery_time` | Still marketing copy | Editable (product decision) |
| Hours JSON | Online Ordering / ops | Business Details already linked read-only |

## Migration approach

- No destructive deletes.
- Canonical catalog is the Admin source of truth for surface counts and open-editor lists.
- Integrity API (`GET /api/admin/content/integrity`) reports leftovers as `needs_review`.
- Website and Order App customer content remain independent records (no shared fallback for presentation keys).

## Canonical identity

```
app · page · surface(slot) · viewport(device) · component_id · component_type
```

Example: `website.mobile.header.12` (prayer_bar instance #12).
