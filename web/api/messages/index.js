const { TableClient, AzureNamedKeyCredential } = require("@azure/data-tables");
const { BlobServiceClient, StorageSharedKeyCredential, generateBlobSASQueryParameters, BlobSASPermissions } = require("@azure/storage-blob");
const crypto = require("crypto");
const { verifyRequest, verifyDeviceKey, extractToken, isTokenRevoked, checkRateLimit, recordAttempt, auditLog } = require("../shared/auth");

// Strict allowlist: only lowercase letters, numbers, underscore (matches registration regex)
function isValidUsername(val) {
  return typeof val === "string" && /^[a-z0-9_]{3,20}$/.test(val);
}

// Escape single quotes for OData filter strings to prevent injection
function oDataEscape(val) {
  return String(val).replace(/'/g, "''");
}

const MAX_MESSAGE_LENGTH = 500;
const MAX_PHOTO_SIZE = 2 * 1024 * 1024; // 2MB base64

const ACCOUNT_NAME = process.env.STORAGE_ACCOUNT_NAME || "lovelettermlbx";
const ACCOUNT_KEY = process.env.STORAGE_ACCOUNT_KEY || "";
const TABLE_NAME = "messages";
const PHOTOS_CONTAINER = "photos";

function getTableClient() {
  const credential = new AzureNamedKeyCredential(ACCOUNT_NAME, ACCOUNT_KEY);
  return new TableClient(`https://${ACCOUNT_NAME}.table.core.windows.net`, TABLE_NAME, credential);
}

function getBlobClient() {
  return BlobServiceClient.fromConnectionString(
    `DefaultEndpointsProtocol=https;AccountName=${ACCOUNT_NAME};AccountKey=${ACCOUNT_KEY};EndpointSuffix=core.windows.net`
  );
}

function generatePhotoSasUrl(blobUrl) {
  if (!blobUrl) return null;
  // Extract blob name from full URL
  const blobName = blobUrl.split(`/${PHOTOS_CONTAINER}/`)[1];
  if (!blobName) return null;
  const sharedKeyCredential = new StorageSharedKeyCredential(ACCOUNT_NAME, ACCOUNT_KEY);
  const sasToken = generateBlobSASQueryParameters({
    containerName: PHOTOS_CONTAINER,
    blobName,
    permissions: BlobSASPermissions.parse("r"),
    startsOn: new Date(Date.now() - 5 * 60 * 1000),
    expiresOn: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
  }, sharedKeyCredential).toString();
  return `${blobUrl}?${sasToken}`;
}

module.exports = async function (context, req) {
  // Authenticate — accept JWT (web users) or device key (ESP32)
  const deviceKeysTable = new TableClient(
    `https://${ACCOUNT_NAME}.table.core.windows.net`, "devicekeys",
    new AzureNamedKeyCredential(ACCOUNT_NAME, ACCOUNT_KEY)
  );
  const user = verifyRequest(req) || await verifyDeviceKey(req, deviceKeysTable);
  if (!user) {
    context.res = { status: 401, body: { error: "Authentication required" } };
    return;
  }

  // Check token revocation (skip for device keys)
  if (!user.isDevice) {
    const token = extractToken(req);
    const revokedTable = new TableClient(
      `https://${ACCOUNT_NAME}.table.core.windows.net`, "revokedtokens",
      new AzureNamedKeyCredential(ACCOUNT_NAME, ACCOUNT_KEY)
    );
    if (await isTokenRevoked(token, revokedTable)) {
      context.res = { status: 401, body: { error: "Token has been revoked. Please log in again." } };
      return;
    }
  }

  // Block API if password change required (except for device keys)
  if (!user.isDevice && user.mustChangePw) {
    context.res = { status: 403, body: { error: "You must change your password before using the app" } };
    return;
  }

  try {
    const messageId = req.params && req.params.id;
    if (req.method === "GET" && !messageId) {
      return await getMessages(context, req, user);
    } else if (req.method === "POST" && !messageId) {
      return await postMessage(context, req, user);
    } else if (req.method === "PATCH" && messageId) {
      return await markRead(context, req, user, messageId);
    } else if (req.method === "DELETE" && messageId) {
      return await deleteMessage(context, req, user, messageId);
    } else {
      context.res = { status: 405, body: "Method not allowed" };
    }
  } catch (err) {
    context.log.error("API error:", err.message);
    context.res = { status: 500, body: { error: "Server error" } };
  }
};

async function getMessages(context, req, user) {
  const tableClient = getTableClient();
  const viewSent = req.query.view === "sent";
  const unreadOnly = req.query.unread === "true";

  // Received = messages in MY mailbox; Sent = messages in PARTNER's mailbox from me
  const targetPartition = viewSent ? user.partner : user.mailbox;
  const messages = [];

  let filter = `PartitionKey eq '${oDataEscape(targetPartition)}'`;
  if (viewSent) {
    filter += ` and sender eq '${oDataEscape(user.username)}'`;
    const recipientFilter = req.query.recipient;
    if (recipientFilter) {
      if (!isValidUsername(recipientFilter)) {
        context.res = { status: 400, body: { error: "Invalid recipient filter" } };
        return;
      }
      filter = `PartitionKey eq '${oDataEscape(recipientFilter)}' and sender eq '${oDataEscape(user.username)}'`;
    }
  }
  else if (unreadOnly) filter += ` and read eq false`;

  for await (const entity of tableClient.listEntities({ queryOptions: { filter } })) {
    // Skip messages hidden by sender from their sent view
    if (viewSent && entity.deletedBySender) continue;

    const sentTime = new Date(entity.timestamp_sent || entity.timestamp).getTime();
    const canUnsend = viewSent && (Date.now() - sentTime < 5 * 60 * 1000);

    messages.push({
      id: entity.rowKey,
      sender: entity.sender,
      recipient: entity.partitionKey,
      text: entity.text || "",
      photoUrl: generatePhotoSasUrl(entity.photoUrl),
      read: entity.read || false,
      timestamp: entity.timestamp_sent || entity.timestamp,
      canUnsend
    });
  }

  messages.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  const page = parseInt(req.query.page) || 0;
  const pageSize = 10;
  const paged = messages.slice(page * pageSize, (page + 1) * pageSize);

  // Count unread in user's own mailbox (for badge)
  let unreadCount = 0;
  if (!viewSent) {
    unreadCount = messages.filter(m => !m.read).length;
  } else {
    // For sent view, still provide the user's unread count for the badge
    const unreadFilter = `PartitionKey eq '${oDataEscape(user.mailbox)}' and read eq false`;
    for await (const _ of tableClient.listEntities({ queryOptions: { filter: unreadFilter } })) {
      unreadCount++;
    }
  }

  context.res = {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: { messages: paged, total: messages.length, page, hasMore: (page + 1) * pageSize < messages.length, unreadCount }
  };
}

async function postMessage(context, req, user) {
  const { text, photoData, hasPhoto, recipient } = req.body || {};

  // Rate limit message sending (30 per minute per user)
  const msgRate = checkRateLimit(user.username, "message");
  if (!msgRate.allowed) {
    context.res = { status: 429, body: { error: msgRate.message } };
    return;
  }
  recordAttempt(user.username, "message");

  if (!text && !hasPhoto) {
    context.res = { status: 400, body: { error: "text or photo is required" } };
    return;
  }

  if (text && text.length > MAX_MESSAGE_LENGTH) {
    context.res = { status: 400, body: { error: `Message too long (max ${MAX_MESSAGE_LENGTH} chars)` } };
    return;
  }

  if (photoData && photoData.length > MAX_PHOTO_SIZE) {
    context.res = { status: 400, body: { error: "Photo too large (max 2MB)" } };
    return;
  }

  const messageId = Date.now().toString() + "-" + crypto.randomBytes(4).toString("hex");

  // Content Safety: moderate text
  if (text) {
    const blocked = await moderateText(text, context, user.username, messageId);
    if (blocked) {
      context.res = { status: 400, body: { error: "Message contains inappropriate content and cannot be sent." } };
      return;
    }
  }

  // Use explicit recipient if provided, otherwise fall back to partner
  const targetMailbox = recipient || user.partner;

  if (!targetMailbox || !isValidUsername(targetMailbox)) {
    context.res = { status: 400, body: { error: "Valid recipient required" } };
    return;
  }

  // Validate recipient is in sender's contacts list
  const contactsTable = new TableClient(
    `https://${ACCOUNT_NAME}.table.core.windows.net`, "contacts",
    new AzureNamedKeyCredential(ACCOUNT_NAME, ACCOUNT_KEY)
  );
  try {
    const contact = await contactsTable.getEntity(user.username, targetMailbox);
    if (contact.status !== "accepted") {
      context.res = { status: 403, body: { error: "Recipient is not in your contacts" } };
      return;
    }
  } catch {
    context.res = { status: 403, body: { error: "Recipient is not in your contacts" } };
    return;
  }

  const senderName = user.username;

  const tableClient = getTableClient();
  let photoUrl = null;

  if (hasPhoto && photoData) {
    try {
      const base64Data = photoData.split(",")[1] || photoData;
      const buffer = Buffer.from(base64Data, "base64");

      // Content Safety: moderate image before uploading
      const imgResult = await moderateImage(buffer, context, user.username, messageId);
      if (imgResult === true) {
        context.res = { status: 400, body: { error: "Image contains inappropriate content and cannot be sent." } };
        return;
      }
      if (imgResult === "SERVICE_DOWN") {
        context.res = { status: 503, body: { error: "Image moderation service is temporarily unavailable. Please try again in a moment." } };
        return;
      }

      const blobService = getBlobClient();
      const containerClient = blobService.getContainerClient(PHOTOS_CONTAINER);
      const blobName = `${messageId}.jpg`;
      const blockBlobClient = containerClient.getBlockBlobClient(blobName);
      await blockBlobClient.upload(buffer, buffer.length, {
        blobHTTPHeaders: { blobContentType: "image/jpeg" }
      });
      photoUrl = blockBlobClient.url;
    } catch (err) {
      context.log.error("Photo upload failed:", err.message);
    }
  }

  const entity = {
    partitionKey: targetMailbox,
    rowKey: messageId,
    sender: senderName.substring(0, 30),
    text: (text || "").substring(0, 500),
    photoUrl: photoUrl || "",
    read: false,
    timestamp_sent: new Date().toISOString()
  };

  await tableClient.createEntity(entity);

  context.res = {
    status: 201,
    headers: { "Content-Type": "application/json" },
    body: { id: messageId, status: "sent", photoUrl }
  };
}

async function markRead(context, req, user, messageId) {
  const tableClient = getTableClient();
  // Only mark messages in YOUR mailbox as read
  try {
    const entity = await tableClient.getEntity(user.mailbox, messageId);
    entity.read = true;
    await tableClient.updateEntity(entity, "Merge");
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { status: "read" } };
  } catch (err) {
    context.res = { status: 404, body: { error: "Message not found" } };
  }
}

async function deleteMessage(context, req, user, messageId) {
  const tableClient = getTableClient();
  const action = req.query.action || "delete"; // "delete" or "unsend"
  const targetMailbox = req.query.mailbox; // recipient's username for sent-tab actions

  if (action === "unsend") {
    if (!targetMailbox || !isValidUsername(targetMailbox)) {
      context.res = { status: 400, body: { error: "Target mailbox required for unsend" } };
      return;
    }
    // UNSEND: actually remove from recipient's mailbox (only within 5 min)
    try {
      const entity = await tableClient.getEntity(targetMailbox, messageId);
      if (entity.sender !== user.username) {
        context.res = { status: 403, body: { error: "Can only unsend your own messages" } };
        return;
      }
      const sentTime = new Date(entity.timestamp_sent || entity.timestamp).getTime();
      const fiveMin = 5 * 60 * 1000;
      if (Date.now() - sentTime > fiveMin) {
        context.res = { status: 400, body: { error: "Can only unsend within 5 minutes" } };
        return;
      }
      // Delete photo if exists
      if (entity.photoUrl) {
        try {
          const blobName = entity.photoUrl.split(`/${PHOTOS_CONTAINER}/`)[1];
          if (blobName) {
            const blobService = getBlobClient();
            await blobService.getContainerClient(PHOTOS_CONTAINER).getBlockBlobClient(blobName).deleteIfExists();
          }
        } catch (e) { /* best-effort */ }
      }
      await tableClient.deleteEntity(targetMailbox, messageId);
      context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { status: "unsent" } };
    } catch {
      context.res = { status: 404, body: { error: "Message not found" } };
    }
    return;
  }

  // DELETE: received tab = delete from my mailbox; sent tab = hide from my sent view
  // Try my mailbox first (received)
  try {
    await tableClient.getEntity(user.mailbox, messageId);
    await tableClient.deleteEntity(user.mailbox, messageId);
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { status: "deleted" } };
    return;
  } catch { /* not in my mailbox */ }

  // Sent tab: need the target mailbox to find the message
  if (targetMailbox && isValidUsername(targetMailbox)) {
    try {
      const entity = await tableClient.getEntity(targetMailbox, messageId);
      if (entity.sender !== user.username) {
        context.res = { status: 403, body: { error: "Not authorized" } };
        return;
      }
      entity.deletedBySender = true;
      await tableClient.updateEntity(entity, "Merge");
      context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { status: "hidden" } };
      return;
    } catch { /* not found */ }
  }

  context.res = { status: 404, body: { error: "Message not found" } };
}

// --- Azure AI Content Safety ---
const CONTENT_SAFETY_ENDPOINT = process.env.CONTENT_SAFETY_ENDPOINT;
const CONTENT_SAFETY_KEY = process.env.CONTENT_SAFETY_KEY;
const SEVERITY_THRESHOLD = 2; // Block severity 2+ (Medium and above)
const ADMIN_USERNAME = "doug"; // Receives violation alerts

function getModerationTable(name) {
  return new TableClient(
    `https://${ACCOUNT_NAME}.table.core.windows.net`, name,
    new AzureNamedKeyCredential(ACCOUNT_NAME, ACCOUNT_KEY)
  );
}

async function moderateText(text, context, sender, messageId) {
  if (!CONTENT_SAFETY_ENDPOINT || !CONTENT_SAFETY_KEY) return false;
  try {
    const res = await fetch(`${CONTENT_SAFETY_ENDPOINT}contentsafety/text:analyze?api-version=2024-09-01`, {
      method: "POST",
      headers: { "Ocp-Apim-Subscription-Key": CONTENT_SAFETY_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ text, categories: ["Hate", "SelfHarm", "Sexual", "Violence"] })
    });
    if (!res.ok) { context.log.error("Content Safety text error:", res.status); return false; }
    const data = await res.json();
    const blocked = (data.categoriesAnalysis || []).filter(c => c.severity >= SEVERITY_THRESHOLD);
    if (blocked.length > 0) {
      await recordViolation(sender, messageId, "text", blocked, context);
      return true;
    }
    return false;
  } catch (err) {
    context.log.error("Content Safety text moderation failed:", err.message);
    return false; // Text: fail-open
  }
}

async function moderateImage(imageBuffer, context, sender, messageId) {
  if (!CONTENT_SAFETY_ENDPOINT || !CONTENT_SAFETY_KEY) {
    // No service configured — queue for later review
    await queueForModeration(messageId, sender, "no_service_configured", context);
    return false; // Allow but track
  }
  try {
    const base64Image = imageBuffer.toString("base64");
    const res = await fetch(`${CONTENT_SAFETY_ENDPOINT}contentsafety/image:analyze?api-version=2024-09-01`, {
      method: "POST",
      headers: { "Ocp-Apim-Subscription-Key": CONTENT_SAFETY_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ image: { content: base64Image }, categories: ["Hate", "SelfHarm", "Sexual", "Violence"] })
    });
    if (!res.ok) {
      context.log.error("Content Safety image error:", res.status);
      // Service error — FAIL CLOSED: block upload and queue for retry
      await queueForModeration(messageId, sender, "service_error_" + res.status, context);
      return "SERVICE_DOWN";
    }
    const data = await res.json();
    const blocked = (data.categoriesAnalysis || []).filter(c => c.severity >= SEVERITY_THRESHOLD);
    if (blocked.length > 0) {
      // Record violation
      await recordViolation(sender, messageId, "image", blocked, context);
      return true;
    }
    return false;
  } catch (err) {
    context.log.error("Content Safety image moderation failed:", err.message);
    // Network/timeout error — FAIL CLOSED
    await queueForModeration(messageId, sender, "exception: " + err.message, context);
    return "SERVICE_DOWN";
  }
}

// Queue unmoderated images for later checking
async function queueForModeration(messageId, sender, reason, context) {
  try {
    const table = getModerationTable("moderationqueue");
    await table.upsertEntity({
      partitionKey: "pending",
      rowKey: messageId,
      sender,
      reason,
      queuedAt: new Date().toISOString(),
      status: "pending"
    }, "Replace");
    context.log.warn(`Image queued for moderation: ${messageId} from ${sender} (${reason})`);
  } catch (err) {
    context.log.error("Failed to queue for moderation:", err.message);
  }
}

// Record content violations and alert admin
async function recordViolation(sender, messageId, contentType, categories, context) {
  try {
    const table = getModerationTable("contentviolations");
    const categoryDetails = categories.map(c => `${c.category}:${c.severity}`).join(",");

    // Record the violation
    await table.upsertEntity({
      partitionKey: sender,
      rowKey: `${Date.now()}-${messageId}`,
      contentType,
      categories: categoryDetails,
      messageId,
      timestamp_violation: new Date().toISOString()
    }, "Replace");

    // Count total violations by this user
    let violationCount = 0;
    for await (const _ of table.listEntities({
      queryOptions: { filter: `PartitionKey eq '${oDataEscape(sender)}'` }
    })) {
      violationCount++;
    }

    // Send alert to admin's mailbox as a system message
    const msgTable = getTableClient();
    const alertId = `alert-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
    await msgTable.upsertEntity({
      partitionKey: ADMIN_USERNAME,
      rowKey: alertId,
      sender: "system",
      text: `⚠️ CONTENT VIOLATION: User @${sender} attempted to send a blocked ${contentType}. Categories: ${categoryDetails}. Total violations by this user: ${violationCount}. Message ID: ${messageId}`,
      read: false,
      timestamp_sent: new Date().toISOString()
    }, "Replace");

    context.log.warn(`Content violation by ${sender}: ${categoryDetails} (total: ${violationCount})`);
  } catch (err) {
    context.log.error("Failed to record violation:", err.message);
  }
}
