# Troubleshooting Guide

## WiFi Issues

### Device won't connect to WiFi
1. **Check band compatibility:** The ESP32-C5 supports both 2.4GHz and 5GHz. Most routers work out of the box.
2. **Verify credentials:** SSID and password are case-sensitive. Check for trailing spaces.
3. **WPA3 networks:** The ESP32-C5 supports WPA3, but if you have issues, try WPA2 mode on your router.
4. **Hidden SSIDs:** Not recommended. Use a visible SSID.
5. **Check the TFT display:** The firmware shows WiFi status and error codes on the screen during connection.

### WiFi keeps disconnecting
1. **Signal strength:** Move the mailbox closer to the router. WiFi through walls is weaker.
2. **Power supply:** Use a quality USB-C cable and a 5V/2A charger. Cheap cables cause voltage drops during WiFi transmission.
3. **Router channel congestion:** If in an apartment, your 2.4GHz channels may be crowded. Try connecting to 5GHz instead (the C5 supports both).
4. **The firmware auto-reconnects** with exponential backoff. If WiFi drops, it will retry automatically. The hardware watchdog reboots the device after 60 seconds of unresponsiveness.

### Captive portal doesn't appear
1. Connect to the `Mailbox-Setup` WiFi network from your phone.
2. If the portal doesn't auto-open, manually navigate to `192.168.4.1` in your browser.
3. Some phones aggressively switch back to cellular. Temporarily disable mobile data.

---

## Display Issues

### Screen is blank/white
1. **Check SPI wiring:** Verify all 7 wires are connected to the correct pins (see [wiring.md](wiring.md)).
2. **Check power:** The display needs 3.3V on VCC, not 5V.
3. **Backlight pin:** Ensure BLK pin is connected to 3.3V (always on) or a GPIO pin.
4. **Wrong driver config:** The firmware is configured for ST7789 240×320. If using a different display, update `User_Setup.h` in TFT_eSPI.

### Screen shows garbled/wrong colors
1. **Color order:** ST7789 uses RGB, not BGR. Check `TFT_RGB_ORDER` in the firmware config.
2. **SPI speed:** If colors are garbled, try reducing SPI frequency from 40MHz to 20MHz.
3. **Offset issue:** Some 2.0" displays have a pixel offset. The firmware includes offset correction — if your display looks shifted, adjust `TFT_ROWSTART` and `TFT_COLSTART`.

### Photos look wrong
1. **File size:** Photos are resized to 240×320 in the browser before upload. If they look distorted, clear your browser cache and try again.
2. **Memory:** The ESP32-C5 has 8MB PSRAM, which should handle any photo. If you see memory errors in the serial console, report it as a bug.

---

## Servo Issues

### Flag doesn't move
1. **Check wiring:** Signal wire to the correct GPIO, VCC to 5V (not 3.3V), GND to GND.
2. **Power:** Servos can draw 200-500mA. If powered from the ESP32's 3.3V pin, the servo may not have enough current. Power the servo from the USB 5V rail.
3. **Try the servo test:** Upload the basic servo sweep example from Arduino IDE to verify the servo hardware works.

### Flag jitters/buzzes
1. **Normal at rest:** SG90 servos can jitter slightly when holding position. The firmware detaches the servo after moving to eliminate jitter.
2. **Power noise:** Add a 100µF capacitor between servo VCC and GND.
3. **Signal noise:** Keep the servo signal wire away from the SPI display wires.

---

## Buzzer Issues

### No sound on message arrival
1. **Check Qwiic cable:** Ensure the cable clicks into both the ESP32-C5 and the buzzer.
2. **I2C address:** The Qwiic Buzzer uses address `0x34`. Run an I2C scanner sketch to verify it's detected.
3. **Volume:** The buzzer has adjustable volume in firmware. Check the volume setting.

---

## Button Issues

### Button press not detected
1. **Check Qwiic cable:** Ensure the daisy-chain is complete (C5 → sensor → buzzer → button).
2. **I2C address:** The Qwiic Button uses address `0x6F`. Run an I2C scanner sketch to verify.
3. **Debounce:** The Qwiic Button has hardware debouncing built in. If it's registering double presses, check the firmware debounce timing.

---

## Azure / Backend Issues

### Messages not arriving on the device
1. **Check the web page:** Send a test message. Does the web page show "Sent!" confirmation?
2. **Check Azure:** Log into the Azure Portal → your Storage Account → Table Storage → Messages table. Is the message there?
3. **Check the device:** Open Serial Monitor in Arduino IDE (USB connected). The firmware logs every HTTP request and response. Look for HTTP error codes.
4. **HTTPS certificate:** If you see TLS/SSL errors, the ESP32's CA certificate bundle may be outdated. Update the Arduino ESP32 core.

### Web page won't load
1. **Check the URL:** Verify you're using the correct Azure Static Web App URL.
2. **Azure status:** Check [status.azure.com](https://status.azure.com) for outages.
3. **DNS:** Try the direct `*.azurestaticapps.net` URL instead of a custom domain.

### OTA update fails
1. **Check firmware binary:** Ensure the `.bin` file was compiled for the ESP32-C5, not a different board.
2. **File size:** The binary must fit in the OTA partition (~3.5MB max with 8MB flash and dual partitions).
3. **Network:** OTA downloads can take 10-30 seconds. Ensure WiFi is stable during the update.
4. **Rollback:** If a bad firmware is flashed, the watchdog timer will trigger a reboot to the previous working version within 60 seconds.

---

## Serial Monitor Debugging

To view logs:
1. Connect the mailbox to your computer via USB-C.
2. Open Arduino IDE → Tools → Serial Monitor → Set baud rate to `115200`.
3. The firmware outputs:
   - WiFi connection status
   - HTTP request/response logs
   - I2C device scan results
   - Message polling results
   - Battery voltage and percentage
   - OTA update status

---

## Factory Reset

If the device is in a bad state:
1. Hold the **BOOT** button on the ESP32-C5 while pressing **RESET**.
2. This enters bootloader mode — you can re-flash firmware via USB.
3. WiFi credentials are stored in NVS (non-volatile storage). To clear them, flash firmware with the "erase all flash" option checked in Arduino IDE.

---

## Getting Help

- **GitHub Issues:** Report bugs or request features
- **Serial logs:** Always include serial monitor output when reporting issues
- **Hardware photos:** Include photos of your wiring when reporting hardware issues
