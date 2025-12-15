import { NextResponse } from 'next/server';

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = String(body?.email || '').trim();

    if (!isValidEmail(email)) {
      return NextResponse.json({ error: 'Invalid email.' }, { status: 400 });
    }

    const webhookUrl = process.env.PREBETA_APPS_SCRIPT_WEBHOOK_URL;
    if (!webhookUrl) {
      return NextResponse.json(
        {
          error:
            'Server not configured. Set PREBETA_APPS_SCRIPT_WEBHOOK_URL in .env.local to point to your Google Apps Script web app.',
        },
        { status: 500 }
      );
    }

    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        userAgent: req.headers.get('user-agent') || '',
        ts: new Date().toISOString(),
      }),
      // avoid hanging forever
      signal: AbortSignal.timeout(8000),
    }).catch((e) => {
      throw new Error(`Webhook request failed: ${e instanceof Error ? e.message : String(e)}`);
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return NextResponse.json(
        { error: `Signup webhook returned ${res.status}. ${text}`.trim() },
        { status: 502 }
      );
    }

    // IMPORTANT:
    // Apps Script endpoints can return 200 with an HTML error page (Drive/login) depending on deployment settings.
    // We must validate that the response is actually JSON and contains { ok: true }.
    const contentType = res.headers.get('content-type') || '';
    const text = await res.text().catch(() => '');

    if (!contentType.includes('application/json')) {
      return NextResponse.json(
        {
          error:
            'Signup webhook did not return JSON. Your Apps Script web app is likely not deployed as a public Web App (Execute as: Me, Access: Anyone).',
          debug: text.slice(0, 300),
        },
        { status: 502 }
      );
    }

    let parsed: any = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      return NextResponse.json(
        { error: 'Signup webhook returned invalid JSON.', debug: text.slice(0, 300) },
        { status: 502 }
      );
    }

    if (!parsed?.ok) {
      return NextResponse.json(
        { error: parsed?.error || 'Signup webhook returned ok=false.' },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
