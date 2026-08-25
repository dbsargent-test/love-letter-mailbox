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
az account set --subscription "3732cd21-44c8-41e4-811d-1f0d52671bce"
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
