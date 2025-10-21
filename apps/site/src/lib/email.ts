import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY!);

const FROM_EMAIL = "uvacompute <noreply@notifications.uvacompute.com>";

export async function sendVerificationEmail({
  email,
  url,
  name,
}: {
  email: string;
  url: string;
  name: string;
}) {
  const firstName = name.split(" ")[0];

  await resend.emails.send({
    from: FROM_EMAIL,
    to: email,
    subject: "verify your email - uvacompute",
    html: `
      <p><b>welcome to uvacompute, ${firstName}!</b></p>
      <p>please verify your email address to start using your account.</p>
      <p>verify your email: <a href="${url}">${url}</a></p>
      <p><i>if you didn't create an account with uvacompute, you can safely ignore this email.</i></p>
    `,
  });
}

export async function sendPasswordResetEmail({
  email,
  url,
  name,
}: {
  email: string;
  url: string;
  name: string;
}) {
  const firstName = name.split(" ")[0];

  await resend.emails.send({
    from: FROM_EMAIL,
    to: email,
    subject: "reset your password - uvacompute",
    html: `
      <p><b>reset your password, ${firstName}</b></p>
      <p>we received a request to reset your password for your uvacompute account.</p>
      <p>reset your password: <a href="${url}">${url}</a></p>
      <p><b>this link will expire in 1 hour for security reasons.</b></p>
      <p><i>if you didn't request a password reset, you can safely ignore this email. your password will not be changed.</i></p>
    `,
  });
}
