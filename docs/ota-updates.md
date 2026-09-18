# OTA (Over-the-Air) Firmware Updates

## Overview

The mailbox firmware includes built-in OTA update capability. Once the initial firmware is flashed via USB, all subsequent updates can be pushed remotely — no physical access to the device required.

This is critical for a device deployed at someone else's house.

---

## How It Works

```
1. You compile new firmware → export as .bin
2. Upload .bin to Azure Blob Storage
3. Update version number in Azure Table Storage
4. ESP32-C5 checks for updates on boot + every 15 minutes
5. If new version available → downloads .bin → installs → reboots
6. If new firmware crashes → auto-rollback to previous version
```

---

## Architecture

### ESP32-C5 Flash Partition Layout

The ESP32-C5 has 8MB flash, partitioned as:

| Partition | Size | Purpose |
|-----------|------|---------|
| bootloader | 32KB | First-stage bootloader |
| partition table | 4KB | Partition layout |
| nvs | 20KB | WiFi credentials + settings |
| ota_0 | ~3.5MB | Firmware slot A (active) |
| ota_1 | ~3.5MB | Firmware slot B (OTA target) |
| ota_data | 8KB | Tracks which slot is active |
| spiffs/littlefs | ~512KB | Fonts, splash screens, cached data |

### Update Flow

```
Current firmware running from ota_0
    │
    ├── GET /api/device/firmware
    │   Response: { "version": "1.2.5", "url": "https://...blob.../firmware-1.2.5.bin" }
    │
    ├── Compare: local "1.2.4" < server "1.2.5" → update needed
    │
    ├── Download firmware-1.2.5.bin to ota_1 partition
    │
    ├── Verify checksum (SHA-256)
    │
    ├── Set ota_data to boot from ota_1
    │
    └── Reboot
        │
        ├── New firmware boots from ota_1
        │   ├── Initializes the display and required I2C peripherals
        │   ├── If initialization passes → mark ota_1 as confirmed
        │   └── If it reboots before confirmation → bootloader can roll back
        │
        └── Device now running v1.2.5
```

---

## Step-by-Step: Pushing an Update

### 1. Compile New Firmware

In Arduino IDE:
- Make your code changes
- **Sketch → Export Compiled Binary**
- This creates a `.bin` file in the sketch folder

### 2. Upload to Azure Blob Storage

```bash
# Using Azure CLI
az storage blob upload \
  --account-name <your-storage-account> \
  --container-name firmware \
  --name firmware-1.2.5.bin \
  --file ./build/mailbox.ino.bin \
  --overwrite
```

Or upload via the Azure Portal: Storage Account → Containers → firmware → Upload.

### 3. Update Version Metadata

Update the firmware version in Azure Table Storage (or a simple JSON file in Blob Storage):

```json
{
  "version": "1.2.5",
  "url": "https://<account>.blob.core.windows.net/firmware/firmware-1.2.5.bin",
  "sha256": "abc123...",
  "releaseNotes": "Added emoji support"
}
```

### 4. Wait

The ESP32 checks for updates:
- On every boot
- Every 15 minutes while running

Within 15 minutes, the device will check for an update. Reboot the device to
trigger an earlier check after Wi-Fi reconnects.

---

## Safety Features

### Automatic Rollback
The firmware confirms a pending OTA image only after the display and required
I2C peripherals initialize. If the image reboots before confirmation, the
ESP32 bootloader can return to the previous OTA partition. Wi-Fi connectivity
is retried independently and is not currently part of the confirmation gate.

### Checksum Verification
Before installing, the firmware verifies the SHA-256 hash of the downloaded binary against the expected hash from the version metadata. If they don't match (corrupted download), the update is aborted.

### Incremental Updates Only
The ESP32 only updates if the server version is **newer** than the local version. This prevents update loops and unnecessary reboots.

---

## Security Considerations

- **HTTPS only:** Firmware is downloaded over HTTPS from Azure Blob Storage
- **SAS tokens:** Use Azure Shared Access Signatures with expiration to secure the firmware blob
- **No unsigned code:** Consider adding firmware signing in v2 (verify the binary was built by you before installing)
- **Version rollback protection:** The firmware won't "downgrade" to an older version unless forced via USB

---

## Monitoring

The firmware logs OTA activity to the serial console:
```
[OTA] Checking for updates...
[OTA] Current version: 1.1.0
[OTA] Server version: 1.2.0
[OTA] Update available! Downloading...
[OTA] Download complete. Size: 1,234,567 bytes
[OTA] SHA-256 verified.
[OTA] Installing to partition ota_1...
[OTA] Install complete. Rebooting...
```

If the device is remote and you can't access serial, consider adding OTA status reporting back to Azure (POST /api/device-status with version, uptime, battery level).

---

## Emergency Recovery

If OTA fails AND the rollback fails (extremely unlikely with dual partitions):

1. Physical access required
2. Connect USB-C cable
3. Hold BOOT button + press RESET to enter bootloader mode
4. Flash firmware via Arduino IDE as usual
5. This is the only scenario where physical access is needed after initial deployment
