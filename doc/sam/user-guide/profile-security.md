---
title: "Profile & Security"
sync_to_confluence: true
---

# Profile & Security

## Updating your profile

1. Click your name or avatar in the top-right corner.
2. Select **Profile**.
3. Update your name or email address and click **Save**.

---

## Changing your password

1. Go to **Profile** (top-right menu).
2. Scroll to the **Change password** section.
3. Enter your current password and the new password twice.
4. Click **Save**.

Password requirements: minimum 8 characters, maximum 128 characters.

---

## Two-Factor Authentication (2FA)

2FA adds a second verification step at login using a time-based code from an authenticator app (Google Authenticator, Authy, Microsoft Authenticator, etc.).

### Enabling 2FA

1. Click your name in the top-right corner.
2. Select **Two-Factor Authentication**.
3. Click **Set up two-factor authentication**.
4. Scan the QR code with your authenticator app.
5. Enter the 6-digit code shown in the app to confirm setup.
6. Click **Enable**.

From the next login you will be asked for a 6-digit code after entering your password.

### Disabling 2FA

1. Go to **Two-Factor Authentication** in the user menu.
2. Click **Disable two-factor authentication** and confirm.

> Your administrator can require 2FA for your account individually, or organisation-wide for all local accounts (Administration → Settings → Security & compliance). If 2FA is required, you cannot disable it, and you will be guided through setup at your next login if it isn't enabled yet. SSO (Entra ID) accounts are unaffected — their MFA is enforced by Entra ID.

### Remember this device

After a successful 2FA login you can check **Remember this device for 30 days**. SAM will skip the 2FA step on that browser for 30 days.

### Passkeys

Instead of typing a 6-digit code, you can use a passkey (Touch ID, Windows Hello, or a security key) as your second factor.

1. Go to **Two-Factor Authentication** in the user menu.
2. Under **Passkeys**, click **Add a passkey** and follow your browser's prompt.
3. Optionally give it a name (e.g. "Work laptop") so you can recognise it later.

From then on, the login 2FA screen offers **Use a passkey instead** alongside the authenticator-app code field. You can register more than one passkey (e.g. one per device) and remove any of them from the same settings page. A passkey satisfies admin-enforced 2FA the same way an authenticator app does — you only need one of the two set up.

---

## Forced password change

If an administrator creates your account with **Must change password** enabled, you will be redirected to a password change screen on first login. You cannot access any other part of the application until you set a new password.

---

## Signing out

Click your name in the top-right corner and select **Sign out**.
