export async function OPTIONS() {
  return new Response(null, { status: 204 });
}

export async function GET() {
  const now = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

  const receiptText = [
    'AXINQ / EZO PRINT DEMO',
    '--------------------------------',
    `Date: ${now}`,
    'Bill No: AXQ-1001',
    '--------------------------------',
    'Item              Qty   Amount',
    'Chicken Biryani    1    130.00',
    'Al-Faham Half      1    229.00',
    '--------------------------------',
    'Total:                  359.00',
    'Payment: UPI',
    '--------------------------------',
    'Thank you. Visit again!',
    ''
  ].join('\n');

  return Response.json({ receiptText });
}
