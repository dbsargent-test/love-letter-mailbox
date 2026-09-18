# Azure Backend Setup

## Prerequisites

- Azure CLI installed (`az --version`)
- Visual Studio Enterprise subscription (or any Azure subscription)
- Login via: `az login --use-device-code` (use alternate account if corp CA blocks CLI)

## What Was Deployed

| Resource | Type | Name | Location |
|----------|------|------|----------|
| Resource Group | `Microsoft.Resources/resourceGroups` | `love-letter-mailbox` | West US 2 |
| Storage Account | `Microsoft.Storage/storageAccounts` | `lovelettermlbx` | West US 2 |
| Table Storage | Table | `messages` | (in lovelettermlbx) |
| Blob Container | Container | `photos` | (in lovelettermlbx) |
| Blob Container | Container | `firmware` | (in lovelettermlbx) |

### Seed Paired Users

The seed script has no default identities or passwords. Configure both paired
accounts explicitly:

```powershell
$env:STORAGE_ACCOUNT_NAME = "<storage-account-name>"
$env:STORAGE_ACCOUNT_KEY = "<storage-account-key>"
$env:MAILBOX_USER_A = "sender"
$env:MAILBOX_USER_A_DISPLAY_NAME = "Sender"
$env:MAILBOX_USER_A_PASSWORD = "<strong-password>"
$env:MAILBOX_USER_B = "recipient"
$env:MAILBOX_USER_B_DISPLAY_NAME = "Recipient"
$env:MAILBOX_USER_B_PASSWORD = "<strong-password>"
node scripts\seed-users.js
```

Set `ADMIN_USERNAME` in the Static Web App configuration if moderation
violations should also create an alert message in an administrator mailbox.

### Provision a Physical Mailbox

Device keys are not stored as application settings. Provision each physical
mailbox with a unique key whose SHA-256 hash is stored in the `devicekeys`
table:

```powershell
$env:STORAGE_ACCOUNT_NAME = "<storage-account-name>"
$env:STORAGE_ACCOUNT_KEY = "<storage-account-key>"
node scripts/provision-device-key.js recipient mailbox-recipient "<iana-time-zone>"
```

Copy the one-time plaintext key directly into the device's ignored
`firmware/mailbox_firmware/secrets.h` file. Never commit or reuse it.

### Normalize Existing Message Photos

New uploads are normalized by the API to an aspect-ratio-preserving baseline
JPEG within 216×160. Existing blobs can be assessed with the migration utility:

```powershell
$env:STORAGE_ACCOUNT_NAME = "<storage-account-name>"
$env:STORAGE_ACCOUNT_KEY = "<storage-account-key>"
node web\api\scripts\migrate-message-photos.js
```

Dry run is the default and makes no Azure changes. Review its ignored local
manifest under `local/migrations/` before applying:

```powershell
node web\api\scripts\migrate-message-photos.js --apply
```

Apply mode uploads an immutable `-device-v1.jpg` derivative and only then
updates the message entity. It preserves the original blob and records
`photoOriginalUrl` for rollback; it never overwrites or deletes the source.

### Manual Production Deployment

Run SWA CLI from the repository root, not from inside `web`. Running inside
the deployment source causes the client's temporary artifact folder to overlap
the source tree and the upload fails. On Windows, first add the Azure Linux x64
Sharp runtime to the local dependency tree:

```powershell
npm --prefix web\api run prepare:swa

swa deploy web `
  --api-location web\api `
  --swa-config-location web `
  --api-language node `
  --api-version 22 `
  --deployment-token $env:SWA_CLI_DEPLOYMENT_TOKEN `
  --env production
```
| Static Web App | `Microsoft.Web/staticSites` | `love-letter-app` | West US 2 |

**Static Web App URL:** https://zealous-dune-001e8941e.7.azurestaticapps.net

## Deployment Commands (Reproducible)

### 1. Login

```powershell
# Use device code flow if corporate Conditional Access blocks interactive login
az login --use-device-code
# Sign in with alternate account (e.g., personal Microsoft account linked to VS Enterprise)
```

### 2. Set Subscription

```powershell
az account set --subscription "<subscription-id>"
```

### 3. Create Resource Group

```powershell
az group create --name love-letter-mailbox --location westus2
```

### 4. Register Required Resource Providers

```powershell
az provider register --namespace Microsoft.Storage
az provider register --namespace Microsoft.Web
```

> **Note:** New VS Enterprise subscriptions don't have resource providers pre-registered. This is a one-time step.

### 5. Create Storage Account

```powershell
az storage account create \
  --name lovelettermlbx \
  --resource-group love-letter-mailbox \
  --location westus2 \
  --sku Standard_LRS \
  --kind StorageV2
```

> **Note:** Storage account names are globally unique. `loveletterstore` was taken; `lovelettermlbx` worked.

### 6. Create Table and Blob Containers

```powershell
$key = (az storage account keys list --account-name lovelettermlbx --resource-group love-letter-mailbox --query "[0].value" -o tsv)

az storage table create --name messages --account-name lovelettermlbx --account-key $key
az storage container create --name photos --account-name lovelettermlbx --account-key $key
az storage container create --name firmware --account-name lovelettermlbx --account-key $key
```

### 7. Create Static Web App

```powershell
az staticwebapp create \
  --name love-letter-app \
  --resource-group love-letter-mailbox \
  --location westus2 \
  --sku Free
```

## Troubleshooting

### "SubscriptionNotFound" when creating resources
- The subscription shows in `az account show` but ARM rejects it
- **Root cause:** Likely a globally-taken storage account name, NOT a subscription issue
- **Fix:** Try a different storage account name

### Error 53003 (Conditional Access)
- Corp accounts may be blocked from Azure CLI by Conditional Access policy
- **Fix:** Use an alternate personal account linked to your Azure subscription
- Login flow: `az login --use-device-code` → sign in with personal account → complete MFA

### "MissingSubscriptionRegistration"
- New VS Enterprise subscriptions don't have all resource providers registered
- **Fix:** `az provider register --namespace Microsoft.Web` (one-time per provider)

## Monthly Cost

| Resource | Cost |
|----------|------|
| Static Web App (Free tier) | $0.00 |
| Table Storage (messages) | ~$0.01 |
| Blob Storage (photos + firmware) | ~$0.01 |
| **Total** | **~$0.02/mo** |

Covered by VS Enterprise monthly credit ($150/mo).
