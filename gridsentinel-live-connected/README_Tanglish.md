# GridSentinel — Wokwi + Python Flask API + React dashboard

This is a complete runnable starter project. It contains the **actual Vite entry file, React styles, package.json, Flask API, and Wokwi sketch/diagram**. Potentiometers simulate current readings; they are not real current sensors.

## Folder contents

- `backend/app.py` — Flask API that receives readings, recalculates the gap and alert, and keeps the latest 500 records in memory.
- `frontend/` — complete Vite + React dashboard with real routes: `/`, `/telemetry`, `/alerts`, `/setup`.
- `wokwi/diagram.json` — ESP32, two potentiometers, LED and 220-ohm resistor wiring.
- `wokwi/sketch.ino` — ESP32 code to read the potentiometers and POST readings to the Flask API through an HTTPS tunnel.

## A. Start Python backend (Terminal 1)

Open PowerShell in the extracted `backend` folder. For example:

```powershell
cd "$env:USERPROFILE\Downloads\gridsentinel-live-connected\backend"
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python app.py
```

If PowerShell blocks activation, you can skip activation and run `py -m pip install -r requirements.txt` then `py app.py` (use the same Python installation for both commands).

Check the API in your browser:

- `http://127.0.0.1:5000/api/health` — should return JSON with `"ok": true`.
- `http://127.0.0.1:5000/api/readings/latest` — initially returns `"data": null` until a packet arrives.

Keep this terminal open.

## B. Start a public tunnel for Wokwi (Terminal 2)

The Wokwi **public** simulator can make outgoing internet requests, but it cannot reach a service running only at your laptop's `localhost`. Expose local port 5000 using a tunnel:

Option 1 — if ngrok is already installed and configured:

```powershell
ngrok http 5000
```

Option 2 — if Cloudflare `cloudflared` is installed:

```powershell
cloudflared tunnel --url http://localhost:5000
```

Copy the public **HTTPS** URL printed by the tool, for example `https://your-random-name.ngrok-free.app`. The sample URL is only an example; use your actual one. Keep the tunnel terminal open.

## C. Start React frontend (Terminal 3)

Open another PowerShell terminal in the extracted `frontend` folder:

```powershell
Copy-Item .env.example .env
npm install
npm run dev
```

Open the `Local:` URL printed by Vite (usually `http://127.0.0.1:5173`). For local frontend development, `.env` should normally stay as:

```env
VITE_API_BASE_URL=http://127.0.0.1:5000
```

Do **not** add `/api` at the end. If you edit `.env`, stop Vite with `Ctrl+C` and run `npm run dev` again.

## D. Connect Wokwi to the backend

1. Open <https://wokwi.com/projects/new/esp32>.
2. Replace the content of the Wokwi `diagram.json` with `wokwi/diagram.json`.
3. Replace `sketch.ino` with `wokwi/sketch.ino`.
4. In `sketch.ino`, find `BACKEND_URL` and replace it with your real public HTTPS tunnel URL plus `/api/readings`.

Example format:

```cpp
const char* BACKEND_URL = "https://YOUR-REAL-TUNNEL-URL/api/readings";
```

Do not paste the example placeholder literally. The ESP32 URL must be the **public tunnel**, not `localhost`, because Wokwi's public gateway does not have access to your laptop's local network. Start the simulation and open Serial Monitor at 115200 baud.

## E. Verify the complete flow

- Serial Monitor should report `WiFi connected!` and later `WEB: POST HTTP status = 201`.
- The Flask terminal should print each received sample, including `source=WOKWI_SIMULATION`.
- The React dashboard should change from “Waiting for the first reading” to live sensor values, gap percentage, graph and recent telemetry within about 2.5 seconds.
- Move the two virtual potentiometers to change simulated input/consumer current.

### Test frontend before Wokwi is connected

With Flask running, click **Send test packet** on the dashboard. It adds one explicitly labelled `LOCAL_TEST_NOT_WOKWI` sample so you can confirm the React → API connection. It is **not** an actual Wokwi packet. The next Wokwi packet will replace it as the latest reading.

## Alert logic

- `gap = abs(input current - consumer current)`.
- Percentage = `gap / input current × 100` when input current is not near zero.
- Server alert threshold: gap at least `0.25 A` **and** `20%` of input current, with input at least `0.05 A`.
- If consumer current is more than 0.05 A above input current, the status is `CHECK_SENSOR`, not a theft alert.
- The server recalculates status from the two readings; it does not blindly trust the status sent by the simulator.

This prototype is for learning/demo use. An alert is not proof of electricity theft; legitimate branches, sensor alignment, sampling time and measurement error must be checked. Do not connect the simulated wiring or low-voltage sensor modules directly to mains. Real mains testing requires suitably rated, isolated hardware and a qualified electrical professional.

## Troubleshooting

- **Wi-Fi stuck at “Connecting…”**: use `WiFi.begin("Wokwi-GUEST", "", 6)` exactly; restart the simulation. Ensure the diagram does not add a custom AP that replaces the default network.
- **`BACKEND_URL is not configured`**: replace the placeholder with the current tunnel URL and `/api/readings`.
- **HTTP 404**: verify the URL ends exactly in `/api/readings` and the tunnel points to port 5000.
- **HTTP `-1` or timeout**: check Flask and tunnel are running, then verify the URL. Free tunnels may change URL after restarting.
- **React says API offline**: open `http://127.0.0.1:5000/api/health` in the same computer's browser. Confirm the `.env` value and restart Vite.
- **Dashboard API connected, but waiting for data**: the Flask API is online but has not received a packet yet. Check Wokwi Serial Monitor for HTTP status `201`.
- **No readings after backend restart**: expected; this demo stores readings in memory, not a database.

## API endpoints

- `GET /api/health`
- `POST /api/readings`
- `GET /api/readings/latest`
- `GET /api/readings?limit=40`
- `GET /api/summary`
- `POST /api/demo/sample` (clearly labelled local test packet)

The development CORS policy allows any origin to simplify a hackathon demo. Restrict it before production use. Temporary public tunnels and the ESP32 sketch's unverified TLS mode are also demo-only.
