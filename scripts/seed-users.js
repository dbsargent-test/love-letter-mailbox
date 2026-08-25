/**
 * Seed script — creates the two user accounts in Azure Table Storage.
 * Run once: node scripts/seed-users.js <doug-pw> <carolina-pw>
 * 
 * Requires env vars: STORAGE_ACCOUNT_NAME, STORAGE_ACCOUNT_KEY
 */
const { TableClient, AzureNamedKeyCredential } = require("@azure/data-tables");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const ACCOUNT_NAME = process.env.STORAGE_ACCOUNT_NAME || "lovelettermlbx";
const ACCOUNT_KEY = process.env.STORAGE_ACCOUNT_KEY;

if (!ACCOUNT_KEY) {
  console.error("Set STORAGE_ACCOUNT_KEY env var first");
  process.exit(1);
}

async function seed() {
  const credential = new AzureNamedKeyCredential(ACCOUNT_NAME, ACCOUNT_KEY);
  const usersTable = new TableClient(
    `https://${ACCOUNT_NAME}.table.core.windows.net`, "users", credential
  );

  try { await usersTable.createTable(); } catch (e) {
    if (!e.message?.includes("TableAlreadyExists")) throw e;
  }

  const dougPw = process.argv[2] || "changeme123";
  const carolinaPw = process.argv[3] || "changeme456";

  const users = [
    {
      partitionKey: "user",
      rowKey: "doug",
      displayName: "Doug",
      partner: "carolina",
      partnerDisplayName: "Carolina",
      passwordHash: await bcrypt.hash(dougPw, 10),
    },
    {
      partitionKey: "user",
      rowKey: "carolina",
      displayName: "Carolina",
      partner: "doug",
      partnerDisplayName: "Doug",
      passwordHash: await bcrypt.hash(carolinaPw, 10),
    },
  ];

  for (const user of users) {
    try {
      await usersTable.upsertEntity(user, "Replace");
      console.log(`✅ User '${user.rowKey}' seeded (display: ${user.displayName})`);
    } catch (err) {
      console.error(`❌ Failed to seed '${user.rowKey}':`, err.message);
    }
  }

  const dougDeviceKey = crypto.randomBytes(24).toString("base64url");
  const carolinaDeviceKey = crypto.randomBytes(24).toString("base64url");

  console.log("\n📱 Device API keys (set these as SWA app settings):");
  console.log(`  DEVICE_KEY_DOUG=${dougDeviceKey}`);
  console.log(`  DEVICE_KEY_CAROLINA=${carolinaDeviceKey}`);
  console.log("\nAlso set: JWT_SECRET=" + crypto.randomBytes(32).toString("base64url"));
}

seed().catch(console.error);
