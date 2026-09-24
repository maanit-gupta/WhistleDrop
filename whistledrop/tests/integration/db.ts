import bcrypt from "bcryptjs";
import type { ModeratorRole } from "@prisma/client";
import { prisma } from "@/lib/db";
import { assertSafeTestDatabase } from "./globalSetup";

/** Empties every table. Checked twice so it can never run against a real database. */
export async function resetDatabase() {
  assertSafeTestDatabase(process.env.DATABASE_URL);
  const [{ db }] = await prisma.$queryRaw<{ db: string }[]>`SELECT current_database() AS db`;
  if (!db.endsWith("_test")) throw new Error(`Refusing to truncate database "${db}"`);

  await prisma.$executeRaw`TRUNCATE "CaseMessage", "InternalNote", "StatusUpdate", "Attachment", "ConsumedUploadToken", "Report", "Moderator" RESTART IDENTITY CASCADE`;
}

export const MODERATOR = { email: "mod@example.com", password: "integration-test-password" };

export async function seedModerator(
  {
    email,
    password,
    role,
    isDemo = false,
  }: { email: string; password: string; role: ModeratorRole; isDemo?: boolean } = { ...MODERATOR, role: "ADMIN" },
) {
  return prisma.moderator.create({ data: { email, role, isDemo, passwordHash: await bcrypt.hash(password, 4) } });
}
