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

Use the policy-compatible repository helper from the repo root. The OTA build
must use the Minimal SPIFFS partition and should redact local source paths from
the binary:

```powershell
$build = "C:\Temp\mailbox-firmware-build-vNEXT"
$map = "-ffile-prefix-map=C:\Users\dosarge=."
$props = @(
  "compiler.c.extra_flags=$map",
  "compiler.cpp.extra_flags=$map",
  "compiler.S.extra_flags=$map"
)

.\scripts\esp32c5-toolchain.ps1 `
  -Action Compile `
  -SketchDirectory .\firmware\mailbox_firmware `
  -BuildPath $build `
  -Fqbn "esp32:esp32:sparkfun_esp32c5_thing_plus:PartitionScheme=min_spiffs" `
  -ExtraBuildProperty $props
```

The OTA application binary is:

```text
$build\mailbox_firmware.ino.bin
```

Do **not** upload the merged 8 MB image for OTA.

### 2. Upload to Azure Blob Storage

```bash
# Using Azure CLI
az storage blob upload \
  --account-name <your-storage-account> \
  --container-name firmware \
  --name firmware-<version>.bin \
  --file <build-path>/mailbox_firmware.ino.bin \
  --overwrite
```

Or upload via the Azure Portal: Storage Account → Containers → firmware → Upload.

### 3. Update Version Metadata

The device endpoint is controlled by Static Web App app settings, not by a
firmware metadata table. The critical hash is the **ESP image validation hash**,
not the raw file SHA-256.

Get the correct validation hash with:

```powershell
python -m esptool image-info "<build-path>\mailbox_firmware.ino.bin"
```

Use the `Validation hash: ... (valid)` value from the output. Do **not** use
`Get-FileHash` for `FIRMWARE_SHA256`; the firmware verifies OTA with
`esp_partition_get_sha256(updatePartition)`, which matches the ESP image
validation hash, not the raw `.bin` file hash.

Update the Static Web App metadata:

```powershell
az staticwebapp appsettings set `
  --name love-letter-app `
  --resource-group love-letter-mailbox `
  --setting-names `
    FIRMWARE_RELEASE_ENABLED=true `
    FIRMWARE_VERSION=<version> `
    FIRMWARE_BLOB_NAME=firmware-<version>.bin `
    FIRMWARE_SHA256=<ESP image validation hash> `
    FIRMWARE_RELEASE_NOTES="<short release note>"
```

### 4. Wait

The ESP32 checks for updates:
- On every boot
- Every 15 minutes while running in normal release builds
- Every 2 minutes in temporary test builds such as v1.2.7+

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
Before installing, the firmware verifies the downloaded OTA partition with
`esp_partition_get_sha256(updatePartition)` against `FIRMWARE_SHA256` from the
version metadata. That value must be the ESP image validation hash reported by
`python -m esptool image-info`, not the raw `.bin` file SHA-256. If the wrong
hash type is published, the mailbox shows `OTA verification failed` and remains
on the previous firmware version.

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

If the device is remote and you can't access serial, the firmware posts heartbeat
and OTA lifecycle telemetry to `POST /api/device/status`; the API stores the
latest snapshot in `deviceStatus` and event history in `deviceEvents`.

---

## Emergency Recovery

If OTA fails AND the rollback fails (extremely unlikely with dual partitions):

1. Physical access required
2. Connect USB-C cable
3. Hold BOOT button + press RESET to enter bootloader mode
4. Flash firmware via Arduino IDE as usual
5. This is the only scenario where physical access is needed after initial deployment
