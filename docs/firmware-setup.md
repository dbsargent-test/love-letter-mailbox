# Firmware Setup

## Current Diagnostic

The first firmware milestone is a display-only smoke test. Keep the LiPo
battery, servo, and Qwiic devices disconnected.

### Required Software

- Arduino IDE 2.x
- Espressif `esp32` board package 3.3.11 or newer
- Adafruit ST7735 and ST7789 Library 1.11.0 or newer
- JPEGDEC 1.8.4 or newer

The Adafruit library installs Adafruit GFX and Adafruit BusIO automatically.

### Reproducible Release Build

The public release binary is intentionally compiled without
`EMBED_PROVISIONING_SECRETS`. It contains no Wi-Fi password, device key, or
deployment URL and reads previously provisioned values from NVS:

```powershell
arduino-cli compile `
  --fqbn "esp32:esp32:sparkfun_esp32c5_thing_plus:PartitionScheme=min_spiffs" `
  firmware\mailbox_firmware
```

Use the Minimal SPIFFS partition because the integrated firmware requires both
OTA slots and more application space than the default layout provides.

### Board and Port

- **Board:** SparkFun ESP32-C5 Thing Plus
- **Arduino FQBN:** `esp32:esp32:sparkfun_esp32c5_thing_plus`
- **Upload port:** Select the COM port that identifies as Espressif USB

### Display Smoke Test

Open:

`firmware/display_smoke_test/display_smoke_test.ino`

The test uses the exposed pins verified for the SparkFun board:

| Function | GPIO |
|----------|------|
| SCK | IO10 |
| MOSI | IO8 |
| TCS | IO6 |
| DC | IO5 |
| RST | IO4 |
| LITE | IO3 |

Compile the sketch before uploading it. A successful test shows four colored
bands with `LOVE LETTER` at the top and `DISPLAY OK` at the bottom. The Serial
Monitor runs at 115200 baud.

Do not connect the servo or LiPo during this diagnostic.

## Servo-Free Message Integration

The next firmware milestone does not require the servo, LiPo, breadboard, or
protoboard. It runs from USB-C and uses the already validated display and
Qwiic chain.

1. Copy
   `firmware/mailbox_firmware/secrets.example.h` to
   `firmware/mailbox_firmware/secrets.h`.
2. Enter the local Wi-Fi name and password in `secrets.h`.
3. Provision a device key:

   ```powershell
   $env:STORAGE_ACCOUNT_NAME = "<storage-account-name>"
   $env:STORAGE_ACCOUNT_KEY = "<storage-account-key>"
   node scripts/provision-device-key.js recipient mailbox-recipient "<iana-time-zone>"
   ```

4. Copy the one-time plaintext key into `DEVICE_KEY` in `secrets.h`.
5. In Arduino IDE, select **Partition Scheme → Minimal SPIFFS (1.9MB APP
   with OTA/128KB SPIFFS)**. The default partition leaves insufficient
   firmware headroom.
6. Define `EMBED_PROVISIONING_SECRETS` only for the initial trusted USB
   provisioning build. Remove the define from normal and OTA release builds.
7. Compile and upload
   `firmware/mailbox_firmware/mailbox_firmware.ino`.

`secrets.h` is excluded from Git. The firmware uses HTTPS certificate
validation through the ESP-IDF root certificate bundle; it does not use an
insecure TLS mode.

### Vertical-Slice Acceptance Test

1. Send a text message to the mailbox from the web app.
2. Confirm the landscape display enters the animated floating-hearts
   screensaver after two minutes without a button interaction. Confirm the
   central panel remains stable without full-screen blinking while the hearts
   move along its sides.
3. Send a photo message while the screensaver is active. Confirm the buzzer
   sounds only after the image has been prefetched and the screensaver remains
   visible.
4. Press the button once and confirm the cached message appears immediately
   without being marked read.
5. Press the button again and confirm the revealed message is marked read.
6. Cover and uncover the light sensor and confirm the backlight changes.
7. Press the Qwiic button.
8. Confirm the message is marked read and is not returned by the next poll.

The servo remains disconnected throughout this test.

## Photo Rendering

The API stores baseline JPEG derivatives that fit inside 216×160 while
preserving the source aspect ratio and portrait/landscape orientation. The
firmware centers the image in the display region without cropping or
stretching.

The ESP32 retains message metadata for up to 20 messages but caches image bytes
for at most two messages. Images outside those two LRU cache slots are
downloaded over authenticated HTTPS when opened. Each downloaded JPEG is
limited to 512KB; an unavailable or invalid image produces a visible fallback
instead of exhausting memory or crashing.
