# Deploying the two frontends on Vercel

One Vercel project, two services, one domain. The backend is not part of this project (see "Backend" below).

| Service | Folder | Public path | Framework |
|---|---|---|---|
| `storefront` | `frontend/storefront` | everything except `/admin` | Next.js |
| `admin` | `frontend/admin` | `/admin` (the ERP and POS), plus `/billing` (the counter) | Vite single page app |

Config: [`frontend/vercel.json`](../frontend/vercel.json). Set the project's **Root Directory** to `frontend`, and keep **Include source files outside of the Root Directory** switched on: both apps use the workspace packages `@thunikart/ui` and `@thunikart/shared`.

## How `/admin` works
Vercel sends a service the original path, so the admin receives `/admin/assets/x.js`, not `/assets/x.js`.
The admin build is told its base with `VITE_BASE=/admin/` (in the service's `buildCommand`). Vite then writes the files to `dist/admin/`, so the paths match with no rewriting, and the service worker and web manifest are scoped to `/admin/`. A service rewrite sends any other `/admin/...` address to `/admin/index.html`, so a refreshed page or a bookmarked screen works.
Without `VITE_BASE` (local development, tests) nothing changes: the admin stays at the root of its own port.

## Environment variables (Project Settings)
The browser only ever talks to the Vercel site. `frontend/vercel.json` forwards `/api/v1/...` and `/shop/api/v1/...` to the backend on Catalyst, so the login cookies are first party and CORS is not involved. Change the backend address in `vercel.json` if it ever moves.

| Variable | Used by | Value |
|---|---|---|
| `VITE_API_URL` | admin | `/` (the same site; any real value switches off demo mode) |
| `VITE_STOREFRONT_URL` | admin | `/` |
| `NEXT_PUBLIC_API_URL` | storefront (browser) | `/shop` |
| `API_SERVER_URL` | storefront (server side rendering) | the backend's storefront address, for example `https://thunikart-api-50047658361.development.catalystappsail.in/shop` |
| `NEXT_PUBLIC_SITE_URL` | storefront | your Vercel address, for example `https://thunikart.vercel.app` |
| `NEXT_PUBLIC_RAZORPAY_KEY_ID`, `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | storefront | when payments and Google sign in are switched on |

**Do not leave any of these as `REPLACE_ME` or empty.** A placeholder switches the app into demo mode, with fake data and a fake payment window.

## Backend
The backend (Fastify, MongoDB, jobs, backups) is not a Vercel service. Run it on Catalyst AppSail and set, on the backend:
- `STOREFRONT_URL` and `ADMIN_URL` both to your Vercel address (address only, no `/admin`, no trailing slash). Requests arrive through the Vercel rewrite, so this matters little, but keep it correct for anything that calls the backend directly.
- Leave `COOKIE_DOMAIN` as `localhost` (the default). The login cookies then belong to the Vercel address only.
- The Razorpay and other webhooks call the backend's own Catalyst address directly, not the Vercel site.

## Services calling each other
Neither frontend calls the other on the server, and the backend is outside Vercel, so there are **no service bindings**.

## Local use
`start-local.ps1` runs everything on your computer (store 3000, admin 5180). `vercel dev` also works for the two frontends, but it serves the admin under `/admin` and expects `VITE_BASE=/admin/` for that.
