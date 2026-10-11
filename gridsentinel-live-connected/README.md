# GridSentinel — Complete Project & Integration Guide

GridSentinel is an electricity discrepancy and suspected power-theft monitoring prototype. It connects a **Wokwi ESP32 virtual hardware simulation** to a **Python Flask backend API**, which streams real-time analytics to a **React (Vite) live dashboard**.

---

## ⚡ Safety & Prototype Disclaimer
- **Simulation Only**: Wokwi potentiometers simulate current-sensor inputs.
- **Safety**: Never connect microcontrollers or prototype boards directly to mains electricity.
- **Investigation Signal**: A current discrepancy indicates an anomaly for investigation (such as branch usage or meter error), not definitive proof of power theft.
- **In-Memory Storage**: Demo readings are kept in-memory in Flask and reset when the server restarts.

---

## 🛠️ Architecture Flow
```
[Wokwi ESP32 Simulator] 
       │ (Sends HTTP POST with simulated Potentiometer readings)
       ▼
[Cloudflare Quick Tunnel] (https://<your-tunnel>.trycloudflare.com/api/readings)
       │ (Forwards request securely to localhost port 5000)
       ▼
[Python Flask Backend] (http://127.0.0.1:5000)
       │ (Validates, calculates discrepancy, stores in memory)
       ▼
[React Live Dashboard] (http://127.0.0.1:5173)
       │ (Polls every 2.5s and updates metrics, charts, & alerts)
```

---

## 🚀 Step-by-Step Setup Guide (Windows PowerShell)

### Step 1: Start the Python Flask Backend
1. Open PowerShell and navigate to the backend folder:
   ```powershell
   cd C:\Users\mcr24\Downloads\GridSentinel_Live_Connected_Prototype\gridsentinel-live-connected\backend
   ```
2. (Optional) Create virtual environment if not already created:
   ```powershell
   python -m venv .venv
   ```
3. Activate the virtual environment & install requirements:
   ```powershell
   .\.venv\Scripts\Activate.ps1
   pip install -r requirements.txt
   ```
4. Start the Flask server:
   ```powershell
   python app.py
   ```
   *The backend runs on `http://127.0.0.1:5000`.*

---

### Step 2: Launch Cloudflare Tunnel
1. Open a new PowerShell window and navigate to where `cloudflared.exe` is located:
   ```powershell
   cd C:\Users\mcr24\Downloads
   ```
2. Start the quick tunnel:
   ```powershell
   .\cloudflared.exe tunnel --url http://localhost:5000
   ```
3. Look for the line in the terminal output:
   ```text
   Your quick Tunnel has been created! Visit it at:
   https://<unique-name>.trycloudflare.com
   ```
4. Copy your HTTPS URL (e.g. `https://<unique-name>.trycloudflare.com`).

---

### Step 3: Configure Wokwi ESP32 Firmware
1. Open [`wokwi/sketch.ino`](wokwi/sketch.ino) in VS Code or Wokwi.
2. Locate line 24:
   ```cpp
   const char* BACKEND_URL = "YOUR_PUBLIC_CLOUDFLARE_TUNNEL_URL/api/readings";
   ```
3. Replace `YOUR_PUBLIC_CLOUDFLARE_TUNNEL_URL` with your active tunnel URL + `/api/readings`.
   *Example:*
   ```cpp
   const char* BACKEND_URL = "https://<unique-name>.trycloudflare.com/api/readings";
   ```
4. In Wokwi simulator:
   - Wi-Fi SSID is `Wokwi-GUEST` (password is empty).
   - Adjust **Potentiometer 1 (GPIO 34)** for Input Current and **Potentiometer 2 (GPIO 35)** for Consumer Current.
   - Click **Start Simulation**.

---

### Step 4: Start the React Frontend Dashboard
1. Open a new PowerShell window and navigate to the frontend directory:
   ```powershell
   cd C:\Users\mcr24\Downloads\GridSentinel_Live_Connected_Prototype\gridsentinel-live-connected\frontend
   ```
2. Verify `.env` file content:
   ```env
   VITE_API_BASE_URL=http://127.0.0.1:5000
   ```
3. Install dependencies and start Vite dev server:
   ```powershell
   npm install
   npm run dev
   ```
4. Open `http://localhost:5173` in your browser.

---

## 🔍 Verification & Diagnostics Commands

You can run these PowerShell commands anytime to test every layer of the system:

### 1. Test Backend Health
```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:5000/api/health"
```

### 2. Inject Test Reading from Dashboard
```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:5000/api/demo/sample" -Method POST
```

### 3. Check Latest Reading
```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:5000/api/readings/latest"
```

### 4. Post Custom Reading Manually
```powershell
$body = @{ sensor_a_amps = 4.5; sensor_b_amps = 2.1; device_id = "powershell-test" } | ConvertTo-Json
Invoke-RestMethod -Uri "http://127.0.0.1:5000/api/readings" -Method POST -ContentType "application/json" -Body $body
```

---

## ❓ Troubleshooting & FAQs

- **Port 5000 Conflict / Multiple Python Instances**:
  If port 5000 is occupied by an old script (such as another project in Downloads/Desktop), stop all Python processes:
  ```powershell
  Stop-Process -Name python -Force
  ```
  Then re-launch `python app.py` from `gridsentinel-live-connected\backend`.

- **React says "Backend connection problem" / "API offline"**:
  Make sure `python app.py` is running in `gridsentinel-live-connected\backend` and `.env` has `VITE_API_BASE_URL=http://127.0.0.1:5000`.

- **Wokwi POST returns HTTP status `-1` or `404`**:
  - `-1` or connection failed: Cloudflare tunnel closed or incorrect URL.
  - `404`: Ensure the URL in `sketch.ino` ends with `/api/readings`.
