# 🔥 Firefly UI

The **Firefly UI** is the React frontend of the Firefly project.  
It connects to a [firefly-host](https://github.com/KooleControls/firefly-host) ESP32 over Wi-Fi and visualizes activity from multiple [firefly-guest](https://github.com/KooleControls/firefly-guest) ESP32-C3 boards.

- View live logs of button presses from guest devices  
- Trigger LED blinks on one or more boards  
- Explore how embedded systems and modern web UIs can interact seamlessly  

Built with **Vite**, **TypeScript**, and **shadcn/ui**.

---

## 🚀 Getting Started

### Prerequisites
- Node.js (>= 18)
- npm, pnpm, or yarn

### Install & Run
```bash
# Clone this repo
git clone https://github.com/KooleControls/firefly-ui.git
cd firefly-ui

# Install dependencies
npm install

# Start dev server
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) to view the UI.

---

## 📦 Build for Deployment

The Firefly host expects **pre-compressed files** (gzip) for efficient serving.

```bash
# Build optimized production bundle with gzip
npm run buildgz
```

This produces `.gz` files inside the `dist/` directory.  
Later, these can be uploaded to the [firefly-host](https://github.com/KooleControls/firefly-host) ESP32 (e.g. via FTP or OTA) so the webserver can serve them directly.

---

## 🧩 How to Play

1. Flash the [firefly-host](https://github.com/KooleControls/firefly-host) firmware onto an ESP32.  
   - The host runs a small web server and bridges communication with guest devices via ESP-NOW.  

2. Flash the [firefly-guest](https://github.com/KooleControls/firefly-guest) firmware onto one or more ESP32-C3 boards.  
   - Each guest has a button and LED.  
   - Pressing the button sends an event to the host.  

3. Connect your computer/phone to the same Wi-Fi network as the host ESP32.  
   - Open the Firefly UI (served by the host, or run locally).  
   - Watch events roll in live.  
   - Use the UI controls to blink LEDs on specific guest boards.  

---

## 🛠 Tech Stack
- ⚡ [Vite](https://vitejs.dev/) – fast dev build tool  
- 🟦 [TypeScript](https://www.typescriptlang.org/) – type safety  
- 🎨 [shadcn/ui](https://ui.shadcn.com/) – modern React components  
- 📡 Fetch API – communicates with the host ESP32’s REST endpoints  

---

## 📚 Related Repos
- [firefly-host](https://github.com/KooleControls/firefly-host) – ESP32 firmware for the host  
- [firefly-guest](https://github.com/KooleControls/firefly-guest) – ESP32-C3 firmware for the guests  

---

✨ Firefly is part of the [KooleControls](https://github.com/KooleControls) collection of projects for exploring embedded systems, wireless communication, and modern web development.
