const jwt = require("jsonwebtoken");
const crypto = require("crypto");

// JWT secret MUST come from environment — no fallback
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error("FATAL: JWT_SECRET environment variable is not set");
}
const TOKEN_EXPIRY = "7d";
const JWT_ISSUER = "love-letter-mailbox";
const JWT_AUDIENCE = "love-letter-web";

function createToken(user) {
  if (!JWT_SECRET) throw new Error("JWT_SECRET not configured");
  return jwt.sign(
    { username: user.username, mailbox: user.username, partner: user.partner, mustChangePw: user.mustChangePassword || false },
    JWT_SECRET,
    { expiresIn: TOKEN_EXPIRY, issuer: JWT_ISSUER, audience: JWT_AUDIENCE }
  );
}

function verifyRequest(req) {
  if (!JWT_SECRET) return null;
  const token = req.headers["x-auth-token"] || "";
  if (!token) return null;
  try {
    return jwt.verify(token, JWT_SECRET, { issuer: JWT_ISSUER, audience: JWT_AUDIENCE });
  } catch {
    return null;
  }
}

// Extract raw token string for revocation checks
function extractToken(req) {
  return req.headers["x-auth-token"] || "";
}

// Token revocation check against Table Storage blocklist
async function isTokenRevoked(token, tableClient) {
  if (!token) return false;
  try {
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    await tableClient.getEntity("revoked", tokenHash);
    return true;
  } catch {
    return false;
  }
}

async function revokeToken(token, tableClient) {
  if (!token) return;
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  try {
    const decoded = jwt.decode(token);
    const expiresAt = decoded && decoded.exp
      ? new Date(decoded.exp * 1000).toISOString()
      : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    await tableClient.upsertEntity({
      partitionKey: "revoked",
      rowKey: tokenHash,
      revokedAt: new Date().toISOString(),
      expiresAt
    }, "Replace");
  } catch { /* best effort */ }
}

// Device API keys verified against Table Storage (scalable, not hardcoded)
async function verifyDeviceKey(req, tableClient) {
  const key = req.headers["x-device-key"] || req.query.deviceKey;
  if (!key) return null;
  try {
    // Hash the key and look it up in the devicekeys table
    const keyHash = crypto.createHash("sha256").update(key).digest("hex");
    const entity = await tableClient.getEntity("devicekey", keyHash);
    return { mailbox: entity.mailbox, isDevice: true };
  } catch {
    return null;
  }
}

// Rate limiting — in-memory sliding window (resets on cold start, acceptable for low-traffic)
const rateLimitBuckets = new Map();

function getRateLimitConfig(action) {
  const configs = {
    login:    { max: 5,  windowMs: 15 * 60 * 1000, lockoutMs: 30 * 60 * 1000 },
    register: { max: 3,  windowMs: 60 * 60 * 1000, lockoutMs: 60 * 60 * 1000 },
    message:  { max: 30, windowMs: 60 * 1000,       lockoutMs: 0 },
  };
  return configs[action] || configs.login;
}

function checkRateLimit(key, action = "login") {
  const cfg = getRateLimitConfig(action);
  const bucketKey = `${action}:${key.toLowerCase()}`;
  const now = Date.now();
  const record = rateLimitBuckets.get(bucketKey);

  if (!record) return { allowed: true };

  record.attempts = record.attempts.filter(t => now - t < cfg.windowMs);

  if (record.lockedUntil && now < record.lockedUntil) {
    const remainMin = Math.ceil((record.lockedUntil - now) / 60000);
    return { allowed: false, message: `Rate limited. Try again in ${remainMin} minutes.` };
  }

  if (record.attempts.length >= cfg.max) {
    if (cfg.lockoutMs) record.lockedUntil = now + cfg.lockoutMs;
    return { allowed: false, message: "Too many requests. Please slow down." };
  }

  return { allowed: true };
}

function recordAttempt(key, action = "login") {
  const bucketKey = `${action}:${key.toLowerCase()}`;
  const now = Date.now();
  if (!rateLimitBuckets.has(bucketKey)) {
    rateLimitBuckets.set(bucketKey, { attempts: [now], lockedUntil: null });
  } else {
    rateLimitBuckets.get(bucketKey).attempts.push(now);
  }
}

function clearAttempts(key, action = "login") {
  rateLimitBuckets.delete(`${action}:${key.toLowerCase()}`);
}

// Sanitize display name — strip HTML tags
function sanitizeDisplayName(name) {
  return String(name).replace(/<[^>]*>/g, "").trim().substring(0, 30);
}

// Audit logging to Table Storage
async function auditLog(tableClient, event, details) {
  try {
    await tableClient.upsertEntity({
      partitionKey: new Date().toISOString().slice(0, 10), // date partition
      rowKey: `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`,
      event,
      ...details,
      timestamp_log: new Date().toISOString()
    }, "Replace");
  } catch { /* best effort — don't break flow for audit failures */ }
}

module.exports = {
  createToken, verifyRequest, verifyDeviceKey, extractToken, isTokenRevoked, revokeToken,
  checkRateLimit, recordAttempt, clearAttempts,
  sanitizeDisplayName, auditLog
};
