# Thunikart Android apps

Two installable apps (APK files) that open the live websites in a Trusted Web Activity (Chrome without its address bar):

| App | File | Opens |
|---|---|---|
| Thunikart Admin | `thunikart-admin.apk` | https://thunicart-frontend.vercel.app/admin/ (admin, stock, Billing center) |
| Thunikart | `thunikart-shop.apk` | https://thunicart-frontend.vercel.app/ (customer shop) |

## Get the APK
GitHub builds them (`.github/workflows/android.yml`): Actions tab, **Android apps**, **Run workflow**. It also runs when this folder changes.
When it finishes, the files are on the release **android-latest**: `https://github.com/<owner>/<repo>/releases/tag/android-latest`.
Open that link on the phone, tap the APK, and allow "Install unknown apps" for the browser when Android asks.

The apps load the live site, so a website update shows at once. Rebuild the APK only if this folder changes (icon, name, address).

## No address bar
Chrome hides the address bar only when the site confirms the app belongs to it. That file is
`frontend/storefront/public/.well-known/assetlinks.json` (served at `https://thunicart-frontend.vercel.app/.well-known/assetlinks.json`) and holds the
fingerprint of `thunikart.p12`. If the site is deployed with that file, the app is full screen. Without it the app still works but shows a thin bar at the top.

## Signing key
`thunikart.p12` (password `thunikart`, alias `thunikart`) signs both apps and every update, so new versions install over old ones.
It is committed so the build works without setup. That is fine for apps you install yourself. **Before publishing on Google Play,
make a private key, keep it as a GitHub secret, and update the fingerprint in `assetlinks.json`.**
If the key is ever replaced, uninstall the old app first and update the fingerprint.

## Change the address, name or icon
`app/build.gradle` defaults and the matrix in `.github/workflows/android.yml` hold the address, name and package. The icon is
`app/src/main/res/mipmap-xxxhdpi/ic_launcher.png`.
