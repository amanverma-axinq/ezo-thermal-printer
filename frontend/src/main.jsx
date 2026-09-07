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

async function imageToEscPosBytes(imageFile) {
  const init = [0x1b, 0x40]; // ESC @ initialize
  const feed = [0x0a, 0x0a, 0x0a];
  const cut = [0x1d, 0x56, 0x41, 0x10];

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const printerWidth = 384; // 48mm thermal printer width in pixels (8 dots/mm)
        const maxHeight = 2048;
        
        // Scale image to printer width
        const aspectRatio = img.height / img.width;
        const newHeight = Math.min(Math.ceil(printerWidth * aspectRatio), maxHeight);
        
        // Create canvas and draw resized image
        const canvas = document.createElement('canvas');
        canvas.width = printerWidth;
        canvas.height = newHeight;
        const ctx = canvas.getContext('2d');
        
        // White background
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, printerWidth, newHeight);
        
        const imageData = ctx.getImageData(0, 0, printerWidth, newHeight);
        const data = imageData.data;
        
        // Convert to monochrome and build bit image
        const bytesPerRow = Math.ceil(printerWidth / 8);
        const imageBytes = [];
        
        for (let y = 0; y < newHeight; y++) {
          for (let x = 0; x < bytesPerRow; x++) {
            let byte = 0;
            for (let bit = 0; bit < 8; bit++) {
              const pixelX = x * 8 + bit;
              if (pixelX < printerWidth) {
                const pixelIndex = (y * printerWidth + pixelX) * 4;
                const r = data[pixelIndex];
                const g = data[pixelIndex + 1];
                const b = data[pixelIndex + 2];
                const gray = (r + g + b) / 3;
                // Set bit to 1 if darker than threshold
                if (gray < 128) {
                  byte |= (0x80 >> bit);
                }
              }
            }
            imageBytes.push(byte);
          }
        }
        
        // Use GS v 0 command for raster bit image (more reliable)
        // GS v 0 m xL xH yL yH [image data]
        const xL = bytesPerRow & 0xFF;
        const xH = (bytesPerRow >> 8) & 0xFF;
        const yL = newHeight & 0xFF;
        const yH = (newHeight >> 8) & 0xFF;
        
        // Mode 0 = normal, single-density
        const printImage = [0x1d, 0x76, 0x30, 0x00, xL, xH, yL, yH, ...imageBytes];
        
        const bytes = new Uint8Array([
          ...init,
          ...printImage,
          ...feed,
          ...cut,
        ]);
        
        resolve(bytes);
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(imageFile);
  });
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
  const [selectedImage, setSelectedImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  
  // Bill form state
  const [billForm, setBillForm] = useState({
    companyName: 'SUTAR PETROLEUM',
    location: 'MAAN PHASE-3\nPUNE-411057',
    date: new Date().toISOString().split('T')[0],
    product: 'Product 1',
    nozzleNo: '1',
    rate: '',
    volume: '',
  });

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

  async function handleImageUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    setSelectedImage(file);
    
    // Create preview
    const reader = new FileReader();
    reader.onload = (e) => {
      setImagePreview(e.target.result);
    };
    reader.readAsDataURL(file);
    
    setStatus(`Image selected: ${file.name}`);
  }

  async function printImage() {
    try {
      if (!characteristic) throw new Error('Please connect printer first');
      if (!selectedImage) throw new Error('Please select an image first');
      
      setStatus('Converting image to printer format...');
      const bytes = await imageToEscPosBytes(selectedImage);
      
      setStatus('Printing image...');
      await writeInChunks(characteristic, bytes);
      setStatus('Image printed successfully');
    } catch (error) {
      setStatus(error.message);
    }
  }

  function generateBillText() {
    const rate = parseFloat(billForm.rate) || 0;
    const volume = parseFloat(billForm.volume) || 0;
    const amount = (rate * volume).toFixed(2);

    const dateObj = new Date(billForm.date + 'T00:00:00');
    const timeStr = dateObj.toLocaleTimeString('en-IN', { 
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    const dateStr = dateObj.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    }).toUpperCase();

    return `${billForm.companyName}
${billForm.location}

COPY / DUPLICATE
${'x'.repeat(32)}
${dateStr}         ${timeStr}
TXN NO: N.A.
INVOICE #: 12345

${'x'.repeat(32)}
NOZZLE_NO : ${billForm.nozzleNo}
PRODUCT: ${billForm.product}
DENSITY: 751.9 kg/m3
RATE    : ${parseFloat(billForm.rate).toFixed(2)} INR/Ltr
VOLUME  : ${parseFloat(billForm.volume).toFixed(2)} Ltr
AMOUNT  : ${amount} INR

Thank You! Visit Again!`;
  }

  function handleBillFormChange(field, value) {
    setBillForm(prev => ({ ...prev, [field]: value }));
  }

  async function printBill() {
    try {
      if (!characteristic) throw new Error('Please connect printer first');
      if (!billForm.rate || !billForm.volume) throw new Error('Please fill Rate and Volume');
      
      setStatus('Printing bill...');
      const billText = generateBillText();
      const bytes = textToEscPosBytes(billText);
      await writeInChunks(characteristic, bytes);
      setStatus('Bill printed successfully');
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

        <div className="section">
          <h2>Text Mode</h2>
          <label htmlFor="receipt">Receipt Text</label>
          <textarea
            id="receipt"
            value={receiptText}
            onChange={(event) => setReceiptText(event.target.value)}
          />

          <div className="actions">
            <button onClick={fetchReceipt}>Fetch Receipt From Backend</button>
            <button className="primary" onClick={printReceipt}>Print Receipt</button>
          </div>
        </div>

        <div className="section">
          <h2>Image Mode</h2>
          <label htmlFor="imageUpload">Upload Image to Print</label>
          <input
            id="imageUpload"
            type="file"
            accept="image/*"
            onChange={handleImageUpload}
            className="file-input"
          />

          {imagePreview && (
            <div className="image-preview">
              <p>Preview (actual print may differ):</p>
              <img src={imagePreview} alt="Preview" style={{ maxWidth: '100%', maxHeight: '300px' }} />
            </div>
          )}

          {selectedImage && (
            <p className="file-name">Selected: {selectedImage.name}</p>
          )}

          <div className="actions">
            <button className="primary" onClick={printImage} disabled={!selectedImage}>Print Image</button>
          </div>
        </div>

        <div className="section">
          <h2>Bill Generator</h2>
          <div className="form-grid">
            <div className="form-group">
              <label htmlFor="companyName">Company Name</label>
              <input
                id="companyName"
                type="text"
                value={billForm.companyName}
                onChange={(e) => handleBillFormChange('companyName', e.target.value)}
                placeholder="e.g., SUTAR PETROLEUM"
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="location">Location</label>
              <textarea
                id="location"
                value={billForm.location}
                onChange={(e) => handleBillFormChange('location', e.target.value)}
                placeholder="e.g., MAAN PHASE-3&#10;PUNE-411057"
                rows="2"
              />
            </div>

            <div className="form-group">
              <label htmlFor="date">Date</label>
              <input
                id="date"
                type="date"
                value={billForm.date}
                onChange={(e) => handleBillFormChange('date', e.target.value)}
              />
            </div>

            <div className="form-group">
              <label htmlFor="product">Product</label>
              <input
                id="product"
                type="text"
                value={billForm.product}
                onChange={(e) => handleBillFormChange('product', e.target.value)}
                placeholder="e.g., Product 1"
              />
            </div>

            <div className="form-group">
              <label htmlFor="nozzleNo">Nozzle No</label>
              <input
                id="nozzleNo"
                type="text"
                value={billForm.nozzleNo}
                onChange={(e) => handleBillFormChange('nozzleNo', e.target.value)}
                placeholder="e.g., 1"
              />
            </div>

            <div className="form-group">
              <label htmlFor="rate">Rate (INR/Ltr)</label>
              <input
                id="rate"
                type="number"
                step="0.01"
                value={billForm.rate}
                onChange={(e) => handleBillFormChange('rate', e.target.value)}
                placeholder="e.g., 111.70"
              />
            </div>

            <div className="form-group">
              <label htmlFor="volume">Volume (Ltr)</label>
              <input
                id="volume"
                type="number"
                step="0.01"
                value={billForm.volume}
                onChange={(e) => handleBillFormChange('volume', e.target.value)}
                placeholder="e.g., 3.49"
              />
            </div>

            <div className="form-group">
              <label htmlFor="amount">Amount (Auto-calculated)</label>
              <input
                id="amount"
                type="text"
                value={billForm.rate && billForm.volume ? (parseFloat(billForm.rate) * parseFloat(billForm.volume)).toFixed(2) : '0.00'}
                disabled
                style={{ backgroundColor: '#f0f0f0', cursor: 'not-allowed' }}
              />
            </div>
          </div>

          <div className="bill-preview">
            <h3>Preview:</h3>
            <pre>{generateBillText()}</pre>
          </div>

          <div className="actions">
            <button className="primary" onClick={printBill}>Print Bill</button>
          </div>
        </div>

        <div className="section">
          <h2>Printer Connection</h2>
          <div className="actions">
            <button onClick={connectPrinter}>Connect Bluetooth Printer</button>
          </div>
        </div>

        <div className="note">
          Use Chrome/Edge on localhost or HTTPS. Select your EZO printer from the Bluetooth popup.
        </div>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
