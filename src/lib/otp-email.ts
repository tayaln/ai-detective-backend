import type { OutgoingEmail } from './email.ts';

/** Plain text, short, with the code in the subject so it shows in the inbox list. */
export function signInCodeEmail(to: string, code: string, expiresInMinutes: number): OutgoingEmail {
  return {
    to,
    subject: `${code} is your AI Detective sign-in code`,
    text: [
      'Your AI Detective sign-in code is:',
      '',
      code,
      '',
      `It expires in ${expiresInMinutes} minutes and works once.`,
      '',
      'Never share this code with anyone. We will never ask you for it.',
    ].join('\n'),
  };
}
