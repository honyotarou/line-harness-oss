type LandingEnv = {
  LANDING_VARIANT?: string;
  LANDING_TITLE?: string;
  LANDING_SUBTITLE?: string;
  LANDING_BUTTON_TEXT?: string;
  LANDING_NOTE_HTML?: string;
  LANDING_BADGE_TEXT?: string;
  LANDING_QR_TITLE?: string;
  LANDING_QR_SUBTITLE?: string;
  LANDING_QR_HINT_HTML?: string;
};

function resolveVariant(env: LandingEnv): 'default' | 'custom' {
  return (env.LANDING_VARIANT ?? '').toLowerCase() === 'custom' ? 'custom' : 'default';
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * For a few fields we intentionally allow HTML (line breaks).
 * Keep it small and limited to trusted admin-provided values (Worker vars).
 */
function allowSimpleHtml(value: string | undefined, fallback: string): string {
  const v = (value ?? '').trim();
  return v === '' ? fallback : v;
}

export function renderShortLinkLanding(env: LandingEnv, target: string): string {
  const variant = resolveVariant(env);
  if (variant === 'default') {
    // Preserve current OSS default as-is.
    return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>LINE Harness</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Hiragino Sans',system-ui,sans-serif;background:#0d1117;color:#fff;display:flex;justify-content:center;align-items:center;min-height:100vh}
.card{text-align:center;max-width:400px;width:90%;padding:48px 24px}
h1{font-size:28px;font-weight:800;margin-bottom:8px}
.sub{font-size:14px;color:rgba(255,255,255,0.5);margin-bottom:40px}
.btn{display:block;width:100%;padding:18px;border:none;border-radius:12px;font-size:18px;font-weight:700;text-decoration:none;text-align:center;color:#fff;background:#06C755;transition:opacity .15s}
.btn:active{opacity:.85}
.note{font-size:12px;color:rgba(255,255,255,0.3);margin-top:24px;line-height:1.6}
</style>
</head>
<body>
<div class="card">
<h1>LINE Harness</h1>
<p class="sub">L社 / U社 の無料代替 OSS</p>
<a href="${target}" class="btn">LINE で体験する</a>
<p class="note">友だち追加するだけで<br>ステップ配信・フォーム・自動返信を体験できます</p>
</div>
</body>
</html>`;
  }

  const title = escapeHtml((env.LANDING_TITLE ?? '').trim() || 'LINE Harness');
  const subtitle = escapeHtml((env.LANDING_SUBTITLE ?? '').trim() || 'LINE 公式アカウントのCRM');
  const buttonText = escapeHtml((env.LANDING_BUTTON_TEXT ?? '').trim() || 'LINE で友だち追加');
  const noteHtml = allowSimpleHtml(
    env.LANDING_NOTE_HTML,
    '友だち追加するだけで<br>ステップ配信・フォーム・自動返信を体験できます',
  );

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Hiragino Sans',system-ui,sans-serif;background:#0d1117;color:#fff;display:flex;justify-content:center;align-items:center;min-height:100vh}
.card{text-align:center;max-width:420px;width:92%;padding:52px 24px}
h1{font-size:30px;font-weight:900;margin-bottom:10px;letter-spacing:.01em}
.sub{font-size:14px;color:rgba(255,255,255,0.55);margin-bottom:42px}
.btn{display:block;width:100%;padding:18px;border:none;border-radius:14px;font-size:18px;font-weight:800;text-decoration:none;text-align:center;color:#0d1117;background:#06C755;transition:transform .08s ease,opacity .15s}
.btn:active{opacity:.9;transform:translateY(1px)}
.note{font-size:12px;color:rgba(255,255,255,0.35);margin-top:24px;line-height:1.7}
</style>
</head>
<body>
<div class="card">
<h1>${title}</h1>
<p class="sub">${subtitle}</p>
<a href="${target}" class="btn">${buttonText}</a>
<p class="note">${noteHtml}</p>
</div>
</body>
</html>`;
}

export function renderAuthQrPage(env: LandingEnv, scanTarget: string): string {
  const variant = resolveVariant(env);
  if (variant === 'default') {
    // Preserve current OSS default as-is.
    return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>LINE で友だち追加</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Hiragino Sans', system-ui, sans-serif; background: #0d1117; color: #fff; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
    .card { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 24px; padding: 48px; text-align: center; max-width: 480px; width: 90%; }
    h1 { font-size: 24px; font-weight: 800; margin-bottom: 8px; }
    .sub { font-size: 14px; color: rgba(255,255,255,0.5); margin-bottom: 32px; }
    .qr { background: #fff; border-radius: 16px; padding: 24px; display: inline-block; margin-bottom: 24px; }
    .qr img { display: block; width: 240px; height: 240px; }
    .hint { font-size: 13px; color: rgba(255,255,255,0.4); line-height: 1.6; }
    .badge { display: inline-block; margin-top: 24px; padding: 8px 20px; border-radius: 20px; font-size: 12px; font-weight: 600; color: #06C755; background: rgba(6,199,85,0.1); border: 1px solid rgba(6,199,85,0.2); }
  </style>
</head>
<body>
  <div class="card">
    <h1>LINE Harness を体験</h1>
    <p class="sub">スマートフォンで QR コードを読み取ってください</p>
    <div class="qr">
      <img src="https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(
        scanTarget,
      )}" alt="QR Code">
    </div>
    <p class="hint">LINE アプリのカメラまたは<br>スマートフォンのカメラで読み取れます</p>
    <div class="badge">LINE Harness OSS</div>
  </div>
</body>
</html>`;
  }

  const qrTitle = escapeHtml((env.LANDING_QR_TITLE ?? '').trim() || 'LINE で友だち追加');
  const qrSubtitle = escapeHtml(
    (env.LANDING_QR_SUBTITLE ?? '').trim() || 'スマートフォンで QR コードを読み取ってください',
  );
  const qrHintHtml = allowSimpleHtml(
    env.LANDING_QR_HINT_HTML,
    'LINE アプリのカメラまたは<br>スマートフォンのカメラで読み取れます',
  );
  const badge = escapeHtml((env.LANDING_BADGE_TEXT ?? '').trim() || 'Powered by LINE Harness');

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${qrTitle}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Hiragino Sans', system-ui, sans-serif; background: #0d1117; color: #fff; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
    .card { background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); border-radius: 24px; padding: 52px; text-align: center; max-width: 520px; width: 92%; }
    h1 { font-size: 26px; font-weight: 900; margin-bottom: 10px; letter-spacing: .01em; }
    .sub { font-size: 14px; color: rgba(255,255,255,0.55); margin-bottom: 34px; }
    .qr { background: #fff; border-radius: 16px; padding: 22px; display: inline-block; margin-bottom: 22px; }
    .qr img { display: block; width: 240px; height: 240px; }
    .hint { font-size: 13px; color: rgba(255,255,255,0.42); line-height: 1.7; }
    .badge { display: inline-block; margin-top: 22px; padding: 8px 18px; border-radius: 999px; font-size: 12px; font-weight: 700; color: #06C755; background: rgba(6,199,85,0.10); border: 1px solid rgba(6,199,85,0.22); }
  </style>
</head>
<body>
  <div class="card">
    <h1>${qrTitle}</h1>
    <p class="sub">${qrSubtitle}</p>
    <div class="qr">
      <img src="https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(
        scanTarget,
      )}" alt="QR Code">
    </div>
    <p class="hint">${qrHintHtml}</p>
    <div class="badge">${badge}</div>
  </div>
</body>
</html>`;
}
