# Wiring Guide

## Overview

The mailbox uses two communication interfaces:
- **SPI** — for the TFT display (8 wires including power and backlight)
- **Qwiic (I2C)** — for the light sensor, buzzer, and button (daisy-chained, no soldering)

Plus one **PWM signal wire** for the servo.

---

## SparkFun Thing Plus ESP32-C5 Pinout Reference

The verified SparkFun ESP32-C5 Thing Plus pins for this project are:

| Function | ESP32-C5 Pin | Notes |
|----------|-------------|-------|
| SPI MOSI | IO8/PICO | Display data |
| SPI SCLK | IO10/SCK | Display clock |
| TFT CS | IO6 | Display chip select |
| TFT DC | IO5 | Display data/command |
| TFT RST | IO4 | Display reset |
| TFT LITE | IO3 | Display backlight (PWM for dimming) |
| Servo Signal | TBD | IO18 is not exposed; select another safe GPIO after display validation |
| Qwiic SDA | IO23 | I2C data through the onboard Qwiic connector |
| Qwiic SCL | IO24 | I2C clock through the onboard Qwiic connector |
| USB 5V | VUSB | Servo power |
| 3.3V | 3V3 | Display power |
| GND | GND | Common ground |

> These assignments match the SparkFun Arduino board definition and the
> physically completed wiring. IO13, IO14, IO15, and IO18 are not exposed on
> the board headers.

---

## TFT Display Wiring (SPI)

Connect the 2.0" ST7789 display to the ESP32-C5:

| EYESPI Pin | ESP32-C5 Pin | Installed Wire Color |
|------------|-------------|----------------------|
| GND | GND | Black |
| VIN | 3V3 | Brown |
| SCK | IO10/SCK | White |
| MOSI | IO8/PICO | Red |
| TCS | IO6 | Yellow |
| DC | IO5 | Green |
| RST | IO4 | Blue |
| LITE | IO3 | Orange |

**Important:**
- VCC must be **3.3V**, not 5V
- MISO is intentionally unused
- LITE controls the backlight and is connected to IO3 for software dimming
- The initial USB-C power test illuminated the backlight but did not validate
  SPI data or image rendering

---

## Servo Wiring

> **Deferred:** Servo wiring is blocked until a proper common-ground
> distribution point is available. The display already occupies the ESP32-C5
> header GND pin. Do not stack two DuPont connectors on that pin.

Connect the SG90 micro servo:

| Servo Wire | Connect To | Notes |
|-----------|-----------|-------|
| Brown (GND) | GND | Common ground with ESP32 |
| Red (VCC) | VUSB (5V) | Power from USB 5V rail, NOT 3.3V |
| Orange (Signal) | **TBD** | Do not connect until a safe exposed GPIO is selected |

**Important:**
- Power the servo from the **5V USB rail** (VUSB pin), not 3.3V. Servos need 4.8-6V.
- If the servo jitters at rest, the firmware detaches it after movement to stop the jitter.
- Keep the servo signal wire physically separated from the SPI wires to avoid noise.

---

## Qwiic Daisy-Chain (I2C — No Soldering)

All three Qwiic peripherals connect via snap-in cables:

```
ESP32-C5 Qwiic Port
    │
    │  [Qwiic Cable 200mm]
    │
    ▼
Qwiic Button (0x6F)
    │
    │  [Qwiic Cable 200mm]
    │
    ▼
VEML6030 Light Sensor (0x48)
    │
    │  [Qwiic Cable 200mm]
    │
    ▼
Qwiic Buzzer (0x34)
```

**That's it.** Just click the cables in. Each board has two Qwiic connectors (IN and OUT). The order doesn't matter electrically, but the above order keeps cable runs logical inside the enclosure.

### I2C Address Table

| Device | I2C Address | Qwiic? |
|--------|------------|--------|
| VEML6030 Light Sensor | 0x48 | Yes |
| Qwiic Buzzer (ATtiny84) | 0x34 | Yes |
| Qwiic Button | 0x6F | Yes |
| MAX17048 Fuel Gauge (onboard) | 0x36 | Onboard — no wiring |

No address conflicts. All four devices coexist on the same I2C bus.

---

## LiPo Battery

Plug the JST-PH connector into the battery port on the Thing Plus. That's it.

- The onboard MCP73831 charges the battery automatically when USB is connected
- The onboard MAX17048 fuel gauge reports battery voltage and percentage via I2C
- Charge rate: ~214mA at 3.3V

---

## Complete Wiring Summary

```
                    ┌─────────────────────────┐
                    │   ESP32-C5 Thing Plus    │
                    │                         │
 ┌── TFT Display ──┤ IO10    ← SCK            │
 │   (SPI, 8 wires)│ IO8     ← MOSI           │
 │                  │ IO6     ← TCS            │
 │                  │ IO5     ← DC             │
 │                  │ IO4     ← RST            │
 │                  │ IO3     ← LITE           │
 │                  │ 3V3     ← VIN            │
 │                  │ GND     ← GND           │
 │                  │                         │
 ├── Servo ────────┤ TBD     ← Signal        │
 │   (3 wires)     │ VUSB    ← VCC (5V)      │
 │                  │ GND     ← GND           │
 │                  │                         │
 ├── Qwiic Chain ──┤ Qwiic Port (snap-in)    │
 │   (cables only) │ → Light Sensor           │
 │                  │   → Buzzer              │
 │                  │     → Button            │
 │                  │                         │
 └── LiPo Battery ┤ JST Battery Port        │
                    │                         │
                    │ USB-C ← Power + Flash   │
                    └─────────────────────────┘
```

---

## Tools Needed

- Soldering iron + solder (for display header pins, if not pre-soldered)
- Wire strippers
- Small Phillips screwdriver (for servo horn)
- USB-C cable
- Computer with Arduino IDE

---

## Testing After Wiring

1. **Before powering on:** Double-check all connections, especially VCC voltages (3.3V for display, 5V for servo)
2. **Power on via USB-C**
3. Flash `firmware/display_smoke_test/display_smoke_test.ino`
4. **Serial Monitor (115200 baud):** Confirm `Display pattern rendered.`
5. **Expected result:** Four colored bands, `LOVE LETTER`, and `DISPLAY OK`

The I2C, WiFi, servo, and captive-portal tests come after this display-only
diagnostic passes.
