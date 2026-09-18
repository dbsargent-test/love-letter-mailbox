# Architecture & Design Decisions

## Lessons Learned

### 2026-09-17 — SPI animations must not clear the full display per frame

The first floating-hearts screensaver cleared and redrew the entire 320×240
ST7789 every 120 ms. Because the display has no frame buffer or vertical-sync
swap, the cleared frame became visible over SPI and made the screen blink.

Animated elements now move in side lanes around a static central panel. Each
frame erases only the previous heart bounds and draws the new positions.
`tests\regression\test-landscape-screensaver-prefetch.ps1` rejects any return
of `display.fillScreen()` to the animated frame renderer.

### 2026-09-17 — Session revocation must be global and fail closed

Password changes previously revoked only the token used for the request, while
password resets revoked no active sessions. Revocation-table errors were also
treated as "not revoked," allowing stolen seven-day JWTs to survive account
recovery or a storage outage.

Every user now has a monotonic `sessionVersion` included in JWTs and checked
against Table Storage on every protected request. Password changes and resets
increment the version, invalidating all older sessions. Revocation lookup
returns "not revoked" only for an explicit entity-not-found response; other
storage failures return an authentication-service error rather than accepting
the token. Device credentials are accepted only through `x-device-key`, never
through query strings.

### 2026-09-16 — Native image dependencies must match the SWA runtime

The first image-normalization deployment returned HTTP 500 from the messages
function because Windows SWA CLI packaged only Sharp's Windows ARM64 native
binary, while Azure Static Web Apps runs Linux x64. The API source and package
lock were correct, which made the failure invisible to local tests.

Before every Windows-originated SWA deployment, run `npm --prefix web\api run
prepare:swa` to add Sharp and libvips for Linux x64 to the local deployment
tree. `tests\regression\test-swa-sharp-runtime.ps1` prevents removal of that
deployment gate.

### 2026-09-16 — Qwiic queue values are elapsed ages, not timestamps

The Qwiic Button maintains separate press and click queues. Their values are
milliseconds elapsed since each event, and unmatched press entries can remain
in the device queue. Pairing the oldest values without resynchronization caused
a quick tap to be measured as a 270,584 ms hold.

The firmware now discards implausible unmatched entries, computes hold duration
from paired ages, reconstructs the click time as `millis() - clickAge`, and
logs the selected action. The double-click window is 750 ms because USB traces
showed a normal double press at 707 ms. The regression guard is
`tests\regression\test-button-gesture-timing.ps1`.

## Overview

The Love Letter Mailbox is a WiFi-connected IoT device that receives text messages and photos from a web interface and displays them on a color TFT screen. A servo-driven flag rises when a new message arrives, a buzzer plays a notification chime, and a button allows the recipient to mark messages as read.

## Design Principles

1. **Minimize failure modes** — every architectural choice prioritizes reliability over cleverness
2. **No persistent connections** — HTTP polling over MQTT/WebSockets to eliminate connection state management
3. **No native app** — a static web page works on any device without installation or app store approval
4. **Normalize once in the backend** — browser previews are optimized, but the
   API authoritatively rotates and scales every stored photo
5. **Vendor-portable** — the ESP32 code is just "fetch JSON from a URL"; swap backends by changing one URL

---

## Component Selection Rationale

### ESP32-C5 (over classic ESP32)

| Factor | ESP32 (classic) | ESP32-C5 |
|--------|----------------|----------|
| WiFi | 2.4GHz only | **Dual-band 2.4 + 5GHz WiFi 6** |
| RAM | 520KB SRAM | 384KB SRAM + **8MB PSRAM** |
| Flash | 4MB | **8MB** |
| Battery | External charging circuit needed | **Built-in LiPo charger + fuel gauge** |
| Power safety | Brownout-prone on WiFi TX | LiPo battery acts as capacitor |

**Decision:** The ESP32-C5 eliminates the two most common IoT project failures:
1. **2.4GHz WiFi incompatibility** with modern routers that use band steering
2. **Memory crashes** when decoding photos (8MB PSRAM vs 520KB SRAM)

The $19 premium ($25 vs $6) is justified by the elimination of these failure modes.

### Azure Static Web App + Table Storage (over Firebase, MQTT, Blynk)

Three architectures were evaluated:

#### Option A: Firebase Realtime DB + PWA
- **Pros:** Well-documented, free tier generous, real-time listeners
- **Cons:** Google dependency, Firebase SDK on ESP32 is heavy, vendor lock-in
- **Score:** 8.0/10

#### Option B: MQTT (HiveMQ) + Telegram Bot
- **Pros:** MQTT is resilient by design, Telegram is battle-tested
- **Cons:** Needs bridge server between Telegram and MQTT (single point of failure), more moving parts
- **Score:** 8.0/10

#### Option C: Azure Static Web App + Table Storage ✅ SELECTED
- **Pros:** Fewest moving parts, ESP32 just does HTTP GET, Table Storage is nearly indestructible (99.999999999% durability), $0.01/mo cost, no SDK needed
- **Cons:** Polling instead of push (5-second delay is acceptable for a mailbox)
- **Score:** 9.7/10

**Decision:** Option C wins on simplicity, cost, and failure resistance. The ESP32 code is just `HTTPClient.GET()` — no MQTT library, no Firebase SDK, no connection state to manage. If Azure ever changes, swapping to any JSON endpoint takes ~10 lines of code change.

### 2.0" ST7789 TFT (over 1.3", 1.69", 2.4")

| Display | Resolution | Photo Quality | Enclosure Fit |
|---------|-----------|---------------|---------------|
| 1.3" | 240×240 | Too small for photos | Very compact |
| 1.69" | 240×280 | Recognizable but tight | Compact |
| **2.0"** | **240×320** | **Good — natural photo aspect ratio** | **Palm-sized mailbox** |
| 2.4" | 240×320 | Good | Enclosure gets bulky |

**Decision:** 2.0" is the sweet spot. 240×320 matches standard photo aspect ratios, avoiding letterboxing. Physically only ~5mm larger than 1.69" but noticeably better for photo viewing.

---

## Failure Analysis

### Risk Register

| # | Failure Mode | Pre-Mitigation Risk | Mitigation | Post-Mitigation Risk |
|---|-------------|-------------------|------------|---------------------|
| 1 | 2.4GHz WiFi band-steering | HIGH | ESP32-C5 dual-band WiFi 6 | **ELIMINATED** |
| 2 | Cloud service changes/dies | MEDIUM | Azure Table Storage (oldest Azure service), no SDK lock-in, swap backend in 10 lines | **LOW** |
| 3 | WiFi reconnect failures | HIGH | WiFi 6 better connection management + hardware watchdog + exponential backoff | **LOW** |
| 4 | Power brownouts | MEDIUM | LiPo battery acts as UPS during voltage dips | **ELIMINATED** |
| 5 | TLS cert expiration | LOW | Azure-managed certs, Arduino core updates CA bundle | **VERY LOW** |
| 6 | Photo decode OOM crash | MEDIUM | 8MB PSRAM for decode buffer; fallback: pre-convert to RGB565 in browser | **ELIMINATED** |
| 7 | Web UI/app maintenance | MEDIUM | Static HTML/JS, no framework dependencies, no native app | **LOW** |
| 8 | WiFi provisioning confusion | HIGH | Captive portal + dual-band means no "split your SSID" instructions needed | **LOW** |

### Resilience Features

- **Hardware watchdog:** Auto-reboots ESP32 after 60 seconds of unresponsiveness
- **Exponential backoff:** WiFi reconnect attempts with increasing delays (1s, 2s, 4s, 8s... max 60s)
- **Dual OTA partitions:** Failed firmware update auto-rolls back to previous working version
- **Message persistence:** Azure Table Storage holds last 20 messages; ESP32 fetches unread on boot
- **Offline display:** Last message stays on screen even if WiFi drops
- **Battery fuel gauge:** Firmware can warn when battery is low (display icon)

---

## Data Flow

### Sending a Message

```
1. User opens web page on phone/computer
2. Types message and/or attaches photo
3. Browser creates an aspect-ratio-preserving preview within 216×160
4. JavaScript POSTs to Azure Function: POST /api/messages
5. Azure Function rotates the photo from metadata, strips metadata, converts it
   to baseline JPEG, and fits it inside 216×160 without cropping, stretching,
   enlarging, or changing portrait/landscape orientation
6. Azure Function writes to Table Storage:
   - PartitionKey: device ID
   - RowKey: timestamp
   - Text: message content
   - PhotoUrl: Blob Storage URL (if photo)
   - Read: false
7. Function returns 200 OK
```

### Receiving a Message

```
1. ESP32-C5 polls GET /api/messages?unread=true every 5 seconds
2. If unread messages exist:
   a. Raise servo flag
   b. Play buzzer chime
   c. Display message text on TFT
   d. If photo: use one of two RAM cache slots or download from Blob Storage,
      decode, center, and render without changing its aspect ratio
3. When button pressed:
   a. Mark message as read: PATCH /api/messages/{id}
   b. Lower servo flag
   c. Show next unread message (if any) or return to idle screen
```

### OTA Firmware Update

```
1. On boot + every 15 minutes: GET /api/device/firmware
2. Compare server version string to local version
3. If server > local:
   a. Download .bin from Azure Blob Storage
   b. Write to OTA partition B
   c. Verify checksum
   d. Set boot partition to B
   e. Reboot
4. The new image is confirmed only after display and I2C peripherals initialize
5. If the pending image reboots before confirmation, the ESP32 bootloader can
   return to the previous OTA partition
```

---

## Qwiic Daisy-Chain

All I2C peripherals connect via the Qwiic connector system — no soldering required:

```
ESP32-C5 Qwiic Port
    │
    ├── [200mm cable] ── VEML6030 Light Sensor
    │                         │
    │                    [200mm cable]
    │                         │
    │                    Qwiic Buzzer
    │                         │
    │                    [200mm cable]
    │                         │
    │                    Qwiic Button
    │
    └── [SPI wires] ── 2.0" ST7789 TFT Display
    │
    └── [signal wire] ── SG90 Servo
```

### I2C Addresses (no conflicts)
| Device | Address |
|--------|---------|
| VEML6030 | 0x48 |
| Qwiic Buzzer (ATtiny84) | 0x34 |
| Qwiic Button | 0x6F |
| MAX17048 Fuel Gauge (onboard) | 0x36 |

---

## Azure Resource Summary

| Resource | Tier | Monthly Cost | Purpose |
|----------|------|-------------|---------|
| Static Web App | Free | $0 | Hosts messaging web page + API functions |
| Storage Account (Table) | Standard | ~$0.01 | Message storage |
| Storage Account (Blob) | Standard | ~$0.01 | Photo storage + OTA firmware binaries |
| **Total** | | **~$0.02/mo** | |

All resources fit within the Azure free tier and/or the $200/mo Visual Studio Enterprise credit.

---

## Future Enhancements (v2+)

- [ ] Voice messages (I2S DAC + speaker)
- [ ] Emoji rendering (custom font with emoji glyphs)
- [ ] Weather display on idle screen
- [ ] Multiple device pairing (family group messaging)
- [ ] E-ink display option for ultra-low power
- [ ] Custom notification melodies
- [ ] Read receipts (sender sees when message was viewed)
- [ ] Message reactions (button press sends ❤️ back to sender)
