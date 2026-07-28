export async function OPTIONS() {
  return new Response(null, { status: 204 });
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const items = Array.isArray(body.items) ? body.items : [];

  const lines = [
    body.title || 'AXINQ RECEIPT',
    '--------------------------------',
    'Item              Qty   Amount',
    ...items.map((item) => {
      const name = String(item.name || 'Item').padEnd(16).slice(0, 16);
      const qty = String(item.qty || 1).padStart(3);
      const amount = Number(item.amount || 0).toFixed(2).padStart(8);
      return `${name} ${qty} ${amount}`;
    }),
    '--------------------------------',
    `Total: ${Number(body.total || 0).toFixed(2)}`,
    'Thank you!',
    ''
  ];

  return Response.json({ receiptText: lines.join('\n') });
}
