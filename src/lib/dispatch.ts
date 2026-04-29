import type { Post, Subscriber } from '../db';
import { sendBatchGmail } from './smtp';
import { wrapPostInEmail } from './email-template';

type DispatchArgs = {
  env: Env;
  post: Pick<Post, 'title' | 'slug' | 'contentHtml'>;
  subscribers: Pick<Subscriber, 'email'>[];
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
  const recipients = subscribers.map((s) => s.email);
  if (recipients.length === 0) {
    return { provider, sent: 0, failed: 0, status: 'sent' };
  }

  const html = wrapPostInEmail({
    clientName: env.CLIENT_NAME as string,
    clientDomain: env.CLIENT_DOMAIN as string,
    themeColor: env.THEME_PRIMARY_COLOR as string,
    postTitle: post.title,
    postSlug: post.slug,
    postHtml: post.contentHtml,
  });
  const subject = post.title;

  const totals =
    provider === 'RESEND'
      ? await sendViaResend({ env, subject, html, recipients })
      : await sendViaGmail({ env, subject, html, recipients });

  const status: DispatchResult['status'] =
    totals.failed === 0 ? 'sent' : totals.sent === 0 ? 'failed' : 'partial';
  return { provider, ...totals, status };
};

const sendViaResend = async ({
  env,
  subject,
  html,
  recipients,
}: {
  env: Env;
  subject: string;
  html: string;
  recipients: string[];
}): Promise<{ sent: number; failed: number }> => {
  const e = env as unknown as { RESEND_API_KEY?: string };
  if (!e.RESEND_API_KEY) throw new Error('RESEND_API_KEY not set');

  const from = `${env.CLIENT_NAME} <noreply@${env.CLIENT_DOMAIN}>`;

  const results = await Promise.allSettled(
    recipients.map((to) =>
      fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${e.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ from, to, subject, html }),
      }).then(async (res) => {
        if (!res.ok) throw new Error(`resend ${res.status}: ${await res.text()}`);
      }),
    ),
  );
  const failed = results.filter((r) => r.status === 'rejected').length;
  return { sent: recipients.length - failed, failed };
};

const sendViaGmail = async ({
  env,
  subject,
  html,
  recipients,
}: {
  env: Env;
  subject: string;
  html: string;
  recipients: string[];
}): Promise<{ sent: number; failed: number }> => {
  const e = env as unknown as { GMAIL_USER?: string; GMAIL_APP_PASSWORD?: string };
  if (!e.GMAIL_USER || !e.GMAIL_APP_PASSWORD) {
    throw new Error('GMAIL_USER or GMAIL_APP_PASSWORD not set');
  }
  const result = await sendBatchGmail({
    user: e.GMAIL_USER,
    pass: e.GMAIL_APP_PASSWORD,
    fromAddress: e.GMAIL_USER,
    fromName: env.CLIENT_NAME as string,
    recipients,
    subject,
    html,
  });
  return { sent: result.sent, failed: result.failed };
};
