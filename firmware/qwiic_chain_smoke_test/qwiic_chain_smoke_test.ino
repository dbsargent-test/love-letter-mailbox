#include <Adafruit_GFX.h>
#include <Adafruit_ST7789.h>
#include <SPI.h>
#include <SparkFun_Qwiic_Button.h>
#include <SparkFun_Qwiic_Buzzer_Arduino_Library.h>
#include <SparkFun_VEML6030_Ambient_Light_Sensor.h>
#include <Wire.h>

constexpr uint8_t TFT_CS = 6;
constexpr uint8_t TFT_DC = 5;
constexpr uint8_t TFT_RST = 4;
constexpr uint8_t TFT_LITE = 3;
constexpr uint8_t BUTTON_ADDRESS = 0x6F;
constexpr uint8_t LIGHT_ADDRESS = 0x48;
constexpr uint8_t BUZZER_ADDRESS = 0x34;

Adafruit_ST7789 display(&SPI, TFT_CS, TFT_DC, TFT_RST);
QwiicButton button;
SparkFun_Ambient_Light lightSensor(LIGHT_ADDRESS);
QwiicBuzzer buzzer;

void showError(const char *device) {
  display.fillScreen(ST77XX_RED);
  display.setTextColor(ST77XX_WHITE, ST77XX_RED);
  display.setTextSize(2);
  display.setTextWrap(false);
  display.setCursor(24, 120);
  display.print(device);
  display.setCursor(24, 160);
  display.print("CHECK CABLE");
}

void showReadings(long lux, bool pressed) {
  const uint16_t background = pressed ? ST77XX_BLUE : ST77XX_GREEN;
  const uint16_t foreground = pressed ? ST77XX_WHITE : ST77XX_BLACK;

  display.fillScreen(background);
  display.setTextColor(foreground, background);
  display.setTextSize(2);
  display.setTextWrap(false);
  display.setCursor(24, 90);
  display.print(pressed ? "BUTTON PRESSED" : "QWIIC CHAIN OK");
  display.setCursor(24, 140);
  display.print("LIGHT:");
  display.setCursor(24, 180);
  display.print(lux);
  display.print(" LUX");
}

void setup() {
  Serial.begin(115200);
  delay(1500);

  pinMode(TFT_LITE, OUTPUT);
  digitalWrite(TFT_LITE, HIGH);

  SPI.begin(SCK, MISO, MOSI, TFT_CS);
  display.init(240, 320);
  display.setRotation(0);

  Wire.begin();
  Serial.printf("I2C pins: SDA=%u SCL=%u\n", SDA, SCL);

  if (!button.begin(BUTTON_ADDRESS, Wire)) {
    Serial.println("Qwiic Button not detected at 0x6F.");
    showError("BUTTON ERROR");
    while (true) {
      delay(1000);
    }
  }

  if (!lightSensor.begin(Wire)) {
    Serial.println("VEML6030 not detected at 0x48.");
    showError("SENSOR ERROR");
    while (true) {
      delay(1000);
    }
  }

  if (!buzzer.begin(BUZZER_ADDRESS, Wire)) {
    Serial.println("Qwiic Buzzer not detected at 0x34.");
    showError("BUZZER ERROR");
    while (true) {
      delay(1000);
    }
  }

  button.LEDoff();
  Serial.printf("Qwiic Button detected. Device ID: 0x%02X\n",
                button.deviceID());
  Serial.println("VEML6030 detected at 0x48.");
  Serial.println("Qwiic Buzzer detected at 0x34.");

  buzzer.configureBuzzer(SFE_QWIIC_BUZZER_RESONANT_FREQUENCY, 150,
                         SFE_QWIIC_BUZZER_VOLUME_MID);
  buzzer.on();
  Serial.println("Buzzer confirmation tone played.");
}

void loop() {
  static bool previousPressed = false;
  static long previousLux = -1;
  static unsigned long lastSample = 0;

  const bool pressed = button.isPressed();
  if (pressed != previousPressed) {
    previousPressed = pressed;
    if (pressed) {
      button.LEDon(100);
      buzzer.configureBuzzer(SFE_QWIIC_BUZZER_RESONANT_FREQUENCY, 100,
                             SFE_QWIIC_BUZZER_VOLUME_MID);
      buzzer.on();
      Serial.println("Button pressed.");
    } else {
      button.LEDoff();
      Serial.println("Button released.");
    }
  }

  if (millis() - lastSample >= 500) {
    lastSample = millis();
    const long lux = lightSensor.readLight();
    Serial.printf("Ambient light: %ld lux\n", lux);

    if (lux != previousLux || pressed != previousPressed) {
      previousLux = lux;
      showReadings(lux, pressed);
    } else {
      showReadings(lux, pressed);
    }
  }

  delay(20);
}
