export default function Home() {
  return (
    <main style={{ fontFamily: 'Arial, sans-serif', padding: 40 }}>
      <h1>EZO Thermal Printer Backend</h1>
      <p>Backend is running.</p>
      <p>Use <code>/api/receipt</code> to get sample receipt text.</p>
      <p>Use <code>/api/print-job</code> to prepare a print payload.</p>
    </main>
  );
}
