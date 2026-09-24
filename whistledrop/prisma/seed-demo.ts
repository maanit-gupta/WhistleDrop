// Demo accounts and sample cases for reviewers: npm run seed:demo
// Idempotent: accounts are created or restored (password, role, active), and
// sample cases that already exist are left alone.
// Refuses to run unless DEMO_MODE=true, or --force is passed
// (npm run seed:demo -- --force).
//
// These passwords are PUBLIC BY DESIGN: they are listed in DUMMY_SIGN_INS.txt
// so anyone can try the moderator and admin features. They are used for
// nothing else. The server protects these accounts (lib/demo.ts).
import { prisma } from "../lib/db";
import { DEMO_ACCOUNTS, assertDemoSeedAllowed, seedDemoAccounts, seedDemoCases, type DemoAccountKey } from "../lib/demo";

const DEMO_PASSWORDS: Record<DemoAccountKey, string> = {
  admin: "Demo-Admin-Lantern-2026",
  aria: "Demo-Aria-Harbour-2026",
  kiran: "Demo-Kiran-Meadow-2026",
};

async function main() {
  try {
    assertDemoSeedAllowed(process.argv.slice(2));
  } catch (err) {
    console.error((err as Error).message);
    process.exit(1);
  }
  const ids = await seedDemoAccounts(DEMO_PASSWORDS);
  console.log("Demo accounts (public by design; see DUMMY_SIGN_INS.txt):");
  for (const key of Object.keys(DEMO_ACCOUNTS) as DemoAccountKey[]) {
    const { email, role } = DEMO_ACCOUNTS[key];
    console.log(`  ${role.padEnd(9)} ${email.padEnd(24)} ${DEMO_PASSWORDS[key]}`);
  }

  const cases = await seedDemoCases(ids);
  console.log("\nSample cases (use these codes on /track):");
  for (const c of cases) {
    console.log(`  ${c.caseCode}  ${c.category.padEnd(10)} ${c.status.padEnd(12)} ${c.created ? "created" : "already existed"}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
