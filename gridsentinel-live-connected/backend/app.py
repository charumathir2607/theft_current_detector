"""GridSentinel demo API: receives Wokwi ESP32 telemetry and serves it to React.

Readings are kept in memory for a lightweight student prototype. Restarting this
process clears the in-memory history. This is not a production utility system.
"""
from __future__ import annotations

from collections import deque
from datetime import datetime, timezone
from math import isfinite
from threading import Lock
from typing import Any

from flask import Flask, jsonify, request
from flask_cors import CORS

app = Flask(__name__)
app.config["JSON_SORT_KEYS"] = False
# Development-only CORS so a local Vite page and a deployed test page can call the API.
# Restrict allowed origins before any public/production deployment.
CORS(app, resources={r"/api/*": {"origins": "*"}})

MAX_HISTORY = 500
ALERT_GAP_PERCENT = 20.0
MIN_ALERT_GAP_AMPS = 0.25
MIN_INPUT_AMPS = 0.05
READINGS: deque[dict[str, Any]] = deque(maxlen=MAX_HISTORY)
READINGS_LOCK = Lock()
STARTED_AT = datetime.now(timezone.utc).isoformat()


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def parse_number(body: dict[str, Any], *keys: str) -> float:
    """Get the first provided numeric field, rejecting booleans/NaN/infinity."""
    for key in keys:
        if key in body:
            value = body[key]
            if isinstance(value, bool):
                raise ValueError(f"'{key}' must be a number")
            try:
                number = float(value)
            except (TypeError, ValueError):
                raise ValueError(f"'{key}' must be a number") from None
            if not isfinite(number):
                raise ValueError(f"'{key}' must be a finite number")
            if number < 0 or number > 1000:
                raise ValueError(f"'{key}' must be between 0 and 1000")
            return number
    raise ValueError(f"Missing required field: '{keys[0]}'")


def build_reading(body: dict[str, Any], *, source_override: str | None = None) -> dict[str, Any]:
    # Accept both the sketch's names and intuitive alternate names.
    sensor_a = parse_number(body, "sensor_a_amps", "input_current", "input_current_a")
    sensor_b = parse_number(body, "sensor_b_amps", "consumer_current", "consumer_current_a")

    signed_gap = sensor_a - sensor_b
    gap_amps = abs(signed_gap)
    gap_percent = (gap_amps / sensor_a * 100.0) if sensor_a >= MIN_INPUT_AMPS else 0.0

    # A downstream current higher than upstream current is treated as a measurement
    # / wiring check, not as a theft alert.
    if signed_gap < -0.05:
        status = "CHECK_SENSOR"
        alert = False
    elif (
        signed_gap >= MIN_ALERT_GAP_AMPS
        and gap_percent >= ALERT_GAP_PERCENT
        and sensor_a >= MIN_INPUT_AMPS
    ):
        status = "ALERT"
        alert = True
    else:
        status = "NORMAL"
        alert = False

    source = source_override or str(body.get("source", "WOKWI_SIMULATION"))
    source = source[:40]
    reading = {
        "device_id": str(body.get("device_id", "gridsentinel-wokwi-01"))[:80],
        "sensor_a_amps": round(sensor_a, 3),
        "sensor_b_amps": round(sensor_b, 3),
        "gap_amps": round(gap_amps, 3),
        "gap_percent": round(gap_percent, 2),
        "signed_gap_amps": round(signed_gap, 3),
        "alert": alert,
        "status": status,
        "source": source,
        "received_at": now_iso(),
        "threshold_percent": ALERT_GAP_PERCENT,
    }
    return reading


def store_reading(reading: dict[str, Any]) -> None:
    with READINGS_LOCK:
        READINGS.append(reading)
    print(
        f"[{reading['received_at']}] {reading['status']} | "
        f"A={reading['sensor_a_amps']:.2f}A "
        f"B={reading['sensor_b_amps']:.2f}A "
        f"gap={reading['gap_amps']:.2f}A "
        f"({reading['gap_percent']:.1f}%) source={reading['source']}"
    )


@app.after_request
def add_no_cache_headers(response):
    response.headers["Cache-Control"] = "no-store"
    return response


@app.get("/")
def root():
    return jsonify({
        "ok": True,
        "service": "GridSentinel live demo API",
        "health": "/api/health",
        "latest_reading": "/api/readings/latest",
    })


@app.get("/api/health")
def health():
    with READINGS_LOCK:
        count = len(READINGS)
        latest = READINGS[-1] if READINGS else None
    age_seconds = None
    if latest:
        try:
            received = datetime.fromisoformat(latest["received_at"])
            age_seconds = max(0, int((datetime.now(timezone.utc) - received).total_seconds()))
        except (ValueError, TypeError):
            age_seconds = None
    return jsonify({
        "ok": True,
        "service": "GridSentinel live demo API",
        "started_at": STARTED_AT,
        "received_count": count,
        "latest_age_seconds": age_seconds,
        "latest_source": latest["source"] if latest else None,
    })


@app.post("/api/readings")
def receive_reading():
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        return jsonify({"ok": False, "error": "Expected a JSON object body"}), 400
    try:
        reading = build_reading(body)
    except ValueError as exc:
        return jsonify({"ok": False, "error": str(exc)}), 400
    store_reading(reading)
    return jsonify({"ok": True, "message": "Reading accepted", "data": reading}), 201


@app.get("/api/readings/latest")
def latest_reading():
    with READINGS_LOCK:
        latest = READINGS[-1] if READINGS else None
    return jsonify({"ok": True, "data": latest})


@app.get("/api/readings")
def list_readings():
    try:
        limit = int(request.args.get("limit", "30"))
    except ValueError:
        limit = 30
    limit = max(1, min(limit, 100))
    with READINGS_LOCK:
        rows = list(READINGS)[-limit:][::-1]
    return jsonify({"ok": True, "count": len(rows), "data": rows})


@app.get("/api/summary")
def summary():
    with READINGS_LOCK:
        rows = list(READINGS)
    return jsonify({
        "ok": True,
        "reading_count": len(rows),
        "alert_count": sum(1 for row in rows if row["status"] == "ALERT"),
        "normal_count": sum(1 for row in rows if row["status"] == "NORMAL"),
        "check_sensor_count": sum(1 for row in rows if row["status"] == "CHECK_SENSOR"),
        "latest": rows[-1] if rows else None,
    })


@app.post("/api/demo/sample")
def inject_local_test_sample():
    """Create an explicitly labelled LOCAL_TEST sample to test React without Wokwi."""
    reading = build_reading(
        {"sensor_a_amps": 4.0, "sensor_b_amps": 2.3, "device_id": "browser-test"},
        source_override="LOCAL_TEST_NOT_WOKWI",
    )
    store_reading(reading)
    return jsonify({"ok": True, "message": "Local test packet created (not from Wokwi)", "data": reading}), 201


if __name__ == "__main__":
    print("\nGridSentinel API starting")
    print("Local API:      http://127.0.0.1:5000")
    print("Health check:   http://127.0.0.1:5000/api/health")
    print("Latest reading: http://127.0.0.1:5000/api/readings/latest")
    print("Demo data is in-memory only and clears when the server restarts.\n")
    app.run(host="0.0.0.0", port=5000, debug=False, threaded=True)
