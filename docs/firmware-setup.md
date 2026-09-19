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

### Windows Application Control

On this Windows machine, Arduino CLI's bundled PyInstaller executables fail
before compilation or upload because Application Control blocks their
temporary Python DLLs. Do not retry `arduino-cli upload` or weaken the policy.
Use the repository helper, which:

- routes `gen_esp32part.py` through the installed policy-compatible Python;
- compiles with Arduino CLI and the verified Espressif core;
- uploads Arduino's generated `flash_args` through `python -m esptool`;
- retains esptool's per-region hash verification.

Compile:

```powershell
.\scripts\esp32c5-toolchain.ps1 `
  -Action Compile `
  -SketchDirectory .\firmware\mailbox_firmware `
  -BuildPath "$env:TEMP\mailbox-firmware-build" `
  -Fqbn "esp32:esp32:sparkfun_esp32c5_thing_plus:PartitionScheme=min_spiffs"
```

After explicit approval to change the connected device, upload:

```powershell
.\scripts\esp32c5-toolchain.ps1 `
  -Action Upload `
  -SketchDirectory .\firmware\mailbox_firmware `
  -BuildPath "$env:TEMP\mailbox-firmware-build" `
  -Port COM4
```

The helper was independently validated on 2026-09-18 by compiling the servo
smoke test at 324,384 bytes of program storage (24%) and 18,284 bytes of
dynamic memory (5%). The servo test was uploaded with installed Python and
esptool; every flash region passed hash verification.

### OTA Hash Rule

For OTA releases, `FIRMWARE_SHA256` must be the **ESP image validation hash**
from:

```powershell
python -m esptool image-info "<build-path>\mailbox_firmware.ino.bin"
```

Do not use `Get-FileHash` or the raw `.bin` SHA-256 for OTA metadata. The
firmware checks the OTA partition with `esp_partition_get_sha256`, which
matches the validation hash reported by `esptool image-info`.

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

### Servo Smoke Test

Keep the LiPo disconnected. Connect the SG90 through the mini breadboard:
orange signal through the purple jumper to IO1, red power through the yellow
jumper to VU/VUSB, and brown ground through the shared black GND row.

Compile with the policy-compatible helper:

```powershell
.\scripts\esp32c5-toolchain.ps1 `
  -Action Compile `
  -SketchDirectory .\firmware\servo_smoke_test `
  -BuildPath "$env:TEMP\servo-smoke-test-build"
```

Upload only while the yellow VUSB jumper is disconnected. After serial reports
stable center PWM, reconnect the yellow jumper and test one command at a time:
`1` for 1200 us, `2` for 1500 us, `3` for 1800 us, `4` for 1000 us, `5`
for 2000 us, and `x` to detach PWM. Commands `4` and `5` are the widest
physically validated nominal positions; they are not guaranteed mechanical
endpoints. The complete sequence passed physical validation on 2026-09-18
without continuous jitter, brownout, or reset.

For supervised calibration, send `p####`, where the pulse is from 800 through
2200 us in 50 us increments. Stop after every command to observe motion and
listen for sustained buzzing. Stepwise physical testing remained quiet across
the 800-2200 us envelope. The clearest conservative expanded range was
850-2150 us; do not infer that 800 and 2200 us are absolute mechanical stops.

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

### Queue-Mode Acceptance Test

1. Send a text message to the mailbox from the web app.
2. Confirm the landscape display enters the animated floating-hearts
   screensaver after two minutes without a button interaction. Confirm the
   central panel remains stable without full-screen blinking while the hearts
   move along its sides.
3. Send a photo message while the screensaver is active. Confirm the playful
   Qwiic buzzer notification sounds only after queued image prefetch is
   attempted, and the screensaver remains visible.
4. Press the button once and confirm the cached current message appears
   immediately without being marked read.
5. Press the button again and confirm the message is marked read, removed from
   ESP memory, and the next queued unread message appears immediately.
6. If there are no queued unread messages, confirm the display returns to the
   idle state, the red Qwiic Button LED turns off, and the servo flag lowers.
7. Cover and uncover the light sensor and confirm the backlight changes.

The physical button intentionally has no back-scroll, double-click, or
long-press behavior. Every non-screensaver press means read the current message
and advance the unread queue.

The Qwiic buzzer is a tone generator, not an audio playback device. Firmware
v1.2.6 uses an original playful multi-beep arrival pattern; spoken phrases or
character-voice laughs would require different audio hardware and licensed
audio assets.

## Photo Rendering

The API stores baseline JPEG derivatives that fit inside 216×160 while
preserving the source aspect ratio and portrait/landscape orientation. The
firmware centers the image in the display region without cropping or
stretching.

The ESP32 polls only the unread queue and retains metadata for up to 20 queued
unread messages. It caches image bytes for at most four messages using LRU
eviction, reserves internal heap and PSRAM headroom before each allocation, and
evicts a message's cached image immediately after that message is marked read.
Each downloaded JPEG is limited to 512KB; an unavailable or invalid image
produces a visible fallback instead of exhausting memory or crashing.
