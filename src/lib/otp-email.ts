import type { OutgoingEmail } from './email.ts';

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

/**
 * Short, with the code in the subject so it shows in the inbox list. Sent as HTML so the
 * code can be bold and indented; the plain text (the code indented with spaces) is what
 * the console prints when email stays local.
 */
export function signInCodeEmail(to: string, code: string, expiresInMinutes: number): OutgoingEmail {
  const intro = 'Your AI Detective sign-in code:';
  const lines = [
    `This code expires in ${expiresInMinutes} minutes and can be used once.`,
    "If you didn't try to sign in, you can ignore this email.",
    'Never share this code. AI Detective will never ask you for it.',
  ];
  return {
    to,
    subject: `${code} is your AI Detective sign-in code`,
    text: [intro, `    ${code}`, ...lines].join('\n\n'),
    html: [
      `<p>${escapeHtml(intro)}</p>`,
      `<p style="padding-left:24px"><strong>${escapeHtml(code)}</strong></p>`,
      ...lines.map((line) => `<p>${escapeHtml(line)}</p>`),
    ].join('\n'),
  };
}
