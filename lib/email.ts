import nodemailer from "nodemailer";

function createTransport() {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT ?? "587", 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;
  const from = process.env.SMTP_FROM;

  if (!host || !from) return null;

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: user && pass ? { user, pass } : undefined,
  });
}

export async function sendPasswordResetEmail(
  to: string,
  resetUrl: string
): Promise<boolean> {
  const transport = createTransport();
  const from = process.env.SMTP_FROM;
  if (!transport || !from) return false;

  try {
    await transport.sendMail({
      from,
      to,
      subject: "Reset your SAM password",
      text: `You requested a password reset for your SAM account.\n\nClick the link below to set a new password (valid for 1 hour):\n\n${resetUrl}\n\nIf you did not request this, you can safely ignore this email.`,
      html: `<p>You requested a password reset for your SAM account.</p><p><a href="${resetUrl}">Reset your password</a> (valid for 1 hour)</p><p>If you did not request this, you can safely ignore this email.</p>`,
    });
    return true;
  } catch {
    return false;
  }
}
