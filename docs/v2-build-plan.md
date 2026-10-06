# Mailbox V2 Build Plan

> Status: V2 hardware architecture and bill of materials captured 2026-10-06.
> This public project document intentionally excludes order numbers, delivery
> addresses, phone numbers, and payment details.

## V2 Goal

V2 moves the physical mailbox from the V1 read-and-chime prototype toward a
feature-first build with richer interaction:

- larger portrait display
- OTA-updatable picture and audio media cache
- real speaker/audio playback
- translucent glowing heart
- capacitive heart-back interaction
- haptic heartbeat feedback
- flag position sensing
- larger battery
- redesigned internal tray that fits the real soldered-header ESP32 board

The guiding rule for this revision is to solve the feature architecture before
committing to enclosure geometry or one-off hardware shortcuts.

## Architecture Decisions

| Area | V2 decision | Rationale |
|---|---|---|
| Controller | Reuse SparkFun Thing Plus ESP32-C5 | V1 already validated Wi-Fi, HTTPS polling, OTA, Qwiic, display, and battery behavior on this board |
| Display | Move to Adafruit 2.8" TFT LCD with capacitive touch and EYESPI/microSD, Product ID 2090 | Larger portrait screen, EYESPI cabling path, onboard microSD socket |
| Media storage | Store downloaded pictures and audio on the TFT #2090 microSD card | Keeps heavy media out of ESP32 flash and lets firmware manage OTA-downloaded assets |
| Audio | ESP32-managed playback: microSD media -> I2S -> MAX98357A amp -> enclosed speaker | Supports OTA media updates; avoids a separate audio board whose SD card is not ESP32-managed |
| Heart input | Copper foil electrode + MPR121 capacitive touch sensor | Enables heart-back / reply interaction without relying only on a push button |
| Heart output | Translucent printed heart + NeoPixel Jewel backlight | Makes the heart part of the enclosure instead of an external indicator |
| Haptics | DRV2605L haptic controller + vibrating mini motor disc | Adds heartbeat/tactile notification patterns |
| Flag sensing | Digital Hall-effect sensor + small magnet / reed-switch fallback | Lets firmware detect or confirm when the physical flag is lowered |
| Battery | Redesign around 2200mAh cylindrical LiIon battery | Larger display, audio, LEDs, and haptics increase power demand |
| Mechanical baseline | Redesign floor/tray from scratch | The existing tray does not account for ESP32 bottom-soldered headers or the cylindrical battery |

## Bill of Materials

### Reused / Already In Stock

| Part | Qty | Source | Build purpose |
|---|---:|---|---|
| SparkFun Thing Plus ESP32-C5 | 1 | In stock | Main controller, Wi-Fi, OTA, Qwiic, LiPo charging |
| 18-pin EYESPI FPC cable | 1 | In stock | Display-to-host cabling path |
| EYESPI breakout / host-side wiring path | 1 | In stock | Prototyping and signal breakout |
| SparkFun Qwiic Button with LED | 1 | In stock | Physical fallback / alternate interaction control |
| SparkFun VEML6030 ambient light sensor | 1 | In stock | Auto-dim / ambient-light input |
| SG90 micro servo | 1 | In stock | Mailbox flag actuation |
| Qwiic cables | As needed | In stock | I2C daisy-chain wiring |

### Ordered for V2

| Product ID / Item | Qty | Build purpose |
|---|---:|---|
| Adafruit #2090, 2.8" TFT LCD with capacitive touch, EYESPI connector, and microSD socket | 1 | Larger display and ESP32-accessible media storage |
| Adafruit #3006, MAX98357A I2S 3W Class-D mono amplifier | 1 | ESP32-managed audio playback |
| Adafruit #3351, mono enclosed speaker, 3W 4 ohm | 1 | Audio output |
| ScoutMakes / Adafruit #6051, DRV5032 digital magnetic Hall-effect sensor | 1 | Flag position sensing |
| Adafruit #375, magnetic contact switch | 1 | Magnet source / fallback contact sensor |
| Adafruit #1781, 3.7V 2200mAh cylindrical LiIon battery | 1 | Larger V2 power reserve |
| Adafruit #2226, NeoPixel Jewel | 1 | Translucent heart glow / pulse |
| Adafruit #4830, MPR121 capacitive touch sensor | 1 | Touch-heart / heart-back input |
| Adafruit #1127, copper foil tape with conductive adhesive | 1 | Touch electrode behind or around the heart |
| Adafruit #2305, DRV2605L haptic motor controller | 1 | Heartbeat vibration effects |
| Adafruit #1201, vibrating mini motor disc | 1 | Haptic output |
| Adafruit #3314, half-size breadboard + jumper bundle | 1 | ESP32 fanout/prototyping and shared power/ground rows |
| Lexar E-Series 32GB microSDHC UHS-I card, 3-pack | 1 | Media cache for downloaded pictures and audio files |

### Still Pending After CAD Review

| Item | Why it remains pending |
|---|---|
| Speaker gasket, grille, and acoustic chamber details | Depends on speaker placement and enclosure vent geometry |
| M2/M2.5 screws, heat-set inserts, or self-tapping screws | Depends on final display, speaker, sensor, and tray mounts |
| Optional separate microSD breakout | Only needed if the #2090 TFT microSD slot is mechanically inaccessible or electrically inconvenient |

## Media and OTA Model

The ESP32 should own the media lifecycle:

1. Poll backend for message metadata and media URLs.
2. Download images and audio over HTTPS.
3. Store large media assets on the microSD card.
4. Keep firmware, credentials, and lightweight configuration in ESP32 flash.
5. Use a cache cleanup policy so old media does not fill the card.

This replaces the earlier SparkFun WAV Trigger / Qwiic Speaker Amp path. That
path remains on hold because its audio files live on the audio board's own SD
card rather than storage managed directly by the ESP32 firmware.

## Mechanical Design Implications

The existing V1/V2 tray assumptions are obsolete:

- The ESP32-C5 has soldered bottom headers/pins and cannot sit flush in the
  previous tray model.
- The Adafruit #1781 battery is a cylindrical 69mm x 18mm cell, not a flat LiPo
  pouch.
- The display, speaker, haptic motor, Hall sensor, NeoPixel, copper electrode,
  MPR121 board, and microSD access all need serviceable placement.

The next enclosure revision should model:

- raised ESP32 clearance or breadboard-style fanout
- lengthwise or crosswise #1781 battery placement
- #2090 display mount with microSD access path
- translucent printed heart insert
- NeoPixel cavity behind the heart
- copper electrode behind or around the heart
- haptic motor bonded to a surface that can transmit vibration
- speaker chamber and vent path
- Hall sensor and magnet alignment for flag state detection

## Wiring / Address Notes To Validate

| Item | Validation needed |
|---|---|
| #2090 TFT + microSD sharing | Confirm SPI chip-select assignments and whether TFT + SD can share the same bus cleanly |
| MAX98357A | Select I2S BCLK, LRCLK, and DIN pins that do not conflict with display SPI or servo |
| MPR121 and DRV2605L | Check default I2C addresses before final wiring; if both occupy the same address, change the MPR121 address |
| NeoPixel Jewel | Pick a free GPIO and add level/power considerations if brightness is high |
| Hall sensor | Decide pull-up/down behavior and magnet placement after flag geometry is modeled |
| Power budget | Recalculate current draw for TFT backlight, NeoPixels, audio amp, haptics, servo, and ESP32 Wi-Fi bursts |

## Build Sequence

1. Confirm the new component footprints and connector orientations.
2. Breadboard the new I2C devices and scan addresses.
3. Validate TFT #2090 display and microSD access from the ESP32.
4. Validate SD-backed image read/write and simple cache cleanup.
5. Validate MAX98357A I2S audio playback from a file on microSD.
6. Validate NeoPixel Jewel brightness through translucent printed samples.
7. Validate MPR121 touch-heart detection through the printed heart/copper stack.
8. Validate DRV2605L haptic effects and motor placement.
9. Validate Hall sensor/magnet flag-state detection.
10. Redesign the enclosure floor/tray around validated placements.
11. Print a fit coupon before committing to a full enclosure print.

