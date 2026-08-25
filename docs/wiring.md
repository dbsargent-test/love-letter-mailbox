# Wiring Guide

## Overview

The mailbox uses two communication interfaces:
- **SPI** — for the TFT display (7 wires)
- **Qwiic (I2C)** — for the light sensor, buzzer, and button (daisy-chained, no soldering)

Plus one **PWM signal wire** for the servo.

---

## SparkFun Thing Plus ESP32-C5 Pinout Reference

The Thing Plus uses the Adafruit Feather pinout. Key pins for this project:

| Function | ESP32-C5 Pin | Notes |
|----------|-------------|-------|
| SPI MOSI | GPIO 7 | Display data |
| SPI SCLK | GPIO 6 | Display clock |
| TFT CS | GPIO 14 | Display chip select |
| TFT DC | GPIO 21 | Display data/command |
| TFT RST | GPIO 10 | Display reset |
| TFT BLK | GPIO 11 | Display backlight (PWM for dimming) |
| Servo Signal | GPIO 5 | PWM output to SG90 |
| Qwiic SDA | GPIO 1 | I2C data (Qwiic connector) |
| Qwiic SCL | GPIO 0 | I2C clock (Qwiic connector) |
| USB 5V | VUSB | Servo power |
| 3.3V | 3V3 | Display power |
| GND | GND | Common ground |

> **Note:** Pin assignments may vary. Verify against the [SparkFun Thing Plus ESP32-C5 hookup guide](https://docs.sparkfun.com/SparkFun_Thing_Plus_ESP32-C5/) before wiring. The pins above are starting points — update `User_Setup.h` in TFT_eSPI to match your actual wiring.

---

## TFT Display Wiring (SPI)

Connect the 2.0" ST7789 display to the ESP32-C5:

| Display Pin | ESP32-C5 Pin | Wire Color (suggested) |
|------------|-------------|----------------------|
| GND | GND | Black |
| VCC | 3V3 | Red |
| SCL (SCLK) | GPIO 6 | Yellow |
| SDA (MOSI) | GPIO 7 | Blue |
| RES (RST) | GPIO 10 | White |
| DC | GPIO 21 | Green |
| CS | GPIO 14 | Orange |
| BLK | GPIO 11 | Purple (or 3V3 for always-on) |

**Important:**
- VCC must be **3.3V**, not 5V
- BLK controls the backlight. Connect to a GPIO for software-controlled dimming (using the light sensor), or connect to 3V3 for always-on
- If your display has different pin labels, refer to the ST7789 datasheet

---

## Servo Wiring

Connect the SG90 micro servo:

| Servo Wire | Connect To | Notes |
|-----------|-----------|-------|
| Brown (GND) | GND | Common ground with ESP32 |
| Red (VCC) | VUSB (5V) | Power from USB 5V rail, NOT 3.3V |
| Orange (Signal) | GPIO 5 | PWM signal |

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
VEML6030 Light Sensor (0x48)
    │
    │  [Qwiic Cable 200mm]
    │
    ▼
Qwiic Buzzer (0x34)
    │
    │  [Qwiic Cable 200mm]
    │
    ▼
Qwiic Button (0x6F)
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
 ┌── TFT Display ──┤ GPIO 6  ← SCL (SPI)     │
 │   (SPI, 7 wires)│ GPIO 7  ← SDA (SPI)     │
 │                  │ GPIO 14 ← CS            │
 │                  │ GPIO 21 ← DC            │
 │                  │ GPIO 10 ← RST           │
 │                  │ GPIO 11 ← BLK           │
 │                  │ 3V3     ← VCC           │
 │                  │ GND     ← GND           │
 │                  │                         │
 ├── Servo ────────┤ GPIO 5  ← Signal        │
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
3. **Serial Monitor (115200 baud):** The firmware logs:
   - I2C scan results (should find 4 devices)
   - WiFi connection status
   - Display initialization
   - Servo sweep test
4. **Expected on first boot:** The display shows the WiFi setup captive portal instructions
