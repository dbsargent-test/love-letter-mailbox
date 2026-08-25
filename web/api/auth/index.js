const { TableClient, AzureNamedKeyCredential } = require("@azure/data-tables");
const bcrypt = require("bcryptjs");
const {
  createToken, verifyRequest, extractToken, revokeToken,
  checkRateLimit, recordAttempt, clearAttempts,
  sanitizeDisplayName, auditLog
} = require("../shared/auth");

const BCRYPT_ROUNDS = 12;
const MIN_PASSWORD_LENGTH = 12;

function getUsersTable() {
  const account = process.env.STORAGE_ACCOUNT_NAME;
  const key = process.env.STORAGE_ACCOUNT_KEY;
  const credential = new AzureNamedKeyCredential(account, key);
  return new TableClient(`https://${account}.table.core.windows.net`, "users", credential);
}

function getAuditTable() {
  const account = process.env.STORAGE_ACCOUNT_NAME;
  const key = process.env.STORAGE_ACCOUNT_KEY;
  const credential = new AzureNamedKeyCredential(account, key);
  return new TableClient(`https://${account}.table.core.windows.net`, "auditlog", credential);
}

function getRevokedTable() {
  const account = process.env.STORAGE_ACCOUNT_NAME;
  const key = process.env.STORAGE_ACCOUNT_KEY;
  const credential = new AzureNamedKeyCredential(account, key);
  return new TableClient(`https://${account}.table.core.windows.net`, "revokedtokens", credential);
}

function validatePassword(password) {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  }
  if (!/[A-Z]/.test(password)) return "Password must contain an uppercase letter";
  if (!/[a-z]/.test(password)) return "Password must contain a lowercase letter";
  if (!/[0-9]/.test(password)) return "Password must contain a number";
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(password)) {
    return "Password must contain a special character (!@#$%^&*...)";
  }
  return null;
}

module.exports = async function (context, req) {
  const route = (req.params && req.params.action) || "login";

  try {
    if (route === "login" && req.method === "POST") {
      return await handleLogin(context, req);
    } else if (route === "register" && req.method === "POST") {
      return await handleRegister(context, req);
    } else if (route === "change-password" && req.method === "POST") {
      return await handleChangePassword(context, req);
    } else if (route === "logout" && req.method === "POST") {
      return await handleLogout(context, req);
    } else if (route === "forgot-password" && req.method === "POST") {
      return await handleForgotPassword(context, req);
    } else if (route === "reset-password" && req.method === "POST") {
      return await handleResetPassword(context, req);
    } else if (route === "update-email" && req.method === "POST") {
      return await handleUpdateEmail(context, req);
    } else if (route === "profile" && req.method === "GET") {
      return await handleGetProfile(context, req);
    } else {
      context.res = { status: 404, body: { error: "Not found" } };
    }
  } catch (err) {
    context.log.error("Auth error:", err);
    context.res = { status: 500, body: { error: "Server error" } };
  }
};

async function handleLogin(context, req) {
  const { username, password } = req.body || {};
  if (!username || !password) {
    context.res = { status: 400, body: { error: "Username and password required" } };
    return;
  }

  const rateCheck = checkRateLimit(username, "login");
  if (!rateCheck.allowed) {
    context.res = { status: 429, body: { error: rateCheck.message } };
    return;
  }

  const usersTable = getUsersTable();
  const audit = getAuditTable();
  let userEntity;
  try {
    userEntity = await usersTable.getEntity("user", username.toLowerCase());
  } catch (e) {
    recordAttempt(username, "login");
    await bcrypt.compare(password, "$2a$12$invalidhashfortimingattackprevention");
    await auditLog(audit, "login_failed", { username: username.toLowerCase(), reason: "user_not_found", ip: req.headers["x-forwarded-for"] || "unknown" });
    context.res = { status: 401, body: { error: "Invalid username or password" } };
    return;
  }

  const valid = await bcrypt.compare(password, userEntity.passwordHash);
  if (!valid) {
    recordAttempt(username, "login");
    await auditLog(audit, "login_failed", { username: username.toLowerCase(), reason: "wrong_password", ip: req.headers["x-forwarded-for"] || "unknown" });
    context.res = { status: 401, body: { error: "Invalid username or password" } };
    return;
  }

  clearAttempts(username, "login");

  const token = createToken({
    username: userEntity.rowKey,
    partner: userEntity.partner,
    mustChangePassword: userEntity.mustChangePassword === true,
  });

  await auditLog(audit, "login_success", { username: userEntity.rowKey, ip: req.headers["x-forwarded-for"] || "unknown" });

  context.res = {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: {
      token,
      username: userEntity.rowKey,
      displayName: userEntity.displayName,
      partner: userEntity.partner,
      partnerDisplayName: userEntity.partnerDisplayName,
      mustChangePassword: userEntity.mustChangePassword === true,
    },
  };
}

async function handleChangePassword(context, req) {
  const user = verifyRequest(req);
  if (!user) {
    context.res = { status: 401, body: { error: "Authentication required" } };
    return;
  }

  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) {
    context.res = { status: 400, body: { error: "Current and new password required" } };
    return;
  }

  const pwError = validatePassword(newPassword);
  if (pwError) {
    context.res = { status: 400, body: { error: pwError } };
    return;
  }

  const usersTable = getUsersTable();
  const audit = getAuditTable();
  const userEntity = await usersTable.getEntity("user", user.username);

  const valid = await bcrypt.compare(currentPassword, userEntity.passwordHash);
  if (!valid) {
    context.res = { status: 401, body: { error: "Current password is incorrect" } };
    return;
  }

  userEntity.passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  userEntity.mustChangePassword = false;
  await usersTable.updateEntity(userEntity, "Replace");

  // Revoke current token so old sessions are forced to re-login
  const currentToken = extractToken(req);
  const revokedTable = getRevokedTable();
  try { await revokedTable.createTable(); } catch { /* exists */ }
  await revokeToken(currentToken, revokedTable);

  await auditLog(audit, "password_changed", { username: user.username });

  // Issue a fresh token
  const newToken = createToken({ username: user.username, partner: userEntity.partner });

  context.res = {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: { message: "Password changed successfully", token: newToken },
  };
}

async function handleLogout(context, req) {
  const user = verifyRequest(req);
  if (!user) {
    context.res = { status: 200, body: { message: "Logged out" } };
    return;
  }

  const currentToken = extractToken(req);
  const revokedTable = getRevokedTable();
  try { await revokedTable.createTable(); } catch { /* exists */ }
  await revokeToken(currentToken, revokedTable);

  const audit = getAuditTable();
  await auditLog(audit, "logout", { username: user.username });

  context.res = {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: { message: "Logged out" },
  };
}

async function handleRegister(context, req) {
  const { username, displayName, password, email } = req.body || {};

  if (!username || !displayName || !password || !email) {
    context.res = { status: 400, body: { error: "Username, display name, email, and password required" } };
    return;
  }

  // Validate email
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    context.res = { status: 400, body: { error: "Valid email address required" } };
    return;
  }

  // Rate limit registration by IP
  const ip = req.headers["x-forwarded-for"] || "unknown";
  const rateCheck = checkRateLimit(ip, "register");
  if (!rateCheck.allowed) {
    context.res = { status: 429, body: { error: "Too many registrations. Please try again later." } };
    return;
  }

  const cleanUsername = username.toLowerCase().trim();
  if (!/^[a-z0-9_]{3,20}$/.test(cleanUsername)) {
    context.res = { status: 400, body: { error: "Username must be 3-20 characters, letters/numbers/underscore only" } };
    return;
  }

  const cleanDisplayName = sanitizeDisplayName(displayName);
  if (cleanDisplayName.length < 1) {
    context.res = { status: 400, body: { error: "Display name must be 1-30 characters" } };
    return;
  }

  const pwError = validatePassword(password);
  if (pwError) {
    context.res = { status: 400, body: { error: pwError } };
    return;
  }

  const usersTable = getUsersTable();
  const audit = getAuditTable();

  try {
    await usersTable.getEntity("user", cleanUsername);
    context.res = { status: 409, body: { error: "Username already taken" } };
    return;
  } catch (e) {
    if (!e.statusCode || e.statusCode !== 404) throw e;
  }

  recordAttempt(ip, "register");

  const userEntity = {
    partitionKey: "user",
    rowKey: cleanUsername,
    displayName: cleanDisplayName,
    email: email.trim().toLowerCase(),
    partner: "",
    partnerDisplayName: "",
    passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS),
    mustChangePassword: false,
    createdAt: new Date().toISOString(),
  };

  await usersTable.createEntity(userEntity);

  const token = createToken({ username: cleanUsername, partner: "" });

  try { await audit.createTable(); } catch { /* exists */ }
  await auditLog(audit, "user_registered", { username: cleanUsername, ip });

  context.res = {
    status: 201,
    headers: { "Content-Type": "application/json" },
    body: {
      token,
      username: cleanUsername,
      displayName: cleanDisplayName,
      message: "Account created! Add contacts to start messaging.",
    },
  };
}

// --- FORGOT PASSWORD: generate 6-digit code, store with 15-min expiry, send email ---
async function handleForgotPassword(context, req) {
  const { username } = req.body || {};
  if (!username) {
    context.res = { status: 400, body: { error: "Username required" } };
    return;
  }

  const ip = req.headers["x-forwarded-for"] || "unknown";
  const rateCheck = checkRateLimit(ip, "register");
  if (!rateCheck.allowed) {
    context.res = { status: 429, body: { error: "Too many requests. Try again later." } };
    return;
  }
  recordAttempt(ip, "register");

  const usersTable = getUsersTable();
  const audit = getAuditTable();
  const successMsg = "If that account exists and has an email, a reset code has been sent.";

  let userEntity;
  try {
    userEntity = await usersTable.getEntity("user", username.toLowerCase().trim());
  } catch {
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { message: successMsg } };
    return;
  }

  if (!userEntity.email) {
    context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: { message: successMsg } };
    return;
  }

  const crypto = require("crypto");
  const code = crypto.randomInt(100000, 999999).toString();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  const resetTable = getResetTable();
  try { await resetTable.createTable(); } catch { /* exists */ }
  await resetTable.upsertEntity({
    partitionKey: "reset",
    rowKey: username.toLowerCase().trim(),
    code: await bcrypt.hash(code, 10),
    expiresAt,
    attempts: 0
  }, "Replace");

  const emailSent = await sendResetEmail(userEntity.email, code, username.toLowerCase().trim(), context);
  await auditLog(audit, "password_reset_requested", { username: username.toLowerCase().trim(), emailSent: emailSent.toString(), ip });

  context.res = {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: { message: successMsg }
  };
}

async function handleResetPassword(context, req) {
  const { username, code, newPassword } = req.body || {};
  if (!username || !code || !newPassword) {
    context.res = { status: 400, body: { error: "Username, code, and new password required" } };
    return;
  }

  const pwError = validatePassword(newPassword);
  if (pwError) {
    context.res = { status: 400, body: { error: pwError } };
    return;
  }

  const cleanUsername = username.toLowerCase().trim();
  const resetTable = getResetTable();
  const audit = getAuditTable();

  let resetEntity;
  try {
    resetEntity = await resetTable.getEntity("reset", cleanUsername);
  } catch {
    context.res = { status: 400, body: { error: "No reset request found. Please request a new code." } };
    return;
  }

  if (new Date(resetEntity.expiresAt) < new Date()) {
    await resetTable.deleteEntity("reset", cleanUsername);
    context.res = { status: 400, body: { error: "Reset code has expired. Please request a new one." } };
    return;
  }

  if (resetEntity.attempts >= 5) {
    await resetTable.deleteEntity("reset", cleanUsername);
    context.res = { status: 429, body: { error: "Too many failed attempts. Please request a new code." } };
    return;
  }

  const valid = await bcrypt.compare(code, resetEntity.code);
  if (!valid) {
    resetEntity.attempts = (resetEntity.attempts || 0) + 1;
    await resetTable.updateEntity(resetEntity, "Merge");
    context.res = { status: 400, body: { error: "Invalid code. Please try again." } };
    return;
  }

  const usersTable = getUsersTable();
  const userEntity = await usersTable.getEntity("user", cleanUsername);
  userEntity.passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  userEntity.mustChangePassword = false;
  await usersTable.updateEntity(userEntity, "Replace");
  await resetTable.deleteEntity("reset", cleanUsername);
  await auditLog(audit, "password_reset_completed", { username: cleanUsername });

  context.res = {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: { message: "Password has been reset. You can now sign in." }
  };
}

function getResetTable() {
  const account = process.env.STORAGE_ACCOUNT_NAME;
  const key = process.env.STORAGE_ACCOUNT_KEY;
  const credential = new AzureNamedKeyCredential(account, key);
  return new TableClient(`https://${account}.table.core.windows.net`, "passwordresets", credential);
}

async function sendResetEmail(toEmail, code, username, context) {
  const endpoint = process.env.ACS_ENDPOINT;
  const accessKey = process.env.ACS_KEY;
  const fromEmail = process.env.ACS_FROM_EMAIL || "DoNotReply@lovelettermail.com";

  if (!endpoint || !accessKey) {
    context.log.warn(`Password reset requested for ${username} but email service not configured. Code NOT logged.`);
    return false;
  }

  try {
    const { EmailClient } = require("@azure/communication-email");
    const emailClient = new EmailClient(`endpoint=${endpoint};accesskey=${accessKey}`);
    await emailClient.beginSend({
      senderAddress: fromEmail,
      recipients: { to: [{ address: toEmail }] },
      content: {
        subject: "Love Letter Mailbox — Password Reset Code",
        plainText: `Your password reset code is: ${code}\n\nThis code expires in 15 minutes.\nIf you did not request this, please ignore this email.`,
        html: `<div style="font-family:sans-serif;max-width:400px;margin:0 auto;padding:20px">
          <h2 style="color:#667eea">📬 Love Letter Mailbox</h2>
          <p>Your password reset code is:</p>
          <div style="font-size:32px;font-weight:bold;letter-spacing:8px;text-align:center;padding:20px;background:#f5f5f5;border-radius:12px;margin:16px 0">${code}</div>
          <p style="color:#888;font-size:13px">This code expires in 15 minutes. If you did not request this, ignore this email.</p>
        </div>`
      }
    });
    return true;
  } catch (err) {
    context.log.error("Failed to send reset email:", err.message);
    context.log.warn(`Password reset email failed for ${username}. Code NOT logged for security.`);
    return false;
  }
}

async function handleUpdateEmail(context, req) {
  const user = await verifyRequest(req);
  if (!user) {
    context.res = { status: 401, body: { error: "Unauthorized" } };
    return;
  }

  const { email } = req.body || {};
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    context.res = { status: 400, body: { error: "Valid email required" } };
    return;
  }

  const usersTable = getUsersTable();
  const userEntity = await usersTable.getEntity("user", user.username);
  userEntity.email = email.trim().toLowerCase();
  await usersTable.updateEntity(userEntity, "Merge");

  const audit = getAuditTable();
  await auditLog(audit, "email_updated", { username: user.username });

  context.res = {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: { message: "Email updated", email: userEntity.email }
  };
}

async function handleGetProfile(context, req) {
  const user = await verifyRequest(req);
  if (!user) {
    context.res = { status: 401, body: { error: "Unauthorized" } };
    return;
  }
  const usersTable = getUsersTable();
  try {
    const entity = await usersTable.getEntity("user", user.username);
    context.res = {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: { email: entity.email || "", displayName: entity.displayName || "" }
    };
  } catch {
    context.res = { status: 404, body: { error: "User not found" } };
  }
}
