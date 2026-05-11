---
wiki:
  title: "Authentication & Roles"
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

TOTP-based (Time-based One-Time Password, compatible with Google Authenticator, Authy, etc.).

### User flow

1. User enables 2FA in **Settings → Two-Factor Authentication**
2. They scan a QR code with their authenticator app
3. They verify by entering the first code
4. On subsequent logins: credentials accepted → TOTP challenge page → session granted

### Admin enforcement

Admins can set `twoFactorRequired = true` on any user. On their next login, they are redirected through the 2FA setup flow before accessing the app.

### Remember device

After a successful TOTP challenge, users can opt to "remember this device" for 30 days. This sets a signed JWT cookie — the proxy reads it and skips the TOTP challenge for that browser.

---

## Roles

| Role | Capabilities |
|---|---|
| **ADMIN** | Everything: manage users, settings, asset types, manufacturers, audit log, CSV export |
| **EDITOR** | Create/edit/delete locations, assets, attachments; import CSV; manage work logs |
| **VIEWER** | Read-only access to all data |

Role hierarchy for permission checks: `ADMIN > EDITOR > VIEWER`.

### What each role can and cannot do

| Action | VIEWER | EDITOR | ADMIN |
|---|---|---|---|
| View locations and assets | ✓ | ✓ | ✓ |
| View attachments | ✓ | ✓ | ✓ |
| View work logs | ✓ | ✓ | ✓ |
| View stock | ✓ | ✓ | ✓ |
| View reports | ✓ | ✓ | ✓ |
| Create/edit locations | ✗ | ✓ | ✓ |
| Create/edit assets | ✗ | ✓ | ✓ |
| Upload attachments | ✗ | ✓ | ✓ |
| Create work logs | ✗ | ✓ | ✓ |
| Create/deploy stock | ✗ | ✓ | ✓ |
| Import CSV | ✗ | ✓ | ✓ |
| Create/run reports | ✗ | ✓ | ✓ |
| Manage asset types | ✗ | ✗ | ✓ |
| Manage manufacturers | ✗ | ✗ | ✓ |
| Manage users | ✗ | ✗ | ✓ |
| View audit log | ✗ | ✗ | ✓ |
| CSV export | ✗ | ✗ | ✓ |
| Application settings | ✗ | ✗ | ✓ |

---

## Route Guard (`proxy.ts`)

All authenticated routes are guarded by `proxy.ts` at the project root (Next.js 16 replaces `middleware.ts` with `proxy.ts`).

The proxy:
1. Allows public routes: `/login`, `/api/auth/*`, `/api/setup`, `/setup`
2. Allows Prometheus endpoints: `/api/prometheus/*`, `/api/assets/by-hostname` (Bearer token auth)
3. Redirects unauthenticated requests to `/login`
4. Redirects to `/login/change-password` when `mustChangePassword = true`
5. Redirects to `/login/setup-2fa` when `twoFactorRequired = true` and 2FA not yet configured
6. Redirects to `/login/2fa` when 2FA is enabled and not yet verified this session

> The proxy handles **redirects only**. Authorization (role checks) happens inside each API route handler and server component.

---

## Password Reset

Requires SMTP configuration (`SMTP_HOST` + `SMTP_*` vars). When not configured, the endpoint accepts requests but silently skips sending.

Flow:
1. User submits email at `/login/forgot-password`
2. API creates a `PasswordResetToken` (tokenHash stored, not the raw token)
3. Email sent with reset link containing the raw token
4. User clicks link → `/login/reset-password?token=...`
5. API validates token, checks expiry, marks `usedAt`, sets new password hash

---

## Prometheus Endpoints

`/api/prometheus/*` and `/api/assets/by-hostname` use **Bearer token** authentication instead of sessions:

```http
Authorization: Bearer <PROMETHEUS_SD_TOKEN>
```

These endpoints are exempted from the session proxy and must call `checkPrometheusAuth(req)` directly in their route handlers.

If `PROMETHEUS_SD_TOKEN` is not set, the endpoints return HTTP 503.
