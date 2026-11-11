# Third party accounts and who owns them

| Service | Used for | Owner (to confirm) | Cost / note |
|---|---|---|---|
| Zoho Catalyst | Hosting (AppSail), cron, custom domain and SSL | Client account, GrowaLabs has access | Included in the first year of the project cost |
| MongoDB Atlas | Database (replica set) | Client account | Dedicated database user for the app; backups also go to B2 |
| Backblaze B2 | Media bucket (public) and backups bucket (private, versioned) | Client account | Application key limited to the two buckets |
| Razorpay | Online payments, webhook | **Client** (fees paid by the client only) | Live keys and webhook secret |
| Shiprocket | Shipping and reverse pickup | **Client** | Webhook token = `CRON_SECRET`-style secret set in their panel |
| Brevo | Customer login codes and order emails | Client (free tier) | Verified sender address |
| Google Cloud (OAuth) | "Sign in with Google" | Client, optional | Client id and secret |
| GitHub | Code, CI, container registry | GrowaLabs / client org | Image is `ghcr.io/<owner>/<repo>/backend` |
| Domain registrar | The shop domain | **Client** | Needed for the custom domain mapping |
| Sentry (optional) | Error tracking | GrowaLabs | `SENTRY_DSN` is read from the environment; wire an SDK if wanted |

Support: GrowaLabs provides lifetime support for bug fixes and staff help; extra features are quoted separately.
