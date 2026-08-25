# Architecture & Design Decisions

## Overview

The Love Letter Mailbox is a WiFi-connected IoT device that receives text messages and photos from a web interface and displays them on a color TFT screen. A servo-driven flag rises when a new message arrives, a buzzer plays a notification chime, and a button allows the recipient to mark messages as read.

## Design Principles

1. **Minimize failure modes** — every architectural choice prioritizes reliability over cleverness
2. **No persistent connections** — HTTP polling over MQTT/WebSockets to eliminate connection state management
3. **No native app** — a static web page works on any device without installation or app store approval
4. **Pre-process on the sender** — resize photos in the browser, not on the ESP32
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
3. Browser resizes photo to 240×320 (if attached)
4. JavaScript POSTs to Azure Function: POST /api/messages
5. Azure Function writes to Table Storage:
   - PartitionKey: device ID
   - RowKey: timestamp
   - Text: message content
   - PhotoUrl: Blob Storage URL (if photo)
   - Read: false
6. Function returns 200 OK
```

### Receiving a Message

```
1. ESP32-C5 polls GET /api/messages?unread=true every 5 seconds
2. If unread messages exist:
   a. Raise servo flag
   b. Play buzzer chime
   c. Display message text on TFT
   d. If photo: download from Blob Storage URL, decode, render on TFT
3. When button pressed:
   a. Mark message as read: PATCH /api/messages/{id}
   b. Lower servo flag
   c. Show next unread message (if any) or return to idle screen
```

### OTA Firmware Update

```
1. On boot + every 24 hours: GET /api/firmware-version
2. Compare server version string to local version
3. If server > local:
   a. Download .bin from Azure Blob Storage
   b. Write to OTA partition B
   c. Verify checksum
   d. Set boot partition to B
   e. Reboot
4. If new firmware crashes (watchdog triggers):
   a. ESP32 auto-boots back to partition A (previous working version)
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
