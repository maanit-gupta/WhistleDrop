// The demo accounts' passwords, shared by prisma/seed-demo.ts and the capture
// scripts (scripts/record-demo.ts, scripts/screenshots.mjs).
//
// PUBLIC BY DESIGN: they are listed in DUMMY_SIGN_INS.txt so anyone can try
// the moderator and admin features. They are used for nothing else, and the
// server protects these accounts (lib/demo.ts).
export const DEMO_PASSWORDS = {
  admin: "Demo-Admin-Lantern-2026",
  aria: "Demo-Aria-Harbour-2026",
  kiran: "Demo-Kiran-Meadow-2026",
} as const;

export const DEMO_EMAILS = {
  admin: "admin@whistledrop.demo",
  aria: "aria@whistledrop.demo",
  kiran: "kiran@whistledrop.demo",
} as const;
