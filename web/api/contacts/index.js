const { TableClient, AzureNamedKeyCredential } = require("@azure/data-tables");
const { verifyRequest, sanitizeDisplayName } = require("../shared/auth");

const ACCOUNT_NAME = process.env.STORAGE_ACCOUNT_NAME || "lovelettermlbx";
const ACCOUNT_KEY = process.env.STORAGE_ACCOUNT_KEY || "";

function getTable(name) {
  const credential = new AzureNamedKeyCredential(ACCOUNT_NAME, ACCOUNT_KEY);
  return new TableClient(`https://${ACCOUNT_NAME}.table.core.windows.net`, name, credential);
}

function oDataEscape(val) {
  return String(val).replace(/'/g, "''");
}

module.exports = async function (context, req) {
  const user = verifyRequest(req);
  if (!user) {
    context.res = { status: 401, body: { error: "Authentication required" } };
    return;
  }

  const action = (req.params && req.params.action) || "";

  try {
    if (req.method === "GET" && !action) return await listContacts(context, user);
    if (req.method === "GET" && action === "search") return await searchUsers(context, req, user);
    if (req.method === "GET" && action === "pending") return await pendingRequests(context, user);
    if (req.method === "POST" && action === "request") return await sendRequest(context, req, user);
    if (req.method === "POST" && action === "accept") return await acceptRequest(context, req, user);
    if (req.method === "POST" && action === "reject") return await rejectRequest(context, req, user);
    if (req.method === "DELETE") return await removeContact(context, req, user);
    context.res = { status: 404, body: { error: "Not found" } };
  } catch (err) {
    context.log.error("Contacts error:", err);
    context.res = { status: 500, body: { error: "Server error" } };
  }
};

// List accepted contacts
async function listContacts(context, user) {
  const contactsTable = getTable("contacts");
  const contacts = [];
  try {
    const filter = `PartitionKey eq '${oDataEscape(user.username)}' and status eq 'accepted'`;
    for await (const entity of contactsTable.listEntities({ queryOptions: { filter } })) {
      contacts.push({
        username: entity.contactUsername,
        displayName: entity.contactDisplayName,
        connectedAt: entity.connectedAt
      });
    }
  } catch (e) {
    // Table may not exist yet
    if (e.statusCode !== 404) throw e;
  }
  context.res = {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: contacts
  };
}

// Search users by username or display name
async function searchUsers(context, req, user) {
  const query = (req.query.q || "").toLowerCase().trim();
  if (query.length < 2) {
    context.res = { status: 400, body: { error: "Search query must be at least 2 characters" } };
    return;
  }

  const usersTable = getTable("users");
  const results = [];
  for await (const entity of usersTable.listEntities({ queryOptions: { filter: "PartitionKey eq 'user'" } })) {
    if (entity.rowKey === user.username) continue; // Don't show self
    if (entity.rowKey.includes(query) || (entity.displayName || "").toLowerCase().includes(query)) {
      results.push({ username: entity.rowKey, displayName: entity.displayName });
    }
    if (results.length >= 10) break;
  }

  context.res = {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: results
  };
}

// List pending incoming requests
async function pendingRequests(context, user) {
  const contactsTable = getTable("contacts");
  const pending = [];
  try {
    const filter = `PartitionKey eq '${oDataEscape(user.username)}' and status eq 'pending'`;
    for await (const entity of contactsTable.listEntities({ queryOptions: { filter } })) {
      pending.push({
        username: entity.contactUsername,
        displayName: entity.contactDisplayName,
        requestedAt: entity.requestedAt
      });
    }
  } catch (e) {
    if (e.statusCode !== 404) throw e;
  }
  context.res = {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: pending
  };
}

// Send a connect request
async function sendRequest(context, req, user) {
  const { username } = req.body || {};
  if (!username) {
    context.res = { status: 400, body: { error: "Username required" } };
    return;
  }

  const targetUsername = username.toLowerCase().trim();
  if (targetUsername === user.username) {
    context.res = { status: 400, body: { error: "Cannot add yourself" } };
    return;
  }

  // Verify target user exists
  const usersTable = getTable("users");
  let targetUser;
  try {
    targetUser = await usersTable.getEntity("user", targetUsername);
  } catch {
    context.res = { status: 404, body: { error: "User not found" } };
    return;
  }

  const contactsTable = getTable("contacts");
  try { await contactsTable.createTable(); } catch (e) {
    if (!e.message?.includes("TableAlreadyExists")) throw e;
  }

  // Check if already connected or pending
  try {
    const existing = await contactsTable.getEntity(targetUsername, user.username);
    if (existing.status === "accepted") {
      context.res = { status: 400, body: { error: "Already connected" } };
      return;
    }
    if (existing.status === "pending") {
      context.res = { status: 400, body: { error: "Request already pending" } };
      return;
    }
  } catch { /* no existing entry */ }

  // Create pending request in target's contact list
  await contactsTable.upsertEntity({
    partitionKey: targetUsername,
    rowKey: user.username,
    contactUsername: user.username,
    contactDisplayName: sanitizeDisplayName(user.displayName || user.username),
    status: "pending",
    requestedAt: new Date().toISOString()
  }, "Replace");

  context.res = {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: { message: `Request sent to ${targetUser.displayName}` }
  };
}

// Accept a connect request
async function acceptRequest(context, req, user) {
  const { username } = req.body || {};
  if (!username) {
    context.res = { status: 400, body: { error: "Username required" } };
    return;
  }

  const contactsTable = getTable("contacts");
  const usersTable = getTable("users");
  const requesterUsername = username.toLowerCase().trim();

  // Verify the pending request exists
  let requestEntity;
  try {
    requestEntity = await contactsTable.getEntity(user.username, requesterUsername);
    if (requestEntity.status !== "pending") {
      context.res = { status: 400, body: { error: "No pending request from this user" } };
      return;
    }
  } catch {
    context.res = { status: 404, body: { error: "No pending request from this user" } };
    return;
  }

  const now = new Date().toISOString();

  // Get both users' display names
  let requesterDisplay = requestEntity.contactDisplayName;
  let myDisplay = user.displayName || user.username;
  try {
    const myEntity = await usersTable.getEntity("user", user.username);
    myDisplay = myEntity.displayName || user.username;
  } catch {}

  // Update requester's entry in my list to accepted
  requestEntity.status = "accepted";
  requestEntity.connectedAt = now;
  await contactsTable.updateEntity(requestEntity, "Replace");

  // Create reciprocal entry — add me to requester's contact list
  await contactsTable.upsertEntity({
    partitionKey: requesterUsername,
    rowKey: user.username,
    contactUsername: user.username,
    contactDisplayName: myDisplay,
    status: "accepted",
    connectedAt: now
  }, "Replace");

  context.res = {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: { message: `Connected with ${requesterDisplay}!` }
  };
}

// Reject a connect request
async function rejectRequest(context, req, user) {
  const { username } = req.body || {};
  if (!username) {
    context.res = { status: 400, body: { error: "Username required" } };
    return;
  }

  const contactsTable = getTable("contacts");
  try {
    await contactsTable.deleteEntity(user.username, username.toLowerCase().trim());
  } catch {}

  context.res = {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: { message: "Request declined" }
  };
}

// Remove a contact
async function removeContact(context, req, user) {
  const username = req.query.username || (req.body && req.body.username);
  if (!username) {
    context.res = { status: 400, body: { error: "Username required" } };
    return;
  }

  const contactsTable = getTable("contacts");
  const target = username.toLowerCase().trim();

  // Remove from both sides
  try { await contactsTable.deleteEntity(user.username, target); } catch {}
  try { await contactsTable.deleteEntity(target, user.username); } catch {}

  context.res = {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: { message: "Contact removed" }
  };
}
