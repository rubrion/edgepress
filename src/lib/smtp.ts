import { connect } from 'cloudflare:sockets';

export type SmtpBatchArgs = {
  user: string;
  pass: string;
  fromAddress: string;
  fromName: string;
  recipients: string[];
  subject: string;
  html: string;
};

export type SmtpBatchResult = {
  sent: number;
  failed: number;
  errors: { to: string; error: string }[];
};

const HOST = 'smtp.gmail.com';
const PORT = 465;
const ENCODER = new TextEncoder();
const DECODER = new TextDecoder();

export const sendBatchGmail = async (args: SmtpBatchArgs): Promise<SmtpBatchResult> => {
  const socket = connect(
    { hostname: HOST, port: PORT },
    { secureTransport: 'on', allowHalfOpen: false },
  );
  const writer = socket.writable.getWriter();
  const reader = socket.readable.getReader();

  const session = newSession(reader, writer);
  const result: SmtpBatchResult = { sent: 0, failed: 0, errors: [] };

  try {
    await session.expect('2');
    await session.send(`EHLO edgepress.worker`);
    await session.expect('2');
    await session.send(`AUTH LOGIN`);
    await session.expect('3');
    await session.send(b64(args.user));
    await session.expect('3');
    await session.send(b64(args.pass));
    await session.expect('2');

    const date = new Date().toUTCString();
    const subjectHeader = encodeHeader(args.subject);
    const fromHeader = `${encodeHeader(args.fromName)} <${args.fromAddress}>`;
    const encodedBody = wrap76(b64(args.html));

    for (const to of args.recipients) {
      try {
        await session.send(`MAIL FROM:<${args.fromAddress}>`);
        await session.expect('2');
        await session.send(`RCPT TO:<${to}>`);
        await session.expect('2');
        await session.send(`DATA`);
        await session.expect('3');

        const message =
          `From: ${fromHeader}\r\n` +
          `To: <${to}>\r\n` +
          `Subject: ${subjectHeader}\r\n` +
          `Date: ${date}\r\n` +
          `Message-ID: <${crypto.randomUUID()}@${args.fromAddress.split('@')[1]}>\r\n` +
          `MIME-Version: 1.0\r\n` +
          `Content-Type: text/html; charset=utf-8\r\n` +
          `Content-Transfer-Encoding: base64\r\n` +
          `\r\n` +
          encodedBody;

        await session.sendRaw(message + `\r\n.\r\n`);
        await session.expect('2');
        result.sent += 1;
      } catch (err) {
        result.failed += 1;
        result.errors.push({
          to,
          error: err instanceof Error ? err.message : String(err),
        });
        try {
          await session.send(`RSET`);
          await session.expect('2');
        } catch {
          break;
        }
      }
    }

    try {
      await session.send(`QUIT`);
      await session.expect('2');
    } catch {
      /* server may close before reply */
    }
  } finally {
    try {
      await writer.close();
    } catch {
      /* ignore */
    }
  }

  return result;
};

const newSession = (
  reader: ReadableStreamDefaultReader<Uint8Array>,
  writer: WritableStreamDefaultWriter<Uint8Array>,
) => {
  let buffer = '';

  const fillUntilTerminal = async (): Promise<{ code: number; text: string }> => {
    while (true) {
      const idx = findResponseEnd(buffer);
      if (idx > 0) {
        const text = buffer.slice(0, idx);
        buffer = buffer.slice(idx);
        const m = text.match(/^(\d{3})\s/m);
        const code = m ? Number(m[1]) : 0;
        return { code, text };
      }
      const { value, done } = await reader.read();
      if (done) throw new Error('SMTP socket closed unexpectedly');
      buffer += DECODER.decode(value, { stream: true });
    }
  };

  return {
    send: async (line: string) => {
      await writer.write(ENCODER.encode(line + '\r\n'));
    },
    sendRaw: async (data: string) => {
      await writer.write(ENCODER.encode(data));
    },
    expect: async (codePrefix: string) => {
      const { code, text } = await fillUntilTerminal();
      if (!String(code).startsWith(codePrefix)) {
        throw new Error(`SMTP ${code}: ${text.trim()}`);
      }
      return { code, text };
    },
  };
};

const findResponseEnd = (buf: string): number => {
  let pos = 0;
  while (pos < buf.length) {
    const eol = buf.indexOf('\r\n', pos);
    if (eol === -1) return -1;
    const line = buf.slice(pos, eol);
    if (/^\d{3}\s/.test(line)) return eol + 2;
    pos = eol + 2;
  }
  return -1;
};

const b64 = (s: string): string => {
  const bytes = ENCODER.encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
};

const wrap76 = (s: string): string => s.replace(/(.{76})/g, '$1\r\n');

const encodeHeader = (s: string): string => {
  if (/^[\x20-\x7e]*$/.test(s)) return s;
  return `=?UTF-8?B?${b64(s)}?=`;
};
