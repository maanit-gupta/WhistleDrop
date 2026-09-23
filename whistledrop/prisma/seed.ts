import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();
const BCRYPT_COST = 12;

async function main() {
  const email = process.env.SEED_MODERATOR_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_MODERATOR_PASSWORD;
  if (!email || !password) {
    throw new Error("SEED_MODERATOR_EMAIL and SEED_MODERATOR_PASSWORD must be set");
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
  const moderator = await prisma.moderator.upsert({
    where: { email },
    // The seeded account is the bootstrap ADMIN; re-running the seed restores it.
    update: { passwordHash, role: "ADMIN", isActive: true },
    create: { email, passwordHash, role: "ADMIN" },
    select: { id: true, email: true, role: true },
  });
  console.log(`Seeded ${moderator.role} ${moderator.email} (${moderator.id})`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
