/**
 * Seed two paired user accounts in Azure Table Storage.
 *
 * Required environment variables:
 * STORAGE_ACCOUNT_NAME, STORAGE_ACCOUNT_KEY
 * MAILBOX_USER_A, MAILBOX_USER_A_DISPLAY_NAME, MAILBOX_USER_A_PASSWORD
 * MAILBOX_USER_B, MAILBOX_USER_B_DISPLAY_NAME, MAILBOX_USER_B_PASSWORD
 */
const { TableClient, AzureNamedKeyCredential } = require("@azure/data-tables");
const bcrypt = require("bcryptjs");

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`Set ${name} before seeding users.`);
    process.exit(1);
  }
  return value;
}

const ACCOUNT_NAME = requiredEnv("STORAGE_ACCOUNT_NAME");
const ACCOUNT_KEY = requiredEnv("STORAGE_ACCOUNT_KEY");
const userA = {
  username: requiredEnv("MAILBOX_USER_A"),
  displayName: requiredEnv("MAILBOX_USER_A_DISPLAY_NAME"),
  password: requiredEnv("MAILBOX_USER_A_PASSWORD"),
};
const userB = {
  username: requiredEnv("MAILBOX_USER_B"),
  displayName: requiredEnv("MAILBOX_USER_B_DISPLAY_NAME"),
  password: requiredEnv("MAILBOX_USER_B_PASSWORD"),
};

for (const user of [userA, userB]) {
  if (!/^[a-z0-9_]{3,20}$/.test(user.username)) {
    console.error("Usernames must match [a-z0-9_]{3,20}.");
    process.exit(1);
  }
  if (user.password.length < 12) {
    console.error("Seed passwords must be at least 12 characters.");
    process.exit(1);
  }
}

if (userA.username === userB.username) {
  console.error("The two usernames must be different.");
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

  const users = [
    {
      partitionKey: "user",
      rowKey: userA.username,
      displayName: userA.displayName,
      partner: userB.username,
      partnerDisplayName: userB.displayName,
      passwordHash: await bcrypt.hash(userA.password, 12),
      sessionVersion: 0,
    },
    {
      partitionKey: "user",
      rowKey: userB.username,
      displayName: userB.displayName,
      partner: userA.username,
      partnerDisplayName: userA.displayName,
      passwordHash: await bcrypt.hash(userB.password, 12),
      sessionVersion: 0,
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

  console.log("\nProvision each physical mailbox separately:");
  console.log(`  node scripts/provision-device-key.js ${userA.username} mailbox-a`);
  console.log(`  node scripts/provision-device-key.js ${userB.username} mailbox-b`);
}

seed().catch(error => {
  console.error("User seeding failed:", error.message);
  process.exit(1);
});
