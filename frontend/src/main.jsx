import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3000';

const encoder = new TextEncoder();

function textToEscPosBytes(text) {
  const init = [0x1b, 0x40]; // ESC @ initialize
  const alignCenter = [0x1b, 0x61, 0x01];
  const alignLeft = [0x1b, 0x61, 0x00];
  const feed = [0x0a, 0x0a, 0x0a];
  const cut = [0x1d, 0x56, 0x41, 0x10]; // may not work on all printers

  const header = encoder.encode('EZO THERMAL PRINT TEST\n');
  const body = encoder.encode(text + '\n');

  return new Uint8Array([
    ...init,
    ...alignCenter,
    ...header,
    ...alignLeft,
    ...body,
    ...feed,
    ...cut,
  ]);
}

async function writeInChunks(characteristic, bytes, chunkSize = 180) {
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.slice(i, i + chunkSize);
    if (characteristic.writeValueWithoutResponse) {
      await characteristic.writeValueWithoutResponse(chunk);
    } else {
      await characteristic.writeValue(chunk);
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

async function findWritableCharacteristic(server) {
  const services = await server.getPrimaryServices();

  for (const service of services) {
    try {
      const characteristics = await service.getCharacteristics();
      for (const characteristic of characteristics) {
        const props = characteristic.properties;
        if (props.write || props.writeWithoutResponse) {
          return characteristic;
        }
      }
    } catch (error) {
      console.warn('Could not inspect service', service.uuid, error);
    }
  }

  throw new Error('No writable Bluetooth characteristic found. Please check printer UUIDs/manual.');
}

function App() {
  const [status, setStatus] = useState('Not connected');
  const [deviceName, setDeviceName] = useState('');
  const [characteristic, setCharacteristic] = useState(null);
  const [receiptText, setReceiptText] = useState(`FRANZZO / AXINQ TEST RECEIPT\n--------------------------------\nItem: Chicken Biryani\nQty : 1\nRate: 130\nTotal: Rs. 130\n--------------------------------\nThank you!`);

  async function fetchReceipt() {
    try {
      setStatus('Fetching receipt from backend...');
      const response = await fetch(`${API_BASE}/api/receipt`);
      if (!response.ok) throw new Error('Backend API failed');
      const data = await response.json();
      setReceiptText(data.receiptText);
      setStatus('Receipt loaded from backend');
    } catch (error) {
      setStatus(error.message);
    }
  }

  async function connectPrinter() {
    try {
      if (!navigator.bluetooth) {
        throw new Error('Web Bluetooth is not supported in this browser. Use Chrome or Edge.');
      }

      setStatus('Opening Bluetooth device picker...');
      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: [
          '000018f0-0000-1000-8000-00805f9b34fb',
          '0000ff00-0000-1000-8000-00805f9b34fb',
          '0000ffe0-0000-1000-8000-00805f9b34fb',
          '0000fff0-0000-1000-8000-00805f9b34fb',
          '49535343-fe7d-4ae5-8fa9-9fafd205e455'
        ]
      });

      setDeviceName(device.name || 'Unknown printer');
      setStatus('Connecting to GATT server...');

      device.addEventListener('gattserverdisconnected', () => {
        setStatus('Printer disconnected');
        setCharacteristic(null);
      });

      const server = await device.gatt.connect();
      setStatus('Finding writable printer characteristic...');
      const writable = await findWritableCharacteristic(server);

      setCharacteristic(writable);
      setStatus(`Connected: ${device.name || 'Bluetooth printer'}`);
    } catch (error) {
      setStatus(error.message);
    }
  }

  async function printReceipt() {
    try {
      if (!characteristic) throw new Error('Please connect printer first');
      setStatus('Printing...');
      const bytes = textToEscPosBytes(receiptText);
      await writeInChunks(characteristic, bytes);
      setStatus('Print command sent successfully');
    } catch (error) {
      setStatus(error.message);
    }
  }

  return (
    <main className="page">
      <section className="card">
        <h1>EZO Bluetooth Thermal Printer</h1>
        <p className="subtitle">React frontend + Next.js backend demo for ESC/POS thermal printing.</p>

        <div className="status">
          <strong>Status:</strong> {status}
          {deviceName && <span> | <strong>Device:</strong> {deviceName}</span>}
        </div>

        <label htmlFor="receipt">Receipt Text</label>
        <textarea
          id="receipt"
          value={receiptText}
          onChange={(event) => setReceiptText(event.target.value)}
        />

        <div className="actions">
          <button onClick={fetchReceipt}>Fetch Receipt From Backend</button>
          <button onClick={connectPrinter}>Connect Bluetooth Printer</button>
          <button className="primary" onClick={printReceipt}>Print Receipt</button>
        </div>

        <div className="note">
          Use Chrome/Edge on localhost or HTTPS. Select your EZO printer from the Bluetooth popup.
        </div>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
