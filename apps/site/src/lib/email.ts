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

export async function sendEarlyAccessApprovalEmail({
  email,
  name,
}: {
  email: string;
  name: string;
}) {
  const firstName = name.split(" ")[0];

  await resend.emails.send({
    from: FROM_EMAIL,
    to: email,
    subject: "early access approved - uvacompute",
    text: `Hey ${firstName},

You can now log in and start using the uvacompute CLI and platform. Thanks for being an early adopter.

If you have any questions or need help getting started, just email me personally: charlie@uvacompute.com

- Charlie`,
  });
}

export async function sendWorkloadOfflineEmail({
  email,
  name,
  workloadType,
  workloadName,
  nodeName,
}: {
  email: string;
  name: string;
  workloadType: "VM" | "Job";
  workloadName: string;
  nodeName: string;
}) {
  const firstName = name.split(" ")[0];
  const workloadTypeLower = workloadType.toLowerCase();

  await resend.emails.send({
    from: FROM_EMAIL,
    to: email,
    subject: `${workloadTypeLower} offline - uvacompute`,
    html: `
      <p><b>hey ${firstName},</b></p>
      <p>your ${workloadTypeLower} <b>${workloadName}</b> has been marked as offline because the node (<b>${nodeName}</b>) it was running on became unreachable.</p>
      <p><b>what this means:</b></p>
      <ul>
        <li>the ${workloadTypeLower} may resume if the node comes back online</li>
        <li>if the node stays offline, you may need to recreate your ${workloadTypeLower}</li>
        <li>any unsaved data on the ${workloadTypeLower} may be lost</li>
      </ul>
      <p>you can check the status of your ${workloadTypeLower}s in your <a href="https://uvacompute.com/dashboard">dashboard</a>.</p>
      <p><i>if you have questions, email charlie@uvacompute.com</i></p>
    `,
  });
}
