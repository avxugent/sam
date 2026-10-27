---
title: "Authentication & Roles"
sync_to_confluence: true
---

# Authentication & Roles

SAM uses **NextAuth v5** with a **JWT session strategy** (no database sessions).

---

## Session

- **Strategy**: JWT
- **Max age**: 8 hours (`maxAge: 8 * 60 * 60`)
- Sessions are verified on every authenticated request

---

## Authentication Providers

### Local Credentials

Email + bcrypt-hashed password. Available to all users except SSO-only accounts.

- Password hashing: bcrypt cost **13**
- SSO users have `passwordHash = null` and are rejected by the Credentials provider
- Password reset is available via email token (requires SMTP configuration)

### Microsoft Entra ID (SSO)

OAuth2 via Microsoft's Entra ID (formerly Azure AD). Activated when all three env vars are set:

```dotenv
AUTH_MICROSOFT_ENTRA_ID_ID="<client-id>"
AUTH_MICROSOFT_ENTRA_ID_SECRET="<client-secret>"
AUTH_MICROSOFT_ENTRA_ID_ISSUER="https://login.microsoftonline.com/<tenant-id>/v2.0"
```

When SSO is configured, a "Sign in with Microsoft" button appears on the login page alongside the local credentials form. Local login always remains available.

**SSO user provisioning:**
- First SSO login auto-creates a user account with **Viewer** role
- An Admin must promote them in **Administration → Users**
- SSO users cannot have a local password set (the `PUT /api/users/[id]` endpoint rejects password changes for SSO accounts)

#### Azure App Registration

1. In [Entra admin centre](https://entra.microsoft.com) → App registrations → New registration
2. Platform: **Web** (not SPA — critical)
3. Redirect URI: `https://<your-domain>/api/auth/callback/microsoft-entra-id`
   - For local dev also add: `http://localhost:3000/api/auth/callback/microsoft-entra-id`
4. Copy **Application (client) ID** → `AUTH_MICROSOFT_ENTRA_ID_ID`
5. Copy **Directory (tenant) ID** → build the issuer URL
6. Certificates & secrets → New client secret → copy **Value** → `AUTH_MICROSOFT_ENTRA_ID_SECRET`

---

## Two-Factor Authentication (2FA)

Two second-factor methods are supported, either of which satisfies the same `needs2FA`/`needs2FASetup` gates: TOTP (Time-based One-Time Password, compatible with Google Authenticator, Authy, etc.) and WebAuthn passkeys (Touch ID, Windows Hello, security keys).

### User flow

1. User enables a second factor in **Settings → Two-Factor Authentication** — either scan a QR code with an authenticator app and verify the first code, or register a passkey.
2. On subsequent logins: credentials accepted → 2FA challenge page (`/login/2fa`) → TOTP code or "Use a passkey instead" → session granted.

Both paths converge on the same internal NextAuth `credentials-2fa-verified` provider (`lib/auth.ts`), which re-issues a clean session without the `needs2FA` claim — `proxy.ts` and the `jwt`/`session` callbacks don't need to know which method was used.

The route handlers reach that provider only through `upgradeSession()` (`lib/two-factor/session-upgrade.ts`). Like every NextAuth credentials provider it is also reachable over HTTP at `/api/auth/callback/credentials-2fa-verified`, so it never trusts a bare `userId`: `authorize` requires a 60-second, server-signed upgrade proof (`lib/two-factor/upgrade-proof.ts`, HS256 with `NEXTAUTH_SECRET`, its own audience so a remember-device token cannot stand in) that `upgradeSession()` mints and that never leaves the server. If the provider refuses (e.g. the account was deleted or became SSO-only since login), the verify/enable routes answer `401` instead of reporting success.

### Partly signed-in sessions

A session can still owe a login step: `needsPasswordChange`, `needs2FASetup`, or `needs2FA` (waived on a browser with a valid remember-device cookie). `pendingSignInStep()` (`lib/two-factor/sign-in-steps.ts`) decides which, for both `proxy.ts` (redirects) and the route handlers the proxy lets through without those redirects — `/api/auth/2fa/*`, `/api/auth/passkey/*`, `/api/export/*` and `/api/assets/by-hostname`. Those handlers call `signInIncompleteResponse(session, allowed)` and answer `403` while a step is pending; the 2FA setup/enable and passkey registration routes allow `"2fa-setup"`, since forced enrollment is what they are for. by-hostname treats such a session as absent and falls back to the Bearer token.

### Admin enforcement

Admins can set `twoFactorRequired = true` on any user. On their next login, `isTwoFactorSetupRequired()` (`lib/two-factor/policy.ts`) checks whether they already have TOTP enabled **or** at least one registered passkey; if neither, they're redirected through `/login/setup-2fa`, where they can set up either method.

### Remember device

After a successful TOTP or passkey challenge, users can opt to "remember this device" for 30 days. This sets a signed JWT cookie (`sam_2fa_rm`, `lib/two-factor/remember-device.ts`) — the proxy reads it and skips the 2FA challenge for that browser.

### Passkeys (WebAuthn)

Hand-rolled with `@simplewebauthn/server`/`@simplewebauthn/browser` — **no NextAuth Adapter or WebAuthn provider is used** (this project's auth is JWT-strategy only, per the project conventions; NextAuth's built-in `Passkey`/`WebAuthn` provider requires a database Adapter, which is out of scope here). Credentials are stored in the `Passkey` model (`prisma/schema.prisma`), keyed by `userId`.

Registration and authentication each need a server-generated challenge to round-trip between a browser prompt and its verification. Since this app has no server-side session/cache store beyond JWT + cookies, the challenge rides in a short-lived (5 minute), signed, single-use `sam_webauthn_challenge` cookie (`lib/two-factor/webauthn.ts`), scoped to a `userId` and a `purpose` (`"registration"` or `"authentication"`) so one can't be replayed against the other endpoint.

API routes, all under `app/api/auth/passkey/`:

| Route | Purpose |
|---|---|
| `POST registration-options` | Generate WebAuthn registration options for the current user (self-service settings or forced setup) |
| `POST registration-verify` | Verify the registration response, persist the `Passkey`; re-signs in via `credentials-2fa-verified` if this was a forced-setup session |
| `POST authentication-options` | Login-time: generate authentication options scoped to the pending user's registered passkeys |
| `POST authentication-verify` | Login-time: verify the assertion, bump the credential's counter, sign in via `credentials-2fa-verified` (same mechanism as TOTP) |
| `GET list` | List the current user's passkeys (label, device type, timestamps — never the credential ID, public key, or counter) |
| `DELETE [id]` | Remove one of the current user's passkeys |

---

## Roles

| Role | Capabilities |
|---|---|
| **ADMIN** | Everything: manage users, settings, asset types, manufacturers, suppliers, models, audit log, import, CSV export |
| **MAINTAINER** | Everything EDITOR can do, plus manage manufacturers, suppliers, and models (catalog upkeep without full admin rights) |
| **EDITOR** | Create/edit/delete locations, assets, attachments; manage work logs |
| **VIEWER** | Read-only access to all data |

Role hierarchy for permission checks: `ADMIN > MAINTAINER > EDITOR > VIEWER`. Code checks roles only through the predicates in `lib/permissions.ts`: `canEdit` (EDITOR and up), `canManageCatalog` (MAINTAINER and up) and `isAdmin`.

### What each role can and cannot do

| Action | VIEWER | EDITOR | MAINTAINER | ADMIN |
|---|---|---|---|---|
| View locations and assets | ✓ | ✓ | ✓ | ✓ |
| View attachments | ✓ | ✓ | ✓ | ✓ |
| View work logs | ✓ | ✓ | ✓ | ✓ |
| View stock | ✓ | ✓ | ✓ | ✓ |
| View reports | ✓ | ✓ | ✓ | ✓ |
| Create/edit locations | ✗ | ✓ | ✓ | ✓ |
| Create/edit assets | ✗ | ✓ | ✓ | ✓ |
| Upload attachments | ✗ | ✓ | ✓ | ✓ |
| Create work logs | ✗ | ✓ | ✓ | ✓ |
| Create/deploy stock | ✗ | ✓ | ✓ | ✓ |
| Create/run reports | ✗ | ✓ | ✓ | ✓ |
| Manage manufacturers | ✗ | ✗ | ✓ | ✓ |
| Manage suppliers | ✗ | ✗ | ✓ | ✓ |
| Manage models | ✗ | ✗ | ✓ | ✓ |
| Import CSV | ✗ | ✗ | ✗ | ✓ |
| Manage asset types | ✗ | ✗ | ✗ | ✓ |
| Manage users | ✗ | ✗ | ✗ | ✓ |
| View audit log | ✗ | ✗ | ✗ | ✓ |
| CSV export | ✗ | ✗ | ✗ | ✓ |
| Application settings | ✗ | ✗ | ✗ | ✓ |

---

## Route Guard (`proxy.ts`)

All authenticated routes are guarded by `proxy.ts` at the project root (Next.js 16 replaces `middleware.ts` with `proxy.ts`).

The proxy:
1. Allows public routes: `/login`, `/api/auth/*`, `/api/setup`, `/setup`
2. Lets token-authenticated endpoints through to their handlers: `/api/prometheus/*`, `/api/grafana/*`, `/api/assets/by-hostname`, `/api/export/*` and the public `/api/branding/*` assets
3. Redirects unauthenticated requests to `/login`
4. Redirects to `/login/change-password` when `mustChangePassword = true`
5. Redirects to `/login/setup-2fa` when `twoFactorRequired = true` and 2FA not yet configured
6. Redirects to `/login/2fa` when 2FA is enabled and not yet verified this session

> The proxy handles **redirects only**. Authorization (role checks) happens inside each API route handler and server component.

---

## Prometheus Endpoints

`/api/prometheus/*` and `/api/grafana/*` use **Bearer token** authentication instead of sessions; `/api/assets/by-hostname` accepts a session **or** the same token:

```http
Authorization: Bearer <PROMETHEUS_SD_TOKEN>
```

These endpoints are exempted from the session proxy and must authenticate in their route handlers — `checkPrometheusAuth(req)` for the token-only routes, `hasBearerToken(req, process.env.PROMETHEUS_SD_TOKEN)` (`lib/bearer-token.ts`, constant-time) alongside `auth()` for by-hostname.

If `PROMETHEUS_SD_TOKEN` is not set, the endpoints return HTTP 503.

## Export Endpoints

`/api/export/*` accept a session (ADMIN for the CSV exports; any role for the JSON snapshot) **or** `Bearer EXPORT_TOKEN` (checked via `checkExportToken(req)` in each handler) so external tooling can pull exports. They are likewise exempted from the session proxy; without valid credentials the handlers return HTTP 401. A session that has not finished signing in (see [Partly signed-in sessions](#partly-signed-in-sessions)) gets HTTP 403.
