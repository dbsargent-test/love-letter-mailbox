#include <Adafruit_GFX.h>
#include <Adafruit_ST7789.h>
#include <SPI.h>

constexpr uint8_t TFT_CS = 6;
constexpr uint8_t TFT_DC = 5;
constexpr uint8_t TFT_RST = 4;
constexpr uint8_t TFT_LITE = 3;

Adafruit_ST7789 display(&SPI, TFT_CS, TFT_DC, TFT_RST);

void setup() {
  Serial.begin(115200);
  delay(1500);

  pinMode(TFT_LITE, OUTPUT);
  digitalWrite(TFT_LITE, HIGH);

  Serial.println();
  Serial.println("Love Letter Mailbox display smoke test");
  Serial.printf("SPI pins: SCK=%u MOSI=%u CS=%u DC=%u RST=%u LITE=%u\n",
                SCK, MOSI, TFT_CS, TFT_DC, TFT_RST, TFT_LITE);

  SPI.begin(SCK, MISO, MOSI, TFT_CS);
  display.init(240, 320);
  display.setRotation(0);
  display.fillScreen(ST77XX_BLACK);

  const int16_t bandHeight = display.height() / 4;
  display.fillRect(0, 0, display.width(), bandHeight, ST77XX_RED);
  display.fillRect(0, bandHeight, display.width(), bandHeight, ST77XX_GREEN);
  display.fillRect(0, bandHeight * 2, display.width(), bandHeight, ST77XX_BLUE);
  display.fillRect(0, bandHeight * 3, display.width(),
                   display.height() - bandHeight * 3, ST77XX_WHITE);

  display.setTextWrap(false);
  display.setTextColor(ST77XX_WHITE, ST77XX_RED);
  display.setTextSize(2);
  display.setCursor(18, 28);
  display.print("LOVE LETTER");

  display.setTextColor(ST77XX_BLACK, ST77XX_WHITE);
  display.setCursor(34, 268);
  display.print("DISPLAY OK");

  Serial.println("Display pattern rendered.");
}

void loop() {
  delay(1000);
}
