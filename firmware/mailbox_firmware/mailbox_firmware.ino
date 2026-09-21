#include <Adafruit_GFX.h>
#include <Adafruit_ST7789.h>
#include <ArduinoJson.h>
#include <JPEGDEC.h>
#include <Preferences.h>
#include <SPI.h>
#include <SparkFun_Qwiic_Button.h>
#include <SparkFun_Qwiic_Buzzer_Arduino_Library.h>
#include <SparkFun_VEML6030_Ambient_Light_Sensor.h>
#include <WiFi.h>
#include <Wire.h>
#include <esp_crt_bundle.h>
#include <esp_heap_caps.h>
#include <esp_http_client.h>
#include <esp_https_ota.h>
#include <esp_ota_ops.h>
#include <esp_partition.h>
#include <esp_system.h>

#ifdef EMBED_PROVISIONING_SECRETS
#include "secrets.h"
#endif

#ifdef OTA_DEMO_BOOTSTRAP
#define FIRMWARE_VERSION "1.0.0"
#else
#define FIRMWARE_VERSION "1.2.12"
#endif

#ifdef OTA_DEMO_BOOTSTRAP
constexpr bool NAVIGATION_ENABLED = false;
#else
constexpr bool NAVIGATION_ENABLED = true;
#endif

constexpr uint8_t TFT_CS = 6;
constexpr uint8_t TFT_DC = 5;
constexpr uint8_t TFT_RST = 4;
constexpr uint8_t TFT_LITE = 3;
constexpr uint8_t SERVO_PIN = 1;
constexpr uint8_t BUTTON_ADDRESS = 0x6F;
constexpr uint8_t LIGHT_ADDRESS = 0x48;
constexpr uint8_t BUZZER_ADDRESS = 0x34;
constexpr uint32_t SERVO_FREQUENCY_HZ = 50;
constexpr uint8_t SERVO_RESOLUTION_BITS = 16;
constexpr uint16_t SERVO_FLAG_DOWN_US = 850;
constexpr uint16_t SERVO_FLAG_UP_US = 2150;
constexpr unsigned long SERVO_HOLD_MS = 600;

constexpr size_t MAX_MESSAGES = 20;
constexpr size_t PHOTO_CACHE_SLOTS = 4;
constexpr size_t MAX_PHOTO_BYTES = 512UL * 1024UL;
constexpr size_t MIN_FREE_INTERNAL_HEAP_BYTES = 64UL * 1024UL;
constexpr size_t MIN_FREE_PSRAM_BYTES = 512UL * 1024UL;
constexpr int16_t PHOTO_LEFT = 8;
constexpr int16_t PHOTO_TOP = 40;
constexpr int16_t PHOTO_MAX_WIDTH = 216;
constexpr int16_t PHOTO_MAX_HEIGHT = 160;
constexpr unsigned long POLL_INTERVAL_MS = 5000;
constexpr unsigned long LIGHT_INTERVAL_MS = 1000;
constexpr unsigned long SCREENSAVER_DELAY_MS = 2UL * 60UL * 1000UL;
constexpr unsigned long SCREENSAVER_FRAME_MS = 120;
constexpr unsigned long WIFI_RETRY_MAX_MS = 60000;
constexpr uint32_t MAX_VALID_PRESS_MS = 10000;
constexpr unsigned long OTA_INITIAL_DELAY_MS = 20000;
constexpr unsigned long OTA_CHECK_INTERVAL_MS = 15UL * 60UL * 1000UL;
constexpr unsigned long STATUS_INTERVAL_MS = 60UL * 1000UL;
constexpr size_t STATUS_PAYLOAD_BYTES = 768;

Adafruit_ST7789 display(&SPI, TFT_CS, TFT_DC, TFT_RST);
QwiicButton button;
SparkFun_Ambient_Light lightSensor(LIGHT_ADDRESS);
QwiicBuzzer buzzer;
Preferences preferences;
JPEGDEC jpeg;

String wifiSsid;
String wifiPassword;
String apiBaseUrl;
String deviceKey;

struct MailMessage {
  String id;
  String sender;
  String text;
  String photoUrl;
  String displayTimestamp;
  bool read;
};

struct FirmwareRelease {
  String version;
  String url;
  String sha256;
};

struct PhotoCacheSlot {
  uint8_t *data;
  size_t size;
  String messageId;
  uint32_t lastUsedAt;
};

MailMessage messages[MAX_MESSAGES];
size_t messageCount = 0;
int currentIndex = -1;
int unreadCount = 0;
bool historyLoaded = false;
bool screensaverActive = false;
int previousLedUnreadCount = -1;
bool servoAttached = false;
bool flagRaised = false;
bool flagStateKnown = false;
bool servoDetachPending = false;
unsigned long servoDetachAt = 0;

unsigned long lastPollAt = 0;
unsigned long lastLightAt = 0;
unsigned long nextWifiAttemptAt = 0;
unsigned long wifiRetryMs = 1000;
unsigned long wifiConnectedAt = 0;
unsigned long lastOtaCheckAt = 0;
unsigned long lastUserInteractionAt = 0;
unsigned long lastScreensaverFrameAt = 0;
unsigned long lastStatusAt = 0;
uint32_t screensaverFrame = 0;
bool initialOtaCheckComplete = false;
bool bootStatusPending = true;
bool otaConfirmedStatusPending = false;
PhotoCacheSlot photoCache[PHOTO_CACHE_SLOTS] = {};
MailMessage lastDisplayedMessage;
bool hasLastDisplayedMessage = false;
String bootId;
int lastPollStatusCode = 0;
String lastErrorCode;

bool renderPhoto(const MailMessage &message);
int findOldestUnreadIndex();
void sendDeviceStatus(const char *eventName = nullptr,
                      const String &detail = "");

int drawJpegBlock(JPEGDRAW *draw) {
  display.drawRGBBitmap(draw->x, draw->y, draw->pPixels, draw->iWidth,
                        draw->iHeight);
  return 1;
}

esp_err_t collectHttpResponse(esp_http_client_event_t *event) {
  if (event->event_id == HTTP_EVENT_ON_DATA && event->user_data != nullptr) {
    String *response = static_cast<String *>(event->user_data);
    response->concat(static_cast<const char *>(event->data), event->data_len);
  }
  return ESP_OK;
}

esp_err_t addDeviceKeyHeader(esp_http_client_handle_t client) {
  return esp_http_client_set_header(client, "x-device-key",
                                    deviceKey.c_str());
}

void drawVersion() {
  display.setTextColor(ST77XX_CYAN);
  display.setTextSize(1);
  display.setCursor(4, display.height() - 10);
  display.print("v");
  display.print(FIRMWARE_VERSION);
}

void showStatus(uint16_t background, uint16_t foreground, const char *heading,
                const String &detail) {
  screensaverActive = false;
  display.fillScreen(background);
  display.setTextColor(foreground, background);
  display.setTextSize(2);
  display.setTextWrap(true);
  display.setCursor(18, 42);
  display.println(heading);
  display.setCursor(18, 92);
  display.println(detail);
  drawVersion();
}

void showIdle() {
  showStatus(ST77XX_BLACK, ST77XX_WHITE, "LOVE LETTER",
             historyLoaded ? "No messages" : "Loading messages...");
}

struct FloatingHeart {
  int16_t x;
  int16_t startY;
  uint8_t size;
  uint8_t speed;
  uint16_t color;
};

FloatingHeart floatingHearts[] = {
    {20, 214, 10, 1, 0xF81F}, {42, 152, 7, 2, 0xF9B2},
    {24, 226, 12, 1, 0xF800}, {43, 176, 8, 2, 0xFD34},
    {278, 218, 11, 1, 0xF81F}, {301, 144, 7, 2, 0xF9B2},
    {286, 228, 10, 1, 0xF800},
};

constexpr size_t FLOATING_HEART_COUNT =
    sizeof(floatingHearts) / sizeof(floatingHearts[0]);
int16_t previousHeartX[FLOATING_HEART_COUNT];
int16_t previousHeartY[FLOATING_HEART_COUNT];
bool heartFrameDrawn = false;

void drawHeart(int16_t x, int16_t y, uint8_t size, uint16_t color) {
  const int16_t radius = max(2, size / 3);
  display.fillCircle(x - radius, y - radius, radius, color);
  display.fillCircle(x + radius, y - radius, radius, color);
  display.fillTriangle(x - size / 2 - 1, y - radius, x + size / 2 + 1,
                       y - radius, x, y + size, color);
}

void eraseHeart(int16_t x, int16_t y, uint8_t size, uint16_t background) {
  int16_t left = x - size - 3;
  int16_t top = y - size - 3;
  int16_t right = x + size + 3;
  int16_t bottom = y + size + 3;
  if (left < 0) left = 0;
  if (top < 0) top = 0;
  if (right >= display.width()) right = display.width() - 1;
  if (bottom >= display.height()) bottom = display.height() - 1;
  if (right >= left && bottom >= top) {
    display.fillRect(left, top, right - left + 1, bottom - top + 1,
                     background);
  }
}

void drawScreensaverStatic() {
  constexpr uint16_t background = 0x082A;
  constexpr uint16_t panel = 0x18E3;
  display.fillScreen(background);

  display.fillRoundRect(54, 54, 212, 112, 16, panel);
  display.drawRoundRect(54, 54, 212, 112, 16, ST77XX_MAGENTA);
  drawHeart(160, 86, 20, ST77XX_RED);

  display.setTextColor(ST77XX_WHITE, panel);
  display.setTextSize(3);
  display.setTextWrap(false);
  display.setCursor(71, 112);
  display.print("LOVE LETTER");
  display.setTextSize(1);
  display.setTextColor(ST77XX_CYAN, panel);
  display.setCursor(108, 146);
  display.print(unreadCount > 0 ? "A message is waiting" : "Mailbox is ready");
}

void drawScreensaverFrame() {
  constexpr uint16_t background = 0x082A;
  if (heartFrameDrawn) {
    for (size_t i = 0; i < FLOATING_HEART_COUNT; ++i) {
      eraseHeart(previousHeartX[i], previousHeartY[i],
                 floatingHearts[i].size, background);
    }
  }

  const int16_t travelHeight = display.height() + 50;
  for (size_t i = 0; i < FLOATING_HEART_COUNT; ++i) {
    const FloatingHeart &heart = floatingHearts[i];
    const uint32_t travel =
        ((screensaverFrame * heart.speed) / 2) % travelHeight;
    int16_t y = heart.startY - static_cast<int16_t>(travel);
    while (y < -static_cast<int16_t>(heart.size)) y += travelHeight;
    const int16_t drift =
        static_cast<int16_t>((screensaverFrame / 4 + i * 3) % 9) - 4;
    const int16_t x = heart.x + drift;
    drawHeart(x, y, heart.size, heart.color);
    previousHeartX[i] = x;
    previousHeartY[i] = y;
  }

  heartFrameDrawn = true;
  drawUnreadBadge();
  drawVersion();
}

void showScreensaver() {
  screensaverActive = true;
  screensaverFrame = 0;
  heartFrameDrawn = false;
  drawScreensaverStatic();
  drawScreensaverFrame();
  lastScreensaverFrameAt = millis();
}

void drawUnreadBadge() {
  if (!NAVIGATION_ENABLED || unreadCount <= 0) return;

  const String badge = "NEW " + String(unreadCount);
  const int16_t width = badge.length() * 6 + 10;
  const int16_t left = display.width() - width - 6;
  display.fillRoundRect(left, 8, width, 18, 4, ST77XX_RED);
  display.setTextColor(ST77XX_WHITE, ST77XX_RED);
  display.setTextSize(1);
  display.setCursor(left + 5, 13);
  display.print(badge);
}

void drawReadControlBar(bool read) {
  const uint16_t background = read ? ST77XX_GREEN : ST77XX_BLUE;
  display.fillRect(0, 208, 320, 32, background);
  display.setTextColor(read ? ST77XX_BLACK : ST77XX_WHITE, background);
  display.setTextSize(2);
  if (read) {
    display.setCursor(104, 216);
    display.print("READ");
  } else {
    display.setCursor(28, 216);
    display.print("PRESS TO READ");
  }
}

void showMessage(const MailMessage &message) {
  screensaverActive = false;
  lastDisplayedMessage = message;
  hasLastDisplayedMessage = true;
  display.fillScreen(ST77XX_WHITE);

  if (NAVIGATION_ENABLED && !message.read) {
    for (int16_t inset = 0; inset < 4; ++inset) {
      display.drawRect(inset, inset, display.width() - inset * 2,
                       display.height() - inset * 2, ST77XX_RED);
    }
  }

  display.setTextColor(ST77XX_MAGENTA, ST77XX_WHITE);
  display.setTextSize(2);
  display.setTextWrap(true);
  display.setCursor(10, 8);
  display.print("FROM: ");
  display.println(message.sender);
  display.drawFastHLine(8, 34, 304, ST77XX_MAGENTA);
  drawUnreadBadge();

  const bool photoRendered =
      !message.photoUrl.isEmpty() && renderPhoto(message);

  display.setTextColor(ST77XX_BLACK, ST77XX_WHITE);
  if (photoRendered) {
    display.setTextSize(1);
    display.setCursor(232, 52);
    display.println(message.displayTimestamp);
    display.setTextSize(2);
    display.setCursor(232, 92);
    const String caption =
        message.text.length() > 42 ? message.text.substring(0, 39) + "..."
                                   : message.text;
    display.println(caption);
  } else {
    display.setTextSize(2);
    display.setCursor(12, 52);
    display.println(message.text.isEmpty() ? "[Photo unavailable]"
                                           : message.text);
    display.setTextSize(1);
    display.setCursor(12, 188);
    display.println(message.displayTimestamp);
  }

  if (NAVIGATION_ENABLED) {
    drawReadControlBar(message.read);
  } else {
    display.setTextColor(ST77XX_BLUE, ST77XX_WHITE);
    display.setTextSize(2);
    display.setCursor(12, 216);
    display.print("PRESS TO READ");
  }
}

void showError(const String &detail) {
  showStatus(ST77XX_RED, ST77XX_WHITE, "CONNECTION ERROR", detail);
}

void playTone(uint16_t durationMs, uint8_t volume) {
  buzzer.configureBuzzer(SFE_QWIIC_BUZZER_RESONANT_FREQUENCY, durationMs,
                         volume);
  buzzer.on();
}

void playNotification() {
  const uint16_t patternMs[] = {90, 90, 180, 55, 55, 55, 140};
  const uint8_t volumes[] = {
      SFE_QWIIC_BUZZER_VOLUME_LOW, SFE_QWIIC_BUZZER_VOLUME_MID,
      SFE_QWIIC_BUZZER_VOLUME_MAX, SFE_QWIIC_BUZZER_VOLUME_LOW,
      SFE_QWIIC_BUZZER_VOLUME_LOW, SFE_QWIIC_BUZZER_VOLUME_MID,
      SFE_QWIIC_BUZZER_VOLUME_MAX,
  };
  for (size_t i = 0; i < sizeof(patternMs) / sizeof(patternMs[0]); ++i) {
    playTone(patternMs[i], volumes[i]);
    delay(patternMs[i] + 35);
  }
}

uint32_t pulseToDuty(uint16_t pulseUs) {
  constexpr uint32_t PERIOD_US = 20000;
  constexpr uint32_t MAX_DUTY = (1UL << SERVO_RESOLUTION_BITS) - 1;
  return (static_cast<uint32_t>(pulseUs) * MAX_DUTY) / PERIOD_US;
}

bool attachServo() {
  if (servoAttached) return true;
  pinMode(SERVO_PIN, OUTPUT);
  digitalWrite(SERVO_PIN, LOW);
  servoAttached =
      ledcAttach(SERVO_PIN, SERVO_FREQUENCY_HZ, SERVO_RESOLUTION_BITS);
  if (!servoAttached) {
    Serial.println("Servo PWM setup failed on IO1.");
  }
  return servoAttached;
}

void detachServo() {
  if (servoAttached) {
    ledcDetach(SERVO_PIN);
    servoAttached = false;
  }
  pinMode(SERVO_PIN, OUTPUT);
  digitalWrite(SERVO_PIN, LOW);
  servoDetachPending = false;
}

void moveFlag(bool raise) {
  if (!attachServo()) return;
  const uint16_t pulse = raise ? SERVO_FLAG_UP_US : SERVO_FLAG_DOWN_US;
  ledcWrite(SERVO_PIN, pulseToDuty(pulse));
  flagRaised = raise;
  flagStateKnown = true;
  servoDetachPending = true;
  servoDetachAt = millis() + SERVO_HOLD_MS;
  Serial.printf("Flag servo: %s (%u us)\n", raise ? "UP" : "DOWN", pulse);
}

void updateFlagState() {
  const bool shouldRaise = unreadCount > 0;
  if (!flagStateKnown || shouldRaise != flagRaised) {
    moveFlag(shouldRaise);
  }
}

void maintainServo() {
  if (servoDetachPending &&
      static_cast<long>(millis() - servoDetachAt) >= 0) {
    detachServo();
  }
}

uint8_t brightnessForLux(long lux) {
  if (lux < 5) return 25;
  if (lux < 50) return 60;
  if (lux < 250) return 120;
  return 220;
}

bool wifiConfigured() {
  return !wifiSsid.isEmpty() && !wifiPassword.isEmpty() &&
         !apiBaseUrl.isEmpty() && !deviceKey.isEmpty();
}

void loadConfiguration() {
  preferences.begin("mailbox", false);
#ifdef EMBED_PROVISIONING_SECRETS
  preferences.putString("wifi_ssid", WIFI_SSID);
  preferences.putString("wifi_pass", WIFI_PASSWORD);
  preferences.putString("api_url", API_BASE_URL);
  preferences.putString("device_key", DEVICE_KEY);
#endif
  wifiSsid = preferences.getString("wifi_ssid", "");
  wifiPassword = preferences.getString("wifi_pass", "");
  apiBaseUrl = preferences.getString("api_url", "");
  deviceKey = preferences.getString("device_key", "");
  preferences.end();
}

void maintainWifi() {
  static bool wasConnected = false;
  const bool connected = WiFi.status() == WL_CONNECTED;

  if (connected) {
    wifiRetryMs = 1000;
    if (!wasConnected) {
      wifiConnectedAt = millis();
      Serial.print("WiFi connected. IP: ");
      Serial.println(WiFi.localIP());
    }
    wasConnected = true;
    return;
  }

  wasConnected = false;
  const unsigned long now = millis();
  if (now < nextWifiAttemptAt || !wifiConfigured()) return;

  Serial.printf("Connecting to WiFi SSID '%s'...\n", wifiSsid.c_str());
  WiFi.disconnect();
  WiFi.begin(wifiSsid.c_str(), wifiPassword.c_str());
  nextWifiAttemptAt = now + wifiRetryMs;
  wifiRetryMs = min(wifiRetryMs * 2, WIFI_RETRY_MAX_MS);
}

bool performRequest(const String &url, esp_http_client_method_t method,
                    String &response, int &statusCode,
                    const char *payload = nullptr, size_t payloadLength = 0) {
  esp_http_client_config_t config = {};
  config.url = url.c_str();
  config.event_handler = collectHttpResponse;
  config.user_data = &response;
  config.crt_bundle_attach = esp_crt_bundle_attach;
  config.timeout_ms = 10000;

  esp_http_client_handle_t client = esp_http_client_init(&config);
  if (client == nullptr) {
    Serial.println("Failed to initialize HTTPS client.");
    return false;
  }

  esp_http_client_set_method(client, method);
  esp_http_client_set_header(client, "x-device-key", deviceKey.c_str());
  esp_http_client_set_header(client, "Accept", "application/json");
  if (method == HTTP_METHOD_PATCH || method == HTTP_METHOD_POST) {
    esp_http_client_set_header(client, "Content-Type", "application/json");
    if (payload != nullptr && payloadLength > 0) {
      esp_http_client_set_post_field(client, payload, payloadLength);
    } else {
      esp_http_client_set_post_field(client, "{}", 2);
    }
  }

  const esp_err_t result = esp_http_client_perform(client);
  statusCode = esp_http_client_get_status_code(client);
  esp_http_client_cleanup(client);

  if (result != ESP_OK) {
    Serial.printf("HTTPS request failed: %s\n", esp_err_to_name(result));
    return false;
  }
  return true;
}

String resetReasonName() {
  switch (esp_reset_reason()) {
    case ESP_RST_POWERON:
      return "poweron";
    case ESP_RST_EXT:
      return "external";
    case ESP_RST_SW:
      return "software";
    case ESP_RST_PANIC:
      return "panic";
    case ESP_RST_INT_WDT:
      return "interrupt_watchdog";
    case ESP_RST_TASK_WDT:
      return "task_watchdog";
    case ESP_RST_WDT:
      return "watchdog";
    case ESP_RST_DEEPSLEEP:
      return "deepsleep";
    case ESP_RST_BROWNOUT:
      return "brownout";
    case ESP_RST_SDIO:
      return "sdio";
    default:
      return "unknown";
  }
}

String displayStateName() {
  if (screensaverActive) return "screensaver";
  if (currentIndex >= 0 && messageCount > 0) return "message";
  if (historyLoaded) return "idle";
  return "startup";
}

String currentMessageId() {
  if (currentIndex >= 0 && currentIndex < static_cast<int>(messageCount)) {
    return messages[currentIndex].id;
  }
  if (hasLastDisplayedMessage) return lastDisplayedMessage.id;
  return "";
}

void sendDeviceStatus(const char *eventName, const String &detail) {
  if (WiFi.status() != WL_CONNECTED || !wifiConfigured()) return;

  JsonDocument document;
  document["firmwareVersion"] = FIRMWARE_VERSION;
  document["bootId"] = bootId;
  document["uptimeMs"] = millis();
  document["resetReason"] = resetReasonName();
  document["wifiRssi"] = WiFi.RSSI();
  document["freeHeap"] = heap_caps_get_free_size(MALLOC_CAP_INTERNAL);
  document["minFreeHeap"] = heap_caps_get_minimum_free_size(MALLOC_CAP_INTERNAL);
  document["freePsram"] = heap_caps_get_free_size(MALLOC_CAP_SPIRAM);
  document["minFreePsram"] = heap_caps_get_minimum_free_size(MALLOC_CAP_SPIRAM);
  document["displayState"] = displayStateName();
  document["currentMessageId"] = currentMessageId();
  document["unreadCount"] = unreadCount;
  document["flagState"] = flagRaised ? "raised" : "lowered";
  document["buttonLedState"] = previousLedUnreadCount > 0 ? "active" : "off";
  document["lastPollStatus"] = lastPollStatusCode;
  document["lastErrorCode"] = lastErrorCode;
  if (eventName != nullptr && eventName[0] != '\0') {
    document["event"] = eventName;
    document["detail"] = detail;
  }

  char payload[STATUS_PAYLOAD_BYTES];
  const size_t payloadLength = serializeJson(document, payload, sizeof(payload));
  if (payloadLength == 0 || payloadLength >= sizeof(payload)) {
    Serial.println("Device status payload serialization failed.");
    return;
  }

  String response;
  int statusCode = 0;
  const String url = apiBaseUrl + "/api/device/status";
  if (!performRequest(url, HTTP_METHOD_POST, response, statusCode, payload,
                      payloadLength) ||
      statusCode != 200) {
    Serial.printf("Device status POST failed: HTTP %d %s\n", statusCode,
                  response.c_str());
    return;
  }

  Serial.printf("Device status sent%s%s\n", eventName ? ": " : "",
                eventName ? eventName : "");
}

void releasePhotoCacheSlot(PhotoCacheSlot &slot) {
  if (slot.data != nullptr) {
    heap_caps_free(slot.data);
    slot.data = nullptr;
  }
  slot.size = 0;
  slot.messageId = "";
  slot.lastUsedAt = 0;
}

PhotoCacheSlot *findPhotoCacheSlot(const String &messageId) {
  for (size_t i = 0; i < PHOTO_CACHE_SLOTS; ++i) {
    if (photoCache[i].data != nullptr &&
        photoCache[i].messageId == messageId) {
      photoCache[i].lastUsedAt = millis();
      return &photoCache[i];
    }
  }
  return nullptr;
}

void releasePhotoForMessage(const String &messageId) {
  PhotoCacheSlot *slot = findPhotoCacheSlot(messageId);
  if (slot != nullptr) releasePhotoCacheSlot(*slot);
}

PhotoCacheSlot &selectPhotoCacheSlot() {
  for (size_t i = 0; i < PHOTO_CACHE_SLOTS; ++i) {
    if (photoCache[i].data == nullptr) return photoCache[i];
  }

  const uint32_t now = millis();
  size_t oldestIndex = 0;
  uint32_t oldestAge = now - photoCache[0].lastUsedAt;
  for (size_t i = 1; i < PHOTO_CACHE_SLOTS; ++i) {
    const uint32_t age = now - photoCache[i].lastUsedAt;
    if (age > oldestAge) {
      oldestAge = age;
      oldestIndex = i;
    }
  }
  return photoCache[oldestIndex];
}

bool hasPhotoCacheHeadroom(size_t bufferSize) {
  const size_t internalFree = heap_caps_get_free_size(MALLOC_CAP_INTERNAL);
  if (internalFree < MIN_FREE_INTERNAL_HEAP_BYTES) {
    Serial.printf("Photo cache skipped: internal heap low (%u bytes).\n",
                  static_cast<unsigned>(internalFree));
    return false;
  }

  const size_t psramFree = heap_caps_get_free_size(MALLOC_CAP_SPIRAM);
  if (psramFree > 0 && psramFree < bufferSize + MIN_FREE_PSRAM_BYTES) {
    Serial.printf("Photo cache skipped: PSRAM low (%u bytes free).\n",
                  static_cast<unsigned>(psramFree));
    return false;
  }
  return true;
}

bool downloadPhoto(const MailMessage &message, PhotoCacheSlot *&resultSlot) {
  resultSlot = findPhotoCacheSlot(message.id);
  if (resultSlot != nullptr) return true;
  if (message.photoUrl.isEmpty()) return true;

  esp_http_client_config_t config = {};
  config.url = message.photoUrl.c_str();
  config.crt_bundle_attach = esp_crt_bundle_attach;
  config.timeout_ms = 20000;

  esp_http_client_handle_t client = esp_http_client_init(&config);
  if (client == nullptr) {
    return false;
  }

  esp_err_t result = esp_http_client_open(client, 0);
  if (result != ESP_OK) {
    Serial.printf("Photo connection failed: %s\n", esp_err_to_name(result));
    esp_http_client_cleanup(client);
    return false;
  }

  const int64_t contentLength = esp_http_client_fetch_headers(client);
  const int statusCode = esp_http_client_get_status_code(client);
  if (statusCode != 200 || contentLength <= 0 ||
      contentLength > static_cast<int64_t>(MAX_PHOTO_BYTES)) {
    Serial.printf("Photo rejected: HTTP=%d content-length=%lld\n", statusCode,
                  contentLength);
    esp_http_client_close(client);
    esp_http_client_cleanup(client);
    return false;
  }

  const size_t bufferSize = static_cast<size_t>(contentLength);
  if (!hasPhotoCacheHeadroom(bufferSize)) {
    esp_http_client_close(client);
    esp_http_client_cleanup(client);
    return false;
  }

  PhotoCacheSlot &slot = selectPhotoCacheSlot();
  releasePhotoCacheSlot(slot);
  slot.data = static_cast<uint8_t *>(
      heap_caps_malloc(bufferSize, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT));
  if (slot.data == nullptr) {
    slot.data = static_cast<uint8_t *>(malloc(bufferSize));
  }
  if (slot.data == nullptr) {
    Serial.printf("Unable to allocate %u-byte photo buffer.\n",
                  static_cast<unsigned>(bufferSize));
    esp_http_client_close(client);
    esp_http_client_cleanup(client);
    return false;
  }

  size_t bytesRead = 0;
  while (bytesRead < bufferSize) {
    const int count = esp_http_client_read(
        client, reinterpret_cast<char *>(slot.data + bytesRead),
        bufferSize - bytesRead);
    if (count < 0) {
      result = ESP_FAIL;
      break;
    }
    if (count == 0) break;
    bytesRead += static_cast<size_t>(count);
  }

  esp_http_client_close(client);
  esp_http_client_cleanup(client);

  if (result != ESP_OK || bytesRead != bufferSize) {
    Serial.printf("Photo download incomplete: expected=%u received=%u\n",
                  static_cast<unsigned>(bufferSize),
                  static_cast<unsigned>(bytesRead));
    releasePhotoCacheSlot(slot);
    return false;
  }

  slot.size = bytesRead;
  slot.messageId = message.id;
  slot.lastUsedAt = millis();
  resultSlot = &slot;
  Serial.printf("Downloaded photo for message %s: %u bytes\n",
                message.id.c_str(), static_cast<unsigned>(slot.size));
  return true;
}

bool renderPhoto(const MailMessage &message) {
  PhotoCacheSlot *slot = nullptr;
  if (!downloadPhoto(message, slot) || slot == nullptr) return false;
  if (!jpeg.openRAM(slot->data, static_cast<int>(slot->size),
                    drawJpegBlock)) {
    Serial.println("JPEG decoder could not open the downloaded image.");
    return false;
  }

  jpeg.setPixelType(RGB565_LITTLE_ENDIAN);
  const int width = jpeg.getWidth();
  const int height = jpeg.getHeight();
  int scale = 1;
  int options = 0;

  if (width > PHOTO_MAX_WIDTH || height > PHOTO_MAX_HEIGHT) {
    if (width / 2 <= PHOTO_MAX_WIDTH && height / 2 <= PHOTO_MAX_HEIGHT) {
      scale = 2;
      options = JPEG_SCALE_HALF;
    } else if (width / 4 <= PHOTO_MAX_WIDTH &&
               height / 4 <= PHOTO_MAX_HEIGHT) {
      scale = 4;
      options = JPEG_SCALE_QUARTER;
    } else {
      scale = 8;
      options = JPEG_SCALE_EIGHTH;
    }
  }

  const int scaledWidth = width / scale;
  const int scaledHeight = height / scale;
  const int x = PHOTO_LEFT + (PHOTO_MAX_WIDTH - scaledWidth) / 2;
  const int y = PHOTO_TOP + (PHOTO_MAX_HEIGHT - scaledHeight) / 2;
  const int drawX = x < PHOTO_LEFT ? PHOTO_LEFT : x;
  const int drawY = y < PHOTO_TOP ? PHOTO_TOP : y;
  const int result = jpeg.decode(drawX, drawY, options);
  jpeg.close();

  if (!result) {
    Serial.println("JPEG decode failed.");
    return false;
  }
  return true;
}

bool prefetchPhoto(const MailMessage &message) {
  if (message.photoUrl.isEmpty()) return true;
  PhotoCacheSlot *slot = nullptr;
  const bool downloaded = downloadPhoto(message, slot);
  if (!downloaded) {
    Serial.printf("Photo prefetch failed for message %s\n",
                  message.id.c_str());
  }
  return downloaded;
}

void prefetchQueuedPhotos() {
  size_t attempted = 0;
  for (size_t i = 0; i < messageCount && attempted < PHOTO_CACHE_SLOTS; ++i) {
    if (messages[i].read || messages[i].photoUrl.isEmpty()) continue;
    attempted++;
    if (!prefetchPhoto(messages[i])) break;
  }
}

void removeLocalMessageAt(int index) {
  if (index < 0 || index >= static_cast<int>(messageCount)) return;
  const String removedId = messages[index].id;
  releasePhotoForMessage(removedId);
  for (size_t i = static_cast<size_t>(index); i + 1 < messageCount; ++i) {
    messages[i] = messages[i + 1];
  }
  messageCount--;
  currentIndex = findOldestUnreadIndex();
  if (currentIndex < 0 && messageCount > 0) currentIndex = 0;
  Serial.printf("Removed message %s from local queue; %u remain\n",
                removedId.c_str(), static_cast<unsigned>(messageCount));
}

void showLastDisplayedOrIdle() {
  if (hasLastDisplayedMessage) {
    showMessage(lastDisplayedMessage);
  } else {
    showIdle();
  }
}

int findMessageIndex(const String &id) {
  for (size_t i = 0; i < messageCount; ++i) {
    if (messages[i].id == id) return static_cast<int>(i);
  }
  return -1;
}

int findOldestUnreadIndex() {
  for (size_t i = 0; i < messageCount; ++i) {
    if (!messages[i].read) return static_cast<int>(i);
  }
  return -1;
}

bool fetchHistory(MailMessage *loadedMessages, size_t &loadedCount,
                  int &serverUnreadCount) {
  String response;
  int statusCode = 0;
  const String url =
      apiBaseUrl + "/api/messages?unread=true&page=0&pageSize=" +
      String(MAX_MESSAGES);

  if (!performRequest(url, HTTP_METHOD_GET, response, statusCode)) return false;
  lastPollStatusCode = statusCode;
  if (statusCode != 200) {
    Serial.printf("Message poll returned HTTP %d: %s\n", statusCode,
                  response.c_str());
    lastErrorCode = "message_poll_http_" + String(statusCode);
    return false;
  }

  JsonDocument document;
  const DeserializationError error = deserializeJson(document, response);
  if (error) {
    Serial.printf("Message JSON parse failed: %s\n", error.c_str());
    lastErrorCode = "message_poll_json";
    return false;
  }

  JsonArray responseMessages = document["messages"].as<JsonArray>();
  loadedCount =
      min(static_cast<size_t>(responseMessages.size()), MAX_MESSAGES);
  serverUnreadCount = document["unreadCount"] | 0;

  for (size_t i = 0; i < loadedCount; ++i) {
    JsonObject source = responseMessages[i];
    loadedMessages[i].id = source["id"] | "";
    loadedMessages[i].sender = source["sender"] | "Unknown";
    loadedMessages[i].text = source["text"] | "";
    loadedMessages[i].photoUrl = source["photoUrl"] | "";
    loadedMessages[i].displayTimestamp = source["displayTimestamp"] | "";
    loadedMessages[i].read = source["read"] | false;
  }
  return true;
}

bool acknowledgeMessage(const String &messageId) {
  String response;
  int statusCode = 0;
  const String url = apiBaseUrl + "/api/messages/" + messageId;

  if (!performRequest(url, HTTP_METHOD_PATCH, response, statusCode)) return false;
  if (statusCode != 200) {
    Serial.printf("Acknowledge returned HTTP %d: %s\n", statusCode,
                  response.c_str());
    lastErrorCode = "ack_http_" + String(statusCode);
    return false;
  }
  return true;
}

void pollMessages() {
  if (WiFi.status() != WL_CONNECTED) return;

  MailMessage loadedMessages[MAX_MESSAGES];
  size_t loadedCount = 0;
  int serverUnreadCount = 0;
  const String previousCurrentId =
      currentIndex >= 0 ? messages[currentIndex].id : "";
  const int previousUnreadCount = unreadCount;
  const bool wasHistoryLoaded = historyLoaded;
  const size_t previousMessageCount = messageCount;

  if (!fetchHistory(loadedMessages, loadedCount, serverUnreadCount)) {
    if (!historyLoaded) showError("Unable to reach mailbox service");
    sendDeviceStatus("message_poll_failed", lastErrorCode);
    return;
  }
  lastErrorCode = "";

  messageCount = loadedCount;
  unreadCount = serverUnreadCount;
  for (size_t i = 0; i < messageCount; ++i) {
    messages[i] = loadedMessages[i];
  }

  if (messageCount == 0) {
    currentIndex = -1;
    historyLoaded = true;
    prefetchQueuedPhotos();
    if (!screensaverActive &&
        (!wasHistoryLoaded || previousMessageCount != messageCount)) {
      showIdle();
    }
    return;
  }

  const int preservedIndex = findMessageIndex(previousCurrentId);
  if (preservedIndex >= 0) {
    currentIndex = preservedIndex;
  } else {
    currentIndex = findOldestUnreadIndex();
    if (currentIndex < 0) currentIndex = 0;
  }

  prefetchQueuedPhotos();

  const bool newUnreadArrived =
      unreadCount > previousUnreadCount || previousMessageCount == 0;

  historyLoaded = true;
  const bool displayChanged =
      !wasHistoryLoaded || previousCurrentId != messages[currentIndex].id ||
      previousUnreadCount != unreadCount ||
      previousMessageCount != messageCount;

  if (newUnreadArrived) {
    playNotification();
    Serial.printf("Unread message queue updated: %d waiting\n", unreadCount);
    sendDeviceStatus("message_received", String(unreadCount) + " unread");
  }

  if (displayChanged && !screensaverActive) {
    showMessage(messages[currentIndex]);
  }

  Serial.printf("History loaded: %u messages, %d unread, showing %d\n",
                static_cast<unsigned>(messageCount), unreadCount,
                currentIndex + 1);
}

void acknowledgeCurrent() {
  if (currentIndex < 0) return;
  if (messages[currentIndex].read) {
    currentIndex = findOldestUnreadIndex();
    if (currentIndex >= 0) showMessage(messages[currentIndex]);
    else showLastDisplayedOrIdle();
    return;
  }

  const MailMessage acknowledgedMessage = messages[currentIndex];
  const String messageId = messages[currentIndex].id;
  if (WiFi.status() != WL_CONNECTED || !acknowledgeMessage(messageId)) {
    showError("Message was not acknowledged");
    return;
  }

  messages[currentIndex].read = true;
  unreadCount = max(0, unreadCount - 1);
  Serial.printf("Acknowledged message %s\n", messageId.c_str());
  sendDeviceStatus("message_marked_read", messageId);
  playTone(70, SFE_QWIIC_BUZZER_VOLUME_LOW);
  removeLocalMessageAt(currentIndex);
  lastDisplayedMessage = acknowledgedMessage;
  lastDisplayedMessage.read = true;
  hasLastDisplayedMessage = true;
  prefetchQueuedPhotos();

  if (currentIndex >= 0 && messageCount > 0) showMessage(messages[currentIndex]);
  else showLastDisplayedOrIdle();
  lastPollAt = millis();
}

void revealMessageFromScreensaver() {
  screensaverActive = false;
  currentIndex = findOldestUnreadIndex();

  if (currentIndex >= 0) {
    showMessage(messages[currentIndex]);
    Serial.printf("Screensaver reveal and read: message %d of %u\n",
                  currentIndex + 1, static_cast<unsigned>(messageCount));
    acknowledgeCurrent();
  } else {
    showLastDisplayedOrIdle();
  }
}

void handleSinglePress() {
  Serial.println("Button action: MARK READ AND ADVANCE");
  acknowledgeCurrent();
}

void processCompletedPress(uint32_t pressAge, uint32_t clickAge) {
  const uint32_t heldFor = pressAge - clickAge;
  lastUserInteractionAt = millis();
  Serial.printf("Button gesture: held %lu ms\n",
                static_cast<unsigned long>(heldFor));

  if (screensaverActive) {
    revealMessageFromScreensaver();
    return;
  }

  handleSinglePress();
}

void handleButton() {
  while (!button.isPressedQueueEmpty() && !button.isClickedQueueEmpty()) {
    const uint32_t pressAge = button.timeSinceFirstPress();
    const uint32_t clickAge = button.timeSinceFirstClick();

    if (pressAge < clickAge) {
      button.popClickedQueue();
      Serial.printf("Button queue resync: discarded stale click (%lu ms)\n",
                    static_cast<unsigned long>(clickAge));
      continue;
    }

    const uint32_t heldFor = pressAge - clickAge;
    if (heldFor > MAX_VALID_PRESS_MS) {
      button.popPressedQueue();
      Serial.printf("Button queue resync: discarded stale press (%lu ms)\n",
                    static_cast<unsigned long>(pressAge));
      continue;
    }

    const uint32_t poppedPressAge = button.popPressedQueue();
    const uint32_t poppedClickAge = button.popClickedQueue();
    if (poppedPressAge < poppedClickAge ||
        poppedPressAge - poppedClickAge > MAX_VALID_PRESS_MS) {
      Serial.println("Button queue changed during read; event discarded.");
      continue;
    }
    processCompletedPress(poppedPressAge, poppedClickAge);
  }

}

void updateScreensaver() {
  const unsigned long now = millis();
  if (!screensaverActive &&
      now - lastUserInteractionAt >= SCREENSAVER_DELAY_MS) {
    showScreensaver();
  }

  if (screensaverActive &&
      (lastScreensaverFrameAt == 0 ||
       now - lastScreensaverFrameAt >= SCREENSAVER_FRAME_MS)) {
    lastScreensaverFrameAt = now;
    screensaverFrame++;
    drawScreensaverFrame();
  }
}

void updateButtonLed() {
  const int targetUnreadCount =
      NAVIGATION_ENABLED && unreadCount > 0 ? unreadCount : 0;
  if (targetUnreadCount == 0) {
    if (previousLedUnreadCount == 0) return;
    button.LEDoff();
    previousLedUnreadCount = 0;
    return;
  }

  if (targetUnreadCount == previousLedUnreadCount) return;
  previousLedUnreadCount = targetUnreadCount;
  button.LEDconfig(120, 1200, 100, 20);
}

bool parseVersion(const String &version, int parts[3]) {
  int firstDot = version.indexOf('.');
  int secondDot = version.indexOf('.', firstDot + 1);
  if (firstDot <= 0 || secondDot <= firstDot + 1 ||
      secondDot >= version.length() - 1) {
    return false;
  }

  const String values[3] = {
      version.substring(0, firstDot),
      version.substring(firstDot + 1, secondDot),
      version.substring(secondDot + 1),
  };

  for (int i = 0; i < 3; ++i) {
    if (values[i].isEmpty()) return false;
    for (size_t j = 0; j < values[i].length(); ++j) {
      if (!isDigit(values[i][j])) return false;
    }
    parts[i] = values[i].toInt();
  }
  return true;
}

bool isNewerVersion(const String &candidate) {
  int current[3];
  int next[3];
  if (!parseVersion(FIRMWARE_VERSION, current) ||
      !parseVersion(candidate, next)) {
    return false;
  }

  for (int i = 0; i < 3; ++i) {
    if (next[i] != current[i]) return next[i] > current[i];
  }
  return false;
}

bool isSha256(const String &value) {
  if (value.length() != 64) return false;
  for (size_t i = 0; i < value.length(); ++i) {
    if (!isHexadecimalDigit(value[i])) return false;
  }
  return true;
}

String digestToHex(const uint8_t digest[32]) {
  static const char HEX_DIGITS[] = "0123456789abcdef";
  String output;
  output.reserve(64);
  for (size_t i = 0; i < 32; ++i) {
    output += HEX_DIGITS[digest[i] >> 4];
    output += HEX_DIGITS[digest[i] & 0x0F];
  }
  return output;
}

bool fetchFirmwareRelease(FirmwareRelease &release, bool &available) {
  String response;
  int statusCode = 0;
  const String url = apiBaseUrl + "/api/device/firmware";

  if (!performRequest(url, HTTP_METHOD_GET, response, statusCode)) {
    lastErrorCode = "ota_manifest_request";
    return false;
  }
  if (statusCode != 200) {
    Serial.printf("Firmware manifest returned HTTP %d\n", statusCode);
    lastErrorCode = "ota_manifest_http_" + String(statusCode);
    return false;
  }

  JsonDocument document;
  const DeserializationError error = deserializeJson(document, response);
  if (error) {
    Serial.printf("Firmware manifest parse failed: %s\n", error.c_str());
    lastErrorCode = "ota_manifest_json";
    return false;
  }

  available = document["available"] | true;
  release.version = document["version"] | "";
  release.url = document["url"] | "";
  release.sha256 = document["sha256"] | "";
  release.sha256.toLowerCase();

  if (!available) return true;
  if (!isNewerVersion(release.version)) {
    available = false;
    return true;
  }
  if (!release.url.startsWith("https://") || !isSha256(release.sha256)) {
    Serial.println("Firmware manifest is incomplete or invalid.");
    lastErrorCode = "ota_manifest_invalid";
    available = false;
  }
  return true;
}

void showOtaProgress(const String &version, int percent) {
  static String displayedVersion;
  static int previousPercent = -1;
  const int boundedPercent = constrain(percent, 0, 100);
  const bool initialize =
      displayedVersion != version || boundedPercent < previousPercent;

  if (initialize) {
    displayedVersion = version;
    previousPercent = -1;
    display.fillScreen(ST77XX_BLACK);
    display.setTextColor(ST77XX_CYAN, ST77XX_BLACK);
    display.setTextSize(2);
    display.setCursor(18, 42);
    display.println("OTA UPDATE");
    display.setTextColor(ST77XX_WHITE, ST77XX_BLACK);
    display.setCursor(18, 82);
    display.print("Installing ");
    display.println(version);
    display.drawRect(18, 135, 204, 24, ST77XX_WHITE);
    display.fillRect(21, 138, 198, 18, ST77XX_BLACK);
  }

  if (boundedPercent == previousPercent) return;

  const int16_t previousWidth =
      previousPercent < 0 ? 0 : (198 * previousPercent) / 100;
  const int16_t currentWidth = (198 * boundedPercent) / 100;
  if (currentWidth > previousWidth) {
    display.fillRect(21 + previousWidth, 138, currentWidth - previousWidth, 18,
                     ST77XX_GREEN);
  }

  display.fillRect(78, 176, 84, 24, ST77XX_BLACK);
  display.setTextColor(ST77XX_WHITE, ST77XX_BLACK);
  display.setTextSize(2);
  display.setCursor(86, 180);
  display.printf("%d%%", boundedPercent);
  previousPercent = boundedPercent;
}

bool installFirmware(const FirmwareRelease &release) {
  showOtaProgress(release.version, 0);
  Serial.printf("Starting OTA update to %s\n", release.version.c_str());
  sendDeviceStatus("ota_started", release.version);

  esp_http_client_config_t httpConfig = {};
  httpConfig.url = release.url.c_str();
  httpConfig.crt_bundle_attach = esp_crt_bundle_attach;
  httpConfig.timeout_ms = 15000;
  httpConfig.keep_alive_enable = true;

  esp_https_ota_config_t otaConfig = {};
  otaConfig.http_config = &httpConfig;
  otaConfig.http_client_init_cb = addDeviceKeyHeader;

  const esp_partition_t *updatePartition =
      esp_ota_get_next_update_partition(nullptr);
  if (updatePartition == nullptr) {
    Serial.println("No OTA update partition is available.");
    showError("No OTA partition");
    lastErrorCode = "ota_partition_missing";
    sendDeviceStatus("ota_failed", lastErrorCode);
    return false;
  }

  esp_https_ota_handle_t otaHandle = nullptr;
  esp_err_t result = esp_https_ota_begin(&otaConfig, &otaHandle);
  if (result != ESP_OK) {
    Serial.printf("OTA begin failed: %s\n", esp_err_to_name(result));
    showError("OTA connection failed");
    lastErrorCode = "ota_begin_failed";
    sendDeviceStatus("ota_failed", esp_err_to_name(result));
    return false;
  }

  const int imageSize = esp_https_ota_get_image_size(otaHandle);
  int previousPercent = -1;
  do {
    result = esp_https_ota_perform(otaHandle);
    const int bytesRead = esp_https_ota_get_image_len_read(otaHandle);
    const int percent =
        imageSize > 0 ? constrain((bytesRead * 100) / imageSize, 0, 100) : 0;
    if (percent != previousPercent) {
      previousPercent = percent;
      showOtaProgress(release.version, percent);
      Serial.printf("OTA progress: %d%%\n", percent);
    }
  } while (result == ESP_ERR_HTTPS_OTA_IN_PROGRESS);

  if (result != ESP_OK ||
      !esp_https_ota_is_complete_data_received(otaHandle)) {
    Serial.printf("OTA download failed: %s\n", esp_err_to_name(result));
    esp_https_ota_abort(otaHandle);
    showError("OTA download failed");
    lastErrorCode = "ota_download_failed";
    sendDeviceStatus("ota_failed", esp_err_to_name(result));
    return false;
  }
  sendDeviceStatus("ota_downloaded", release.version);

  uint8_t partitionDigest[32];
  if (esp_partition_get_sha256(updatePartition, partitionDigest) != ESP_OK ||
      digestToHex(partitionDigest) != release.sha256) {
    Serial.println("OTA SHA-256 verification failed.");
    esp_https_ota_abort(otaHandle);
    showError("OTA verification failed");
    lastErrorCode = "ota_sha_mismatch";
    sendDeviceStatus("ota_failed", lastErrorCode);
    return false;
  }
  sendDeviceStatus("ota_verified", release.version);

  result = esp_https_ota_finish(otaHandle);
  if (result != ESP_OK) {
    Serial.printf("OTA finish failed: %s\n", esp_err_to_name(result));
    showError("OTA install failed");
    lastErrorCode = "ota_finish_failed";
    sendDeviceStatus("ota_failed", esp_err_to_name(result));
    return false;
  }

  showStatus(ST77XX_GREEN, ST77XX_BLACK, "UPDATE VERIFIED",
             "Restarting into " + release.version);
  Serial.println("OTA verified. Restarting.");
  delay(1500);
  esp_restart();
  return true;
}

void checkForOtaUpdate() {
  if (WiFi.status() != WL_CONNECTED) return;

  FirmwareRelease release;
  bool available = false;
  Serial.printf("Checking OTA manifest from version %s\n", FIRMWARE_VERSION);
  sendDeviceStatus("ota_check", FIRMWARE_VERSION);
  if (!fetchFirmwareRelease(release, available)) {
    Serial.println("OTA manifest check failed.");
    sendDeviceStatus("ota_failed", lastErrorCode);
    return;
  }
  if (!available) {
    Serial.println("No newer valid firmware release.");
    sendDeviceStatus("ota_no_update", FIRMWARE_VERSION);
    return;
  }

  installFirmware(release);
}

void confirmRunningImage() {
  const esp_partition_t *running = esp_ota_get_running_partition();
  esp_ota_img_states_t state;
  if (running != nullptr &&
      esp_ota_get_state_partition(running, &state) == ESP_OK &&
      state == ESP_OTA_IMG_PENDING_VERIFY) {
    showStatus(ST77XX_BLUE, ST77XX_WHITE, "TESTING UPDATE",
               "Checking hardware...");
    delay(500);
    const esp_err_t result = esp_ota_mark_app_valid_cancel_rollback();
    Serial.printf("OTA image validation: %s\n", esp_err_to_name(result));
    otaConfirmedStatusPending = result == ESP_OK;
  }
}

void setup() {
  Serial.begin(115200);
  delay(1500);
  bootId = String(static_cast<uint32_t>(esp_random()), HEX);

  loadConfiguration();
  if (!wifiConfigured()) {
    Serial.println("Mailbox configuration is missing from NVS.");
  }

  if (!ledcAttach(TFT_LITE, 5000, 8)) {
    Serial.println("Backlight PWM setup failed.");
  }
  ledcWrite(TFT_LITE, 120);

  SPI.begin(SCK, MISO, MOSI, TFT_CS);
  display.init(240, 320);
  display.setRotation(3);

  if (!NAVIGATION_ENABLED) {
    showStatus(ST77XX_BLACK, ST77XX_CYAN, "OTA BOOTSTRAP",
               "Ready for wireless update");
  }

  Wire.begin();
  if (!button.begin(BUTTON_ADDRESS, Wire)) {
    showError("Button not detected");
    while (true) delay(1000);
  }
  if (!lightSensor.begin(Wire)) {
    showError("Light sensor not detected");
    while (true) delay(1000);
  }
  if (!buzzer.begin(BUZZER_ADDRESS, Wire)) {
    showError("Buzzer not detected");
    while (true) delay(1000);
  }

  button.LEDoff();
  detachServo();
  while (!button.isPressedQueueEmpty()) button.popPressedQueue();
  while (!button.isClickedQueueEmpty()) button.popClickedQueue();
  button.clearEventBits();
  confirmRunningImage();
  delay(1000);
  lastUserInteractionAt = millis();
  if (NAVIGATION_ENABLED) showScreensaver();

  WiFi.mode(WIFI_STA);
  maintainWifi();
}

void loop() {
  maintainWifi();
  handleButton();
  updateButtonLed();
  updateFlagState();
  maintainServo();

  const unsigned long now = millis();
  if (now - lastLightAt >= LIGHT_INTERVAL_MS) {
    lastLightAt = now;
    ledcWrite(TFT_LITE, brightnessForLux(lightSensor.readLight()));
  }

  if (now - lastPollAt >= POLL_INTERVAL_MS) {
    lastPollAt = now;
    pollMessages();
  }

  if (WiFi.status() == WL_CONNECTED) {
    if (otaConfirmedStatusPending) {
      otaConfirmedStatusPending = false;
      lastStatusAt = now;
      sendDeviceStatus("ota_confirmed", FIRMWARE_VERSION);
    } else if (bootStatusPending) {
      bootStatusPending = false;
      lastStatusAt = now;
      sendDeviceStatus("boot", resetReasonName());
    } else if (now - lastStatusAt >= STATUS_INTERVAL_MS) {
      lastStatusAt = now;
      sendDeviceStatus("heartbeat", "");
    }
  }

  updateScreensaver();

  if (WiFi.status() == WL_CONNECTED && wifiConnectedAt > 0) {
    if (!initialOtaCheckComplete &&
        now - wifiConnectedAt >= OTA_INITIAL_DELAY_MS) {
      initialOtaCheckComplete = true;
      lastOtaCheckAt = now;
      checkForOtaUpdate();
    } else if (initialOtaCheckComplete &&
               now - lastOtaCheckAt >= OTA_CHECK_INTERVAL_MS) {
      lastOtaCheckAt = now;
      checkForOtaUpdate();
    }
  }

  delay(20);
}
