# 📬 Love Letter Mailbox — DIY WiFi Messenger

A palm-sized, WiFi-connected mailbox that displays text messages and photos on a color screen. When a message arrives, a red flag rises and a chime plays. Inspired by [Love Letter Tech](https://lovelettertech.com), built from scratch with off-the-shelf components.

**Send a message from any phone → it appears on the mailbox. No app install required.**

![Architecture Overview](assets/architecture-diagram.png)

---

## ✨ Features

- 📱 **Send messages from any browser** — no app to install, works on any phone/tablet/computer
- 📸 **Photo support** — send photos that render on the 2.0" color IPS display
- 🚩 **Physical flag** — servo raises a red flag when a new message arrives
- 🔔 **Notification chime** — Qwiic buzzer plays a tone on message arrival
- 🌙 **Auto-dimming** — ambient light sensor dims the display at night
- 🔘 **Physical button** — mark messages as read, scroll through message history
- 🔄 **Over-the-air updates** — push firmware updates remotely, no physical access needed
- 🔋 **Battery backup** — LiPo battery keeps the device running through power blips
- 📡 **Dual-band WiFi 6** — works on 2.4GHz AND 5GHz networks (no band-steering headaches)
- ☁️ **Azure-hosted backend** — reliable, free-tier, Microsoft infrastructure
- 🔒 **Encrypted** — all communication over HTTPS

---

## 💰 Cost Comparison

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

## 🛒 Bill of Materials

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

---

## 🏗️ System Architecture

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
                                │  │ 2.0" TFT (text │  │
                                │  │ + photos)      │  │
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

## 🚀 Quickstart

### 1. Deploy the Azure Backend
See [docs/azure-setup.md](docs/azure-setup.md) for step-by-step instructions.

### 2. Flash the Firmware
See [docs/firmware-setup.md](docs/firmware-setup.md) for Arduino IDE setup and flashing.

### 3. Wire the Hardware
See [docs/wiring.md](docs/wiring.md) for pin connections and Qwiic daisy-chain.

### 4. Print the Enclosure
STL files in [`/enclosure`](enclosure/). Any FDM printer works.

### 5. Connect and Send Messages
Open the messaging web page, type a message, hit send. Watch the flag rise. ❤️

---

## 📖 Documentation

| Guide | Description |
|-------|-------------|
| [Architecture](docs/architecture.md) | System design, failure analysis, and design decisions |
| [Bill of Materials](docs/bom.md) | Complete parts list with purchase links |
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
| Original features replicated | 8 of 10 (80%) |
| Features added beyond original | 9 |
| Scope creep ratio | 0.9x |
| Cost vs commercial ($129) | **$57/unit (56% cheaper)** |
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
