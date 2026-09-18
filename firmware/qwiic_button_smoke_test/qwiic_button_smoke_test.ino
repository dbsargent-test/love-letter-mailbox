#include <Adafruit_GFX.h>
#include <Adafruit_ST7789.h>
#include <SPI.h>
#include <SparkFun_Qwiic_Button.h>
#include <Wire.h>

constexpr uint8_t TFT_CS = 6;
constexpr uint8_t TFT_DC = 5;
constexpr uint8_t TFT_RST = 4;
constexpr uint8_t TFT_LITE = 3;
constexpr uint8_t BUTTON_ADDRESS = 0x6F;

Adafruit_ST7789 display(&SPI, TFT_CS, TFT_DC, TFT_RST);
QwiicButton button;

void showStatus(uint16_t background, uint16_t foreground,
                const char *line1, const char *line2) {
  display.fillScreen(background);
  display.setTextColor(foreground, background);
  display.setTextSize(2);
  display.setTextWrap(false);
  display.setCursor(24, 120);
  display.print(line1);
  display.setCursor(24, 160);
  display.print(line2);
}

void setup() {
  Serial.begin(115200);
  delay(1500);

  pinMode(TFT_LITE, OUTPUT);
  digitalWrite(TFT_LITE, HIGH);

  SPI.begin(SCK, MISO, MOSI, TFT_CS);
  display.init(240, 320);
  display.setRotation(0);
  showStatus(ST77XX_BLACK, ST77XX_WHITE, "QWIIC BUTTON", "CHECKING...");

  Wire.begin();
  Serial.printf("I2C pins: SDA=%u SCL=%u\n", SDA, SCL);
  Serial.printf("Checking Qwiic Button at 0x%02X...\n", BUTTON_ADDRESS);

  if (!button.begin(BUTTON_ADDRESS, Wire)) {
    Serial.println("Qwiic Button not detected.");
    showStatus(ST77XX_RED, ST77XX_WHITE, "BUTTON ERROR", "CHECK CABLE");
    while (true) {
      delay(1000);
    }
  }

  button.LEDoff();
  Serial.printf("Qwiic Button detected. Device ID: 0x%02X\n",
                button.deviceID());
  showStatus(ST77XX_GREEN, ST77XX_BLACK, "BUTTON READY", "PRESS BUTTON");
}

void loop() {
  static bool wasPressed = false;
  const bool isPressed = button.isPressed();

  if (isPressed != wasPressed) {
    wasPressed = isPressed;

    if (isPressed) {
      button.LEDon(100);
      Serial.println("Button pressed.");
      showStatus(ST77XX_BLUE, ST77XX_WHITE, "BUTTON PRESSED", "I2C OK");
    } else {
      button.LEDoff();
      Serial.println("Button released.");
      showStatus(ST77XX_GREEN, ST77XX_BLACK, "BUTTON READY", "PRESS BUTTON");
    }
  }

  delay(20);
}
