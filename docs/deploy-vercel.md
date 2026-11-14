# Deploying the two frontends on Vercel

One Vercel project, two services, one domain. The backend is not part of this project (see "Backend" below).

| Service | Folder | Public path | Framework |
|---|---|---|---|
| `storefront` | `frontend/storefront` | everything except `/admin` | Next.js |
| `admin` | `frontend/admin` | `/admin` (the ERP, POS and `/admin/billing` counter) | Vite single page app |

Config: [`frontend/vercel.json`](../frontend/vercel.json). Set the project's **Root Directory** to `frontend`, and keep **Include source files outside of the Root Directory** switched on: both apps use the workspace packages `@thunikart/ui` and `@thunikart/shared`.

## How `/admin` works
Vercel sends a service the original path, so the admin receives `/admin/assets/x.js`, not `/assets/x.js`.
The admin build is told its base with `VITE_BASE=/admin/` (in the service's `buildCommand`). Vite then writes the files to `dist/admin/`, so the paths match with no rewriting, and the service worker and web manifest are scoped to `/admin/`. A service rewrite sends any other `/admin/...` address to `/admin/index.html`, so a refreshed page or a bookmarked screen works.
Without `VITE_BASE` (local development, tests) nothing changes: the admin stays at the root of its own port.

## Environment variables (Project Settings)
| Variable | Used by | Value |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | storefront | the backend's storefront address, ending in `/shop` (for example `https://api.example.com/shop`) |
| `NEXT_PUBLIC_SITE_URL` | storefront | the public domain, for example `https://shop.example.com` |
| `VITE_API_URL` | admin | the backend's address, for example `https://api.example.com` |
| `VITE_STOREFRONT_URL` | admin | the public domain (the store is at its root) |
| `NEXT_PUBLIC_RAZORPAY_KEY_ID`, `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | storefront | when payments and Google sign in are switched on |

**Do not leave any of these as `REPLACE_ME`.** A placeholder switches the app into demo mode, with fake data and a fake payment window.

## Backend
The backend (Fastify, MongoDB, jobs, backups) is not a Vercel service here. Run it where it already runs and set, on the backend:
- `ADMIN_URL` and `STOREFRONT_URL` both to the public domain (browsers check the origin only, so `/admin` is not part of it).
- Cookies: if the backend is on a different registrable domain from the frontends, its login cookies are third party cookies and need `SameSite=None; Secure`. Putting the backend on a subdomain of the same domain avoids the problem.

## Services calling each other
Neither frontend calls the other on the server, and the backend is outside Vercel, so there are **no service bindings**.

## Local use
`start-local.ps1` runs everything on your computer (store 3000, admin 5180). `vercel dev` also works for the two frontends, but it serves the admin under `/admin` and expects `VITE_BASE=/admin/` for that.
