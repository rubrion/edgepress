import { sendBatchGmail } from './smtp';
import type { Settings } from './settings';

type SendConfirmArgs = {
  env: unknown;
  settings: Settings;
  to: string;
  confirmUrl: string;
};

const buildBody = ({
  clientName,
  confirmUrl,
  themeColor,
}: {
  clientName: string;
  confirmUrl: string;
  themeColor: string;
}) => {
  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#f5f5f7;font-family:-apple-system,Segoe UI,sans-serif;color:#1a1a1a;">
<div style="max-width:560px;margin:0 auto;padding:32px 16px;">
  <div style="background:#fff;border-radius:12px;padding:32px;border-top:4px solid ${themeColor};">
    <h1 style="margin:0 0 12px;font-size:22px;">Confirm your subscription</h1>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.55;">Click the button below to confirm you want to receive emails from <strong>${escapeHtml(clientName)}</strong>. The link expires in 24 hours.</p>
    <p style="margin:0 0 20px;"><a href="${confirmUrl}" style="display:inline-block;background:${themeColor};color:#fff;padding:11px 20px;border-radius:6px;text-decoration:none;font-weight:600;">Confirm subscription</a></p>
    <p style="margin:0;font-size:13px;color:#666;">Or paste this URL: <br /><span style="word-break:break-all;color:${themeColor};">${confirmUrl}</span></p>
    <p style="margin:24px 0 0;padding-top:18px;border-top:1px solid #eee;font-size:12px;color:#888;">If you did not request this, ignore this email and you will not be subscribed.</p>
  </div>
</div>
</body></html>`;
  const text = [
    `Confirm your subscription to ${clientName}`,
    '',
    `Open this link to confirm (expires in 24 hours):`,
    confirmUrl,
    '',
    `If you did not request this, ignore this email.`,
  ].join('\n');
  return { html, text };
};

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export const sendConfirmationEmail = async ({
  env,
  settings,
  to,
  confirmUrl,
}: SendConfirmArgs): Promise<void> => {
  const e = env as {
    EMAIL_PROVIDER?: string;
    CLIENT_DOMAIN?: string;
    EMAIL_FROM_DOMAIN?: string;
    RESEND_API_KEY?: string;
    GMAIL_USER?: string;
    GMAIL_APP_PASSWORD?: string;
  };
  const provider = e.EMAIL_PROVIDER === 'GMAIL' ? 'GMAIL' : 'RESEND';
  const subject = `Confirm your subscription to ${settings.clientName}`;
  const { html, text } = buildBody({
    clientName: settings.clientName,
    confirmUrl,
    themeColor: settings.themePrimaryColor,
  });

  if (provider === 'RESEND') {
    if (!e.RESEND_API_KEY) throw new Error('RESEND_API_KEY not set');
    const fromDomain = e.EMAIL_FROM_DOMAIN || e.CLIENT_DOMAIN || '';
    const local = settings.emailFromLocal.trim() || 'noreply';
    const fromAddress = `${local}@${fromDomain}`;
    const from = `${settings.clientName} <${fromAddress}>`;
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${e.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to, subject, html, text }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`resend ${res.status}: ${body}`);
    }
    return;
  }

  if (!e.GMAIL_USER || !e.GMAIL_APP_PASSWORD) {
    throw new Error('GMAIL_USER or GMAIL_APP_PASSWORD not set');
  }
  await sendBatchGmail({
    user: e.GMAIL_USER,
    pass: e.GMAIL_APP_PASSWORD,
    fromAddress: e.GMAIL_USER,
    fromName: settings.clientName,
    recipients: [to],
    subject,
    html,
  });
};
