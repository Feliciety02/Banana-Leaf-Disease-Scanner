# Production account setup

The website and Android app use the same Laravel accounts. The website uses a
first-party Sanctum session cookie; Android stores a scoped API token in Expo
SecureStore. Password reset and email verification need a working mail service.

## Backend

Deploy Laravel behind HTTPS with a persistent database. Set a unique `APP_KEY`,
`APP_ENV=production`, `APP_DEBUG=false`, and `APP_URL=https://your-domain`.
Run the database migrations before accepting sign-ins. Keep `SESSION_DRIVER=database`
and `SESSION_ENCRYPT=true`; password changes and resets remove other stored
sessions from the database. Set `SESSION_SECURE_COOKIE=true`,
`SESSION_HTTP_ONLY=true`, and `SESSION_SAME_SITE=lax`.

Set `SANCTUM_STATEFUL_DOMAINS` to the browser host, including its port only if
one appears in the browser URL. Set `WEB_FRONTEND_ORIGINS` to the exact website
HTTPS origin. Serve the website's `/api` and `/sanctum` paths through the same
HTTPS origin to Laravel. Keep `VITE_WEB_API_URL=/api` in the website build.

Configure a real mail transport and sender (`MAIL_MAILER`, `MAIL_HOST`,
`MAIL_PORT`, `MAIL_USERNAME`, `MAIL_PASSWORD`, `MAIL_FROM_ADDRESS`). Test both
verification and password-reset email delivery from the deployed host. The
development `MAIL_MAILER=log` setting does not deliver mail to users.

Set `SANCTUM_TOKEN_TTL_MINUTES` and `SANCTUM_TOKEN_REMEMBER_DAYS` for mobile
tokens. Normal tokens default to 24 hours; remembered tokens default to 30
days. Both receive their own expiry when issued.

## Android

For a managed release, set `EXPO_PUBLIC_API_URL=https://your-domain/api` in
the build environment. For an already installed APK without an address, open
**Account → Server address** and enter `https://your-domain`. The app validates
`/api/health`, saves the address on the device, and then enables login and sign
up. Android production builds require HTTPS. A phone cannot reach a server
bound only to `127.0.0.1` on a development computer.

The locally built `app-release.apk` uses the project's debug signing key. Use
the production EAS signing profile and the [Google Play release handoff](google-play-release.md)
for distribution.


### Quick test profiles

`start-free-test.ps1` enables three login-only shortcuts (Farmer, Reviewer, Admin) on web and mobile. Each uses the normal login API with a seeded `dahonmd.test` account. The script creates missing profiles only in its isolated test database; it does not reset existing passwords or remove users.

These shortcuts are for the shared test environment. Anyone with its link or test APK can use these demo accounts, including the demo administrator. Use sample data there. Standard builds omit the shortcuts unless `VITE_TEST_PROFILES=true` (web) or `EXPO_PUBLIC_TEST_PROFILES=true` (mobile) is explicitly set. Leave both unset for production.


### Mobile flow behavior

- Connection failures show Retry and Update connection. Reachability is checked again every 30 seconds while online and unavailable; submitted mutations are never retried automatically. A new temporary tunnel address still must come from the computer automation or be entered explicitly.
- Farmers return to the initiating screen after login. Ask Dahon reopens after authentication. Admins start in their mobile tools; reviewers get an Open website action (browser sign-in remains separate).
- New scan results show saving/saved state, a save retry on failure, and a shortcut to the saved record. Saved records offer sync, review preparation, and review progress.
- The first farmer login with guest scans offers Add existing scans or Keep on this phone. The choice is remembered for that account email in sync_state, so temporary tunnel address changes do not ask again. Individual guest scans can also be added from History. Photos require a separate appeal/review request or research consent.
- History offers a Reviewed filter and Check for review updates. No estimated review turnaround is invented.
- Login/signup drafts survive mode changes in memory on mobile and web. Closing a populated form asks before discarding; successful authentication or confirmed closure clears it. Mobile navigation also warns about unsaved scan input and review notes.
- Session expiry leaves unsynchronized account records attached to their original owner for recovery after login; it does not make them guest records.
