# EZO Bluetooth Thermal Printer Demo

This project contains:

- `frontend/` - React + Vite app that connects to a Bluetooth thermal printer using Web Bluetooth and prints text/receipt data.
- `backend/` - Next.js backend/API app that can generate receipt data and expose printer-ready text.

> Important: Bluetooth printing must run from the browser on the user's device. A backend server cannot directly access a local Bluetooth printer unless it is running on the same machine with native Bluetooth libraries and OS permissions.

## Requirements

- Node.js 18+
- Chrome / Edge browser with Web Bluetooth support
- HTTPS or localhost
- EZO / ESC-POS compatible Bluetooth thermal printer

## How to run

### Backend

```bash
cd backend
npm install
npm run dev
```

Backend runs on:

```text
http://localhost:3000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend runs on:

```text
http://localhost:5173
```

Open the frontend in Chrome or Edge.

## How it works

1. Click **Fetch Receipt From Backend**.
2. Click **Connect Bluetooth Printer**.
3. Select your EZO thermal printer from the Bluetooth popup.
4. Click **Print Receipt**.

## Printer Notes

Many Bluetooth thermal printers use ESC/POS commands. This project sends ESC/POS-compatible bytes:

- Initialize printer
- Print text
- Feed paper
- Cut command if supported

Different printers expose different Bluetooth services/characteristics. The frontend tries common writable characteristics, but you may need to update the service UUID and characteristic UUID for your exact EZO printer model.

## Common Bluetooth UUIDs

Some thermal printers use custom services. If auto-detection fails, check your printer's SDK/manual and update:

```js
const service = await server.getPrimaryService('YOUR_SERVICE_UUID')
const characteristic = await service.getCharacteristic('YOUR_CHARACTERISTIC_UUID')
```

## Browser limitation

Web Bluetooth does not work on all browsers or all mobile devices. Chrome/Edge desktop and Android Chrome are usually the best options.
