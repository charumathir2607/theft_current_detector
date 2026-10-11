// GridSentinel | Wokwi ESP32 -> Flask API -> React dashboard
// IMPORTANT: Pots simulate current-sensor values. They do not measure real current.

#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>

const int SENSOR_A_PIN = 34;   // Pot 1: upstream/input current simulation
const int SENSOR_B_PIN = 35;   // Pot 2: downstream/consumer current simulation
const int ALERT_LED_PIN = 2;   // External red LED (with 220 ohm resistor) to GPIO2

const float SIMULATED_MAX_CURRENT_A = 5.0f;
const float MIN_INPUT_CURRENT_A = 0.05f;
const float MIN_ALERT_GAP_A = 0.25f;
const float GAP_THRESHOLD_PERCENT = 20.0f;  // Must match backend/app.py
const unsigned long POST_INTERVAL_MS = 2500;
const unsigned long WIFI_RETRY_INTERVAL_MS = 8000;

const char* WIFI_SSID = "Wokwi-GUEST";
const char* WIFI_PASSWORD = "";

// REQUIRED: Replace with your actual public HTTPS tunnel URL + /api/readings.
// Example format only: https://your-real-name.ngrok-free.app/api/readings
const char* BACKEND_URL = "YOUR_PUBLIC_CLOUDFLARE_TUNNEL_URL/api/readings";

unsigned long lastPostMs = 0;
unsigned long lastWifiAttemptMs = 0;

float readCurrentSimulation(int pin) {
  const int raw = analogRead(pin);  // ESP32 ADC range 0..4095
  return (static_cast<float>(raw) / 4095.0f) * SIMULATED_MAX_CURRENT_A;
}

void connectWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
  Serial.print("Connecting to Wokwi-GUEST");
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD, 6);
  lastWifiAttemptMs = millis();

  const unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 20000) {
    delay(250);
    Serial.print(".");
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println(" connected!");
    Serial.print("ESP32 IP: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println(" not connected yet; will retry while simulation runs.");
  }
}

void postReading(float inputA, float consumerA, float gapA, float gapPct,
                 const char* status, bool alert) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WEB: skipped; Wi-Fi is not connected.");
    return;
  }

  String url = String(BACKEND_URL);
  if (url.indexOf("YOUR_PUBLIC_CLOUDFLARE_TUNNEL_URL") >= 0 || url.indexOf("REPLACE_WITH") >= 0) {
    Serial.println("WEB: BACKEND_URL is not configured yet.");
    Serial.println("WEB: Paste your cloudflared HTTPS URL + /api/readings into sketch.ino.");
    return;
  }

  // Use HTTPS for public tunnel URLs. setInsecure() is demo-only; production firmware
  // should validate the server certificate instead.
  WiFiClientSecure secureClient;
  secureClient.setInsecure();
  HTTPClient http;
  http.setTimeout(7000);

  if (!http.begin(secureClient, BACKEND_URL)) {
    Serial.println("WEB: HTTP client setup failed. Check BACKEND_URL.");
    return;
  }

  http.addHeader("Content-Type", "application/json");
  http.addHeader("ngrok-skip-browser-warning", "true");

  String payload = "{";
  payload += "\"device_id\":\"gridsentinel-wokwi-01\",";
  payload += "\"sensor_a_amps\":" + String(inputA, 3) + ",";
  payload += "\"sensor_b_amps\":" + String(consumerA, 3) + ",";
  payload += "\"gap_amps\":" + String(gapA, 3) + ",";
  payload += "\"gap_percent\":" + String(gapPct, 2) + ",";
  payload += "\"alert\":" + String(alert ? "true" : "false") + ",";
  payload += "\"status\":\"" + String(status) + "\",";
  payload += "\"source\":\"WOKWI_SIMULATION\"";
  payload += "}";

  const int code = http.POST(payload);
  Serial.print("WEB: POST HTTP status = ");
  Serial.println(code);
  if (code > 0) {
    Serial.print("WEB response: ");
    Serial.println(http.getString());
  } else {
    Serial.print("WEB request failed: ");
    Serial.println(HTTPClient::errorToString(code));
    Serial.println("Check that Flask + public tunnel are running and the URL ends in /api/readings.");
  }
  http.end();
}

void setup() {
  Serial.begin(115200);
  delay(300);
  pinMode(ALERT_LED_PIN, OUTPUT);
  analogReadResolution(12);
  digitalWrite(ALERT_LED_PIN, LOW);

  Serial.println();
  Serial.println("================================================");
  Serial.println("GridSentinel Wokwi -> Flask -> React demo started");
  Serial.println("Pots are simulated current readings, NOT real sensors.");
  Serial.println("================================================");
  connectWiFi();
}

void loop() {
  if (WiFi.status() != WL_CONNECTED && millis() - lastWifiAttemptMs >= WIFI_RETRY_INTERVAL_MS) {
    Serial.println("Wi-Fi reconnect attempt...");
    connectWiFi();
  }

  const float inputA = readCurrentSimulation(SENSOR_A_PIN);
  const float consumerA = readCurrentSimulation(SENSOR_B_PIN);
  const float signedGap = inputA - consumerA;
  const float gapA = fabsf(signedGap);
  const float gapPct = (inputA >= MIN_INPUT_CURRENT_A) ? (gapA / inputA) * 100.0f : 0.0f;

  const bool checkSensor = signedGap < -0.05f;
  const bool alert = !checkSensor && inputA >= MIN_INPUT_CURRENT_A &&
                     signedGap >= MIN_ALERT_GAP_A && gapPct >= GAP_THRESHOLD_PERCENT;
  const char* status = checkSensor ? "CHECK_SENSOR" : (alert ? "ALERT" : "NORMAL");
  digitalWrite(ALERT_LED_PIN, alert ? HIGH : LOW);

  Serial.println("------------------------------------------------");
  Serial.printf("Sensor A / input:     %.2f A\n", inputA);
  Serial.printf("Sensor B / consumer:  %.2f A\n", consumerA);
  Serial.printf("Current gap:          %.2f A\n", gapA);
  Serial.printf("Gap percentage:       %.1f %%\n", gapPct);
  Serial.printf("STATUS: %s\n", status);
  Serial.println("Note: simulated readings only; an alert is not proof of theft.");

  if (millis() - lastPostMs >= POST_INTERVAL_MS) {
    lastPostMs = millis();
    postReading(inputA, consumerA, gapA, gapPct, status, alert);
  }

  delay(500);
}
