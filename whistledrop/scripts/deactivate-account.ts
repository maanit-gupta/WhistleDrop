// Deactivates one moderator account by email. Moderators with history can't be
// deleted (the audit trail references them), so this is how an account is
// retired. Deactivation is immediate: the API re-checks isActive on every
// request, and login treats the account as unknown.
//
//   npm run account:deactivate -- someone@example.com
//
// Runs against DATABASE_URL from .env.local. To target another database, run
// `npx dotenv -e <file> -- npx tsx scripts/deactivate-account.ts <email>`.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    throw new Error("Usage: npm run account:deactivate -- <email>");
  }

  await prisma.$transaction(async (tx) => {
    // Same lock as the admin API, so this can't race an admin change into zero admins.
    const admins = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM "Moderator" WHERE role = 'ADMIN' AND "isActive" = true FOR UPDATE`;

    const target = await tx.moderator.findUnique({
      where: { email },
      select: { id: true, role: true, isActive: true, isDemo: true },
    });
    if (!target) throw new Error(`No moderator with email ${email}`);
    if (target.isDemo) throw new Error(`${email} is a demo account; demo accounts stay active (see lib/demo.ts)`);
    if (!target.isActive) {
      console.log(`${email} is already deactivated. Nothing to do.`);
      return;
    }
    if (target.role === "ADMIN" && admins.length <= 1) {
      throw new Error(`${email} is the last active ADMIN; create or promote another admin first`);
    }

    await tx.moderator.update({ where: { id: target.id }, data: { isActive: false } });
    console.log(`Deactivated ${target.role} ${email}. Its history is kept; it can no longer sign in.`);

    const remaining = await tx.moderator.findMany({
      where: { role: "ADMIN", isActive: true },
      select: { email: true, isDemo: true },
    });
    if (remaining.every((a) => a.isDemo)) {
      console.warn(
        "Warning: the only active ADMIN accounts left are demo accounts, which can't manage other accounts. " +
          "Run `npm run db:seed` with SEED_MODERATOR_* set to create a new admin.",
      );
    }
  });
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
