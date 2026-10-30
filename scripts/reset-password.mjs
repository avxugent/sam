/**
 * scripts/reset-password.mjs
 *
 * Reset the password for a local (non-SSO) user account.
 *
 * Usage:
 *   npm run user:reset-password
 *   npm run user:reset-password -- --email user@example.com
 *
 * Run from the project root so that the .env file is found automatically.
 */

import "./_env.mjs";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { createInterface } from "readline";

const rl = createInterface({ input: process.stdin, output: process.stdout });

function ask(question) {
  return new Promise((resolve) => {
    rl.question(question, (a) => resolve(a.trim()));
  });
}

async function main() {
  const args = process.argv.slice(2);
  const emailFlagIdx = args.indexOf("--email");
  let email = emailFlagIdx !== -1 ? args[emailFlagIdx + 1] ?? null : null;

  console.log("\nSAM — Reset user password");
  console.log("──────────────────────────────────────────");

  if (!email) {
    email = await ask("Email address: ");
  }

  if (!email) {
    rl.close();
    console.error("Email is required.");
    process.exit(1);
  }

  const password = await ask("New password: ");

  if (password.length < 8) {
    rl.close();
    console.error("Password must be at least 8 characters.");
    process.exit(1);
  }

  const confirm = await ask("Confirm password: ");
  rl.close();

  if (password !== confirm) {
    console.error("Passwords do not match.");
    process.exit(1);
  }

  console.log("\nConnecting to database…");

  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    console.error(`No user found with email: ${email}`);
    process.exit(1);
  }

  if (!user.passwordHash) {
    console.error(
      `User "${email}" is an SSO account (no local password). Cannot reset via this script.`
    );
    process.exit(1);
  }

  console.log(`User found: ${user.name ?? email} (role: ${user.role})`);
  console.log("Hashing password…");

  const passwordHash = await bcrypt.hash(password, 13);

  await prisma.user.update({
    where: { email },
    data: { passwordHash },
  });

  console.log(`\n✅  Password updated for ${email}.\n`);
}

main()
  .catch((err) => {
    rl.close();
    console.error("\n❌  Error:", err.message ?? err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
