import type { Post, Subscriber } from '../db';
import { sendBatchGmail } from './smtp';
import { wrapPostInEmail } from './email-template';
import { loadSettings, type Settings } from './settings';

type DispatchArgs = {
  env: Env;
  post: Pick<Post, 'title' | 'slug' | 'contentHtml'>;
  subscribers: Pick<Subscriber, 'id' | 'email'>[];
};

export type DispatchResult = {
  provider: 'RESEND' | 'GMAIL';
  sent: number;
  failed: number;
  status: 'sent' | 'partial' | 'failed';
};

export const dispatchCampaign = async ({
  env,
  post,
  subscribers,
}: DispatchArgs): Promise<DispatchResult> => {
  const provider = (env.EMAIL_PROVIDER as string) === 'GMAIL' ? 'GMAIL' : 'RESEND';
  if (subscribers.length === 0) {
    return { provider, sent: 0, failed: 0, status: 'sent' };
  }

  const settings = await loadSettings();

  const totals =
    provider === 'RESEND'
      ? await sendViaResend({ env, settings, post, subscribers })
      : await sendViaGmail({ env, settings, post, subscribers });

  const status: DispatchResult['status'] =
    totals.failed === 0 ? 'sent' : totals.sent === 0 ? 'failed' : 'partial';
  return { provider, ...totals, status };
};

const sendViaResend = async ({
  env,
  settings,
  post,
  subscribers,
}: {
  env: Env;
  settings: Settings;
  post: Pick<Post, 'title' | 'slug' | 'contentHtml'>;
  subscribers: Pick<Subscriber, 'id' | 'email'>[];
}): Promise<{ sent: number; failed: number }> => {
  const e = env as unknown as { RESEND_API_KEY?: string };
  if (!e.RESEND_API_KEY) throw new Error('RESEND_API_KEY not set');

  const clientDomain = env.CLIENT_DOMAIN as string;
  const fromDomain = (env as unknown as { EMAIL_FROM_DOMAIN?: string }).EMAIL_FROM_DOMAIN || clientDomain;
  const local = settings.emailFromLocal.trim() || 'noreply';
  const fromAddress = `${local}@${fromDomain}`;
  const from = `${settings.clientName} <${fromAddress}>`;

  const results = await Promise.allSettled(
    subscribers.map(({ id, email }) => {
      const unsubscribeUrl = `https://${clientDomain}/api/unsubscribe?id=${id}`;
      const { html, text } = wrapPostInEmail({
        clientName: settings.clientName,
        clientDomain,
        themeColor: settings.themePrimaryColor,
        postTitle: post.title,
        postSlug: post.slug,
        postHtml: post.contentHtml,
        unsubscribeUrl,
      });

      return fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${e.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from,
          to: email,
          subject: post.title,
          html,
          text,
          headers: {
            'List-Unsubscribe': `<${unsubscribeUrl}>`,
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          },
        }),
      }).then(async (res) => {
        if (!res.ok) throw new Error(`resend ${res.status}: ${await res.text()}`);
      });
    }),
  );

  const failed = results.filter((r) => r.status === 'rejected').length;
  return { sent: subscribers.length - failed, failed };
};

const sendViaGmail = async ({
  env,
  settings,
  post,
  subscribers,
}: {
  env: Env;
  settings: Settings;
  post: Pick<Post, 'title' | 'slug' | 'contentHtml'>;
  subscribers: Pick<Subscriber, 'id' | 'email'>[];
}): Promise<{ sent: number; failed: number }> => {
  const e = env as unknown as { GMAIL_USER?: string; GMAIL_APP_PASSWORD?: string };
  if (!e.GMAIL_USER || !e.GMAIL_APP_PASSWORD) {
    throw new Error('GMAIL_USER or GMAIL_APP_PASSWORD not set');
  }
  const clientDomain = env.CLIENT_DOMAIN as string;

  // Gmail: send individually so each recipient gets their own unsubscribe URL
  let sent = 0;
  let failed = 0;
  for (const { id, email } of subscribers) {
    const unsubscribeUrl = `https://${clientDomain}/api/unsubscribe?id=${id}`;
    const { html } = wrapPostInEmail({
      clientName: settings.clientName,
      clientDomain,
      themeColor: settings.themePrimaryColor,
      postTitle: post.title,
      postSlug: post.slug,
      postHtml: post.contentHtml,
      unsubscribeUrl,
    });
    try {
      await sendBatchGmail({
        user: e.GMAIL_USER,
        pass: e.GMAIL_APP_PASSWORD,
        fromAddress: e.GMAIL_USER,
        fromName: settings.clientName,
        recipients: [email],
        subject: post.title,
        html,
      });
      sent++;
    } catch {
      failed++;
    }
  }
  return { sent, failed };
};
