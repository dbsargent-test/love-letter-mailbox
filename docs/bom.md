# Bill of Materials

> **This BOM builds TWO complete mailboxes** (one for you, one for your recipient).
> Per-unit cost: ~$46

## Core Components

| Part | Qty | Source | Product | Unit Price | Total | Notes |
|------|-----|--------|---------|-----------|-------|-------|
| ESP32-C5 Dev Board | 2 | SparkFun | [Thing Plus ESP32-C5](https://www.sparkfun.com/sparkfun-thing-plus-esp32-c5.html) | $24.95 | $49.90 | Dual-band WiFi 6, 8MB PSRAM, 8MB Flash, built-in LiPo charger + fuel gauge |
| 2.0" TFT Display | 2 | Amazon | [XIITIA ST7789 240×320 IPS (2-pack)](https://www.amazon.com/dp/B0DFWLD38D) | $12.00 (pack) | $12.00 | ST7789 driver, SPI, 3.3V, IPS wide viewing angle |
| Micro Servo | 2 | On hand | SG90 9g Micro Servo | — | $0 | Any SG90 clone works. Raises/lowers the flag |
| LiPo Battery | 2 | SparkFun | [Lithium Ion Battery 850mAh](https://www.sparkfun.com/lithium-ion-battery-850mah.html) | $13.61 | $27.22 | JST-PH connector, plugs directly into C5 Thing Plus |

## Qwiic Peripherals

| Part | Qty | Source | Product | Unit Price | Total | Notes |
|------|-----|--------|---------|-----------|-------|-------|
| Ambient Light Sensor | 1+ | SparkFun | [VEML6030 Qwiic](https://www.sparkfun.com/sparkfun-ambient-light-sensor-veml6030-qwiic.html) | ~$6.00 | $6.00 | Auto-dim display at night. I2C addr 0x48 |
| Buzzer | 1+ | SparkFun | [Qwiic Buzzer](https://www.sparkfun.com/sparkfun-qwiic-buzzer.html) | ~$7.00 | $7.00 | Notification chime on message arrival |
| Button | 1+ | SparkFun | [Qwiic Button Red LED](https://www.sparkfun.com/products/15932) | ~$5.00 | $5.00 | Mark as read, scroll messages |
| Qwiic Cable 200mm | 3+ | SparkFun | [Flexible Qwiic Cable 200mm](https://www.sparkfun.com/flexible-qwiic-cable-200mm.html) | $1.95 | $5.85 | One per link in the daisy chain |

## Enclosure & Misc

| Part | Qty | Source | Product | Unit Price | Total | Notes |
|------|-----|--------|---------|-----------|-------|-------|
| 3D Printed Enclosure | 2 | Self | STL files in `/enclosure` | ~$0.50 | $1.00 | PLA filament, any FDM printer |
| Dupont Wires | 1 set | On hand | Assorted M-F, F-F | — | $0 | For SPI display wiring |
| USB-C Cable | 2 | On hand | Any USB-C cable | — | $0 | Power + initial firmware flash |
| Red craft foam/paper | 2 | On hand | For the flag | — | $0 | Glue to servo horn |

## Cost Summary

| Category | Cost |
|----------|------|
| Boards (×2) | $49.90 |
| Displays (2-pack) | $12.00 |
| Batteries (×2) | $27.22 |
| Qwiic peripherals | $23.85 |
| Enclosure + misc | ~$1.00 |
| **Grand Total** | **~$113.97** |
| **Per mailbox** | **~$57** |

## Monthly Operating Cost

| Resource | Cost |
|----------|------|
| Azure Static Web App (Free tier) | $0 |
| Azure Table Storage | ~$0.01 |
| Azure Blob Storage (photos + OTA) | ~$0.01 |
| **Total** | **~$0.02/mo** |

Covered by Azure Visual Studio Enterprise credit ($200/mo).

---

## Alternative Display Options

If the XIITIA 2-pack is unavailable, these are compatible replacements (same ST7789, same libraries):

| Product | Source | Price |
|---------|--------|-------|
| [Adafruit 2.0" 320×240 IPS TFT (Product #4311)](https://www.adafruit.com/product/4311) | Adafruit | $19.95 |
| [NULLLAB 2.0" ST7789 240×320](https://www.amazon.com/NULLLAB-Interface-Compatible-Embedded-Projects/dp/B0GVF8R5ZL) | Amazon | ~$7 |
| [AITRIP 2.0" ST7789 240×320](https://www.amazon.com/AITRIP-2-0inch-Raspberry-Electronics-Projects/dp/B0H8RNZY9M) | Amazon | ~$7 |

## Alternative Battery Options

If the SparkFun 850mAh is unavailable:
- Any single-cell 3.7V LiPo with a **2-pin JST-PH** connector will work
- Adafruit and Amazon carry many options in the 400-1200mAh range
- Larger capacity = longer backup time, but physically bigger
