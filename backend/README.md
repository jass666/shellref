# shellref backend

The front end already has a browser-safe fallback, so the command library keeps working on a plain static preview. To make it shared across devices, deploy `worker.js` with Cloudflare D1 using `schema.sql`, expose it at the same origin as `/api/commands`, and set the runtime secret `ADMIN_EMAIL` to the owner email.

The API is intentionally small:

- `GET /api/commands` — public command list
- `POST /api/commands` — create or update, admin only
- `PUT /api/commands` — create or update, admin only
- `DELETE /api/commands?uid=...` — delete, admin only

The UI's **Command library** screen remains the only place most updates are needed. Export/import is still available as a backup and as a static-site publishing path.
