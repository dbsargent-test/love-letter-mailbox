#include <Arduino.h>

constexpr uint8_t SERVO_PIN = 1;
constexpr uint32_t SERVO_FREQUENCY_HZ = 50;
constexpr uint8_t SERVO_RESOLUTION_BITS = 16;
constexpr uint16_t SERVO_LEFT_US = 1200;
constexpr uint16_t SERVO_CENTER_US = 1500;
constexpr uint16_t SERVO_RIGHT_US = 1800;

bool servoAttached = false;

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
  return servoAttached;
}

void writePosition(uint16_t pulseUs, const char *label) {
  if (!attachServo()) {
    Serial.println("ERROR: Unable to attach servo PWM on IO1.");
    return;
  }
  ledcWrite(SERVO_PIN, pulseToDuty(pulseUs));
  Serial.printf("Servo position: %s (%u us)\n", label, pulseUs);
}

void detachServo() {
  if (servoAttached) {
    ledcDetach(SERVO_PIN);
    servoAttached = false;
  }
  pinMode(SERVO_PIN, OUTPUT);
  digitalWrite(SERVO_PIN, LOW);
  Serial.println("Servo signal detached and IO1 held LOW.");
}

void printCommands() {
  Serial.println("Commands:");
  Serial.println("  1 = left test position (1200 us)");
  Serial.println("  2 = center position (1500 us)");
  Serial.println("  3 = right test position (1800 us)");
  Serial.println("  x = detach signal and hold IO1 LOW");
}

void setup() {
  Serial.begin(115200);
  delay(1500);

  Serial.println("SG90 servo smoke test on IO1.");
  writePosition(SERVO_CENTER_US, "CENTER");
  Serial.println(
      "PWM is stable at center. Connect servo VUSB power only after this line.");
  printCommands();
}

void loop() {
  if (!Serial.available()) return;

  const char command = static_cast<char>(Serial.read());
  switch (command) {
    case '1':
      writePosition(SERVO_LEFT_US, "LEFT");
      break;
    case '2':
      writePosition(SERVO_CENTER_US, "CENTER");
      break;
    case '3':
      writePosition(SERVO_RIGHT_US, "RIGHT");
      break;
    case 'x':
    case 'X':
      detachServo();
      break;
    case '\r':
    case '\n':
      break;
    default:
      Serial.printf("Unknown command: %c\n", command);
      printCommands();
      break;
  }
}
