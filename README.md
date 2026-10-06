# 📬 Love Letter Mailbox — DIY WiFi Messenger

A palm-sized, WiFi-connected mailbox that displays text messages and photos on a color screen. When a message arrives, a red flag rises and a chime plays. Inspired by [Love Letter Tech](https://lovelettertech.com), built from scratch with off-the-shelf components.

**Send a message from any phone → it appears on the mailbox. No app install required.**

![Architecture Overview](assets/architecture-diagram.png)

---

## ✨ Current V1 Features

- 📱 **Send messages from any browser** — no app to install, works on any phone/tablet/computer
- 📸 **Photo support** — send photos that render on the V1 2.0" color IPS display
- 🚩 **Physical flag** — servo raises a red flag when a new message arrives
- 🔔 **Notification chime** — Qwiic buzzer plays a tone on message arrival
- 🌙 **Auto-dimming** — ambient light sensor dims the display at night
- 🔘 **Physical button** — mark messages as read, scroll through message history
- 💗 **Read heart receipts** — sent messages show when the recipient has read them
- 🔄 **Over-the-air updates** — push firmware updates remotely, no physical access needed
- 🔋 **Battery backup** — LiPo battery keeps the device running through power blips
- 📡 **Dual-band WiFi 6** — works on 2.4GHz AND 5GHz networks (no band-steering headaches)
- ☁️ **Azure-hosted backend** — reliable, free-tier, Microsoft infrastructure
- 🔒 **Encrypted** — all communication over HTTPS

## ✨ Planned V2 Features

V2 keeps the same Azure/web/ESP32 foundation and upgrades the physical mailbox:

- 🖼️ **Larger portrait display** — Adafruit 2.8" TFT with capacitive touch, EYESPI, and microSD
- 💾 **SD-backed media cache** — downloaded pictures and audio live on the TFT microSD card, not ESP32 flash
- 🎵 **Real audio playback** — ESP32-managed audio over I2S to a MAX98357A amplifier and enclosed speaker
- 💗 **Translucent glowing heart** — 3D-printed translucent heart insert lit by a NeoPixel Jewel
- 👆 **Heart-back touch input** — copper foil electrode and MPR121 capacitive touch sensing
- 💓 **Haptic heartbeat** — DRV2605L haptic controller and vibration motor
- 🧲 **Flag-state sensing** — Hall-effect sensor and magnet/reed-switch fallback
- 🔋 **Larger battery** — 2200mAh cylindrical LiIon cell, requiring a redesigned tray
- 🧰 **Serviceable internal layout** — new floor/tray for ESP32 bottom headers, microSD access, speaker chamber, haptics, and wiring

Full V2 planning is tracked in [docs/v2-build-plan.md](docs/v2-build-plan.md).

---

## 💰 V1 Cost Comparison

| | Love Letter Tech (Commercial) | This Project (DIY) |
|---|---|---|
| **Price** | $129 | **~$92** |
| **Dual-band WiFi** | ❌ (2.4GHz only) | ✅ WiFi 6 dual-band |
| **Battery backup** | ❌ | ✅ 850mAh LiPo |
| **Auto-dimming** | ❌ | ✅ Ambient light sensor |
| **Notification sound** | ❌ | ✅ Qwiic buzzer |
| **Physical button** | ❌ | ✅ Read/scroll |
| **OTA updates** | Unknown | ✅ Remote firmware updates |
| **Open source** | ❌ | ✅ Fully open |
| **Requires app install** | ✅ iOS/Android app | ❌ Any browser works |

---

## 💰 V2 Cost / Capability Snapshot

V2 is no longer optimized only for lowest cost; it is optimized for richer
interaction and OTA-manageable media.

| Area | V1 | V2 plan |
|---|---|---|
| Display | 2.0" ST7789 | 2.8" Adafruit #2090 TFT with capacitive touch and microSD |
| Notification sound | Qwiic buzzer tones | WAV/audio files from microSD through MAX98357A + speaker |
| Heart interaction | Read-heart receipt in web/app flow | Physical glowing/touch/haptic heart |
| Media storage | ESP32 RAM/cache + backend blobs | ESP32-managed microSD cache for downloaded images/audio |
| Battery | 850mAh flat LiPo | 2200mAh cylindrical LiIon |
| Enclosure | V1 tray and display fit | New tray required for bottom headers, battery, heart, speaker, and SD access |
| Incremental V2 purchases | — | Adafruit electronics order + Amazon microSD cards placed |

---

## 🛒 V1 Bill of Materials

| Part | Source | Product | Price |
|------|--------|---------|-------|
| ESP32-C5 Thing Plus (×2) | SparkFun | [Thing Plus ESP32-C5](https://www.sparkfun.com/sparkfun-thing-plus-esp32-c5.html) | $24.95 ea |
| 2.0" TFT Display (2-pack) | Amazon | [XIITIA 2.0" ST7789 240×320 IPS](https://www.amazon.com/dp/B0DFWLD38D) | ~$12 |
| LiPo Battery 850mAh | SparkFun | [Lithium Ion Battery 850mAh](https://www.sparkfun.com/lithium-ion-battery-850mah.html) | $13.61 |
| Ambient Light Sensor | SparkFun | [VEML6030 Qwiic](https://www.sparkfun.com/sparkfun-ambient-light-sensor-veml6030-qwiic.html) | ~$6 |
| Buzzer | SparkFun | [Qwiic Buzzer](https://www.sparkfun.com/sparkfun-qwiic-buzzer.html) | ~$7 |
| Button | SparkFun | [Qwiic Button Red LED](https://www.sparkfun.com/products/15932) | ~$5 |
| Qwiic Cables 200mm (×3) | SparkFun | [Flexible Qwiic Cable 200mm](https://www.sparkfun.com/flexible-qwiic-cable-200mm.html) | $1.95 ea |
| SG90 Micro Servo | On hand | — | $0 |
| 3D Printed Enclosure | Self | STL files in `/enclosure` | ~$1 |
| **Total** | | | **~$92** |

> **Note:** BOM builds TWO complete mailboxes (one for you, one for recipient). Per-unit cost is ~$46.
> V2 uses a different expansion BOM; see [docs/v2-build-plan.md](docs/v2-build-plan.md).

---

## 🛒 V2 Bill of Materials

### Reused / Already In Stock

| Part | Purpose |
|------|---------|
| SparkFun Thing Plus ESP32-C5 | Main controller, Wi-Fi, OTA, Qwiic, LiPo charging |
| 18-pin EYESPI FPC cable | Display cabling |
| EYESPI breakout / host wiring path | Prototyping and signal breakout |
| SparkFun Qwiic Button with LED | Fallback / alternate physical control |
| SparkFun VEML6030 ambient light sensor | Auto-dim / ambient light input |
| SG90 micro servo | Mailbox flag actuation |
| Qwiic cables | I2C daisy-chain wiring |

### Ordered for V2

| Part | Source / ID | Purpose |
|------|-------------|---------|
| 2.8" TFT LCD with capacitive touch, EYESPI, and microSD | Adafruit #2090 | Larger display and media storage |
| MAX98357A I2S 3W Class-D mono amplifier | Adafruit #3006 | ESP32-managed audio playback |
| Mono enclosed speaker, 3W 4Ω | Adafruit #3351 | Audio output |
| DRV5032 digital magnetic Hall-effect sensor | Adafruit / ScoutMakes #6051 | Flag position sensing |
| Magnetic contact switch | Adafruit #375 | Magnet source / fallback contact sensor |
| 2200mAh cylindrical LiIon battery | Adafruit #1781 | Larger V2 power reserve |
| NeoPixel Jewel | Adafruit #2226 | Translucent heart glow |
| MPR121 capacitive touch sensor | Adafruit #4830 | Heart touch / heart-back input |
| Copper foil tape | Adafruit #1127 | Touch electrode |
| DRV2605L haptic motor controller | Adafruit #2305 | Heartbeat vibration effects |
| Vibrating mini motor disc | Adafruit #1201 | Haptic output |
| Half-size breadboard + jumper bundle | Adafruit #3314 | ESP32 fanout and shared power/ground rows |
| Lexar E-Series 32GB microSDHC UHS-I cards, 3-pack | Amazon | Media cache for downloaded pictures and audio |

### V2 Items Still Pending

| Item | Depends on |
|------|------------|
| Speaker gasket, grille, and acoustic chamber | Final speaker location and vent geometry |
| M2/M2.5 screws, heat-set inserts, or self-tapping screws | Final display, speaker, sensor, and tray mounts |
| Optional separate microSD breakout | Only if the #2090 TFT microSD slot is not serviceable |

---

## 🏗️ V1 System Architecture

```
┌─────────────────────┐         ┌──────────────────────┐
│   Any Phone/Browser │         │    Azure Cloud       │
│                     │         │                      │
│  ┌───────────────┐  │  HTTPS  │  ┌────────────────┐  │
│  │ Messaging     │──┼────────►│  │ Static Web App │  │
│  │ Web Page      │  │         │  │ + Azure Func.  │  │
│  └───────────────┘  │         │  └───────┬────────┘  │
└─────────────────────┘         │          │           │
                                │  ┌───────▼────────┐  │
                                │  │ Table Storage   │  │
                                │  │ (messages)      │  │
                                │  └───────┬────────┘  │
                                │          │           │
                                │  ┌───────▼────────┐  │
                                │  │ Blob Storage    │  │
                                │  │ (photos + OTA)  │  │
                                │  └────────────────┘  │
                                └──────────┬───────────┘
                                           │ HTTPS poll
                                           │ every 5s
                                ┌──────────▼───────────┐
                                │   ESP32-C5 Mailbox   │
                                │                      │
                                │  ┌────────────────┐  │
                                │  │ V1 2.0" TFT    │  │
                                │  │ (text + photos)│  │
                                │  ├────────────────┤  │
                                │  │ Servo (flag)   │  │
                                │  ├────────────────┤  │
                                │  │ Buzzer (chime) │  │
                                │  ├────────────────┤  │
                                │  │ Light sensor   │  │
                                │  │ (auto-dim)     │  │
                                │  ├────────────────┤  │
                                │  │ Button (read/  │  │
                                │  │ scroll)        │  │
                                │  ├────────────────┤  │
                                │  │ LiPo (backup)  │  │
                                │  └────────────────┘  │
                                └──────────────────────┘
```

---

## 🏗️ V2 Device Architecture

The cloud/backend remains the same. The physical device changes from a buzzer
and 2.0" display into an ESP32-managed media and interaction hub:

```
Azure Static Web App + Functions + Table/Blob Storage
        │
        │ HTTPS: messages, photos, firmware, media metadata
        ▼
SparkFun Thing Plus ESP32-C5
        │
        ├── SPI / EYESPI ── Adafruit #2090 2.8" TFT
        │                    └── microSD media cache
        │
        ├── I2S ─────────── MAX98357A amp ── enclosed speaker
        │
        ├── GPIO ────────── NeoPixel Jewel behind translucent heart
        │
        ├── I2C/Qwiic ───── VEML6030 light sensor
        │              ├── MPR121 capacitive touch sensor
        │              └── DRV2605L haptic controller ── vibration motor
        │
        ├── GPIO ────────── Hall sensor / magnetic contact path
        │
        ├── PWM ─────────── SG90 flag servo
        │
        └── Battery ─────── 2200mAh cylindrical LiIon
```

The V2 firmware must add microSD file management, audio playback, NeoPixel
effects, capacitive touch, haptic effects, and flag-state sensing before the
new enclosure is treated as final.

---

## 🚀 Quickstart

### V1: Build / Run the Current Device

#### 1. Deploy the Azure Backend
See [docs/azure-setup.md](docs/azure-setup.md) for step-by-step instructions.

#### 2. Flash the Firmware
See [docs/firmware-setup.md](docs/firmware-setup.md) for Arduino IDE setup and flashing.

#### 3. Wire the Hardware
See [docs/wiring.md](docs/wiring.md) for pin connections and Qwiic daisy-chain.

#### 4. Print the Enclosure
STL files in [`/enclosure`](enclosure/). Any FDM printer works.

#### 5. Connect and Send Messages
Open the messaging web page, type a message, hit send. Watch the flag rise. ❤️

### V2: Build Path

V2 is in hardware planning/prototyping, not a ready-to-print release. The next
steps are:

1. Validate the #2090 TFT and microSD from the ESP32-C5.
2. Validate SD-backed image and audio file read/write.
3. Validate MAX98357A I2S audio playback from microSD.
4. Validate NeoPixel glow through translucent print samples.
5. Validate MPR121 touch detection through the heart/copper stack.
6. Validate DRV2605L haptics and motor placement.
7. Validate Hall sensor and magnet alignment for flag position.
8. Redesign the floor/tray around bottom-header ESP32 clearance and #1781 battery placement.
9. Print a fit coupon before printing a full V2 enclosure.

---

## 📖 Documentation

| Guide | Description |
|-------|-------------|
| [Architecture](docs/architecture.md) | System design, failure analysis, and design decisions |
| [Bill of Materials](docs/bom.md) | Complete parts list with purchase links |
| [V2 Build Plan](docs/v2-build-plan.md) | V2 hardware architecture, ordered BOM, media storage, and enclosure implications |
| [Wiring Guide](docs/wiring.md) | Pin connections + Qwiic daisy-chain diagram |
| [Azure Setup](docs/azure-setup.md) | Deploy the backend in 15 minutes |
| [Firmware Setup](docs/firmware-setup.md) | Arduino IDE configuration + flashing |
| [OTA Updates](docs/ota-updates.md) | Push firmware updates remotely |
| [Troubleshooting](docs/troubleshooting.md) | Common issues and fixes |
| [Project Journal](docs/project-journal.md) | Build log, scope tracker, budget, and session history |

---

## 🛡️ Design Philosophy

This project was designed with **failure resistance** as the top priority. Every component choice was made to minimize the chance of the device becoming a paperweight:

- **Dual-band WiFi 6** eliminates the #1 ESP32 failure mode (2.4GHz band-steering hell)
- **Simple HTTP polling** instead of persistent connections — nothing to disconnect
- **Azure Table Storage** — Microsoft's oldest, most durable storage service
- **No native app** — a static web page can't break from app store policy changes
- **OTA updates** — fix bugs remotely without physical access
- **Battery backup** — survives power blips without losing state
- **Watchdog timer** — auto-reboots if firmware hangs

See [docs/architecture.md](docs/architecture.md) for the full failure analysis and design rationale.

---

## 📜 License

MIT License — build one, sell one, modify it, do whatever you want.

---

## 📊 Project Health

| Metric | Value |
|--------|-------|
| Current firmware source | **v1.2.10** |
| V1 physical build | **Complete / validated** |
| V2 hardware planning | **Captured; parts ordered; firmware/CAD not yet implemented** |
| Original features replicated | 8 of 10 (80%) |
| V1 features added beyond original | 9 |
| V1 scope creep ratio | 0.9x |
| V1 cost vs commercial ($129) | **$57/unit (56% cheaper)** |
| V2 primary blocker | **Validate new hardware stack before redesigning enclosure** |
| Monthly hosting cost | ~$0.02 |
| Architecture failure resistance score | **9.7 / 10** |

See [Project Journal](docs/project-journal.md) for full scope creep analysis and build log.

---

## 🌐 Live Backend

| Resource | URL |
|----------|-----|
| Messaging Web App | https://zealous-dune-001e8941e.7.azurestaticapps.net |
| Azure Resource Group | `love-letter-mailbox` (West US 2) |

---

## 🙏 Acknowledgments

Inspired by [Love Letter Tech](https://lovelettertech.com) by Owen O'Brien. This is an independent open-source reimplementation — not affiliated with Love Letter Tech.
