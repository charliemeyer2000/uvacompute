"use server";

import { Resend } from "resend";
import { fetchMutation } from "convex/nextjs";
import { api } from "../../../../../convex/_generated/api";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function submitEarlyAccess({
  email,
  reason,
}: {
  email: string;
  reason: string;
}) {
  try {
    const tokens = await fetchMutation(api.earlyAccessTokens.createTokens, {
      email,
      reason,
    });

    const siteUrl = process.env.SITE_URL || "http://localhost:3000";
    const approveUrl = `${siteUrl}/api/early-access/approve?token=${tokens.approveToken}`;
    const denyUrl = `${siteUrl}/api/early-access/deny?token=${tokens.denyToken}`;

    await resend.emails.send({
      from: "uvacompute <noreply@notifications.uvacompute.com>",
      to: "charlie@charliemeyer.xyz",
      replyTo: email,
      subject: "new early access request - uvacompute",
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <style>
              body {
                font-family: 'Courier New', monospace;
                background-color: #ffffff;
                color: #000000;
                padding: 40px 20px;
                margin: 0;
              }
              .container {
                max-width: 600px;
                margin: 0 auto;
              }
              h1 {
                font-size: 24px;
                font-weight: 400;
                margin-bottom: 24px;
                text-transform: lowercase;
              }
              p {
                font-size: 14px;
                line-height: 1.6;
                margin-bottom: 16px;
                color: #000000;
              }
              .info-box {
                background-color: #f5f5f5;
                border: 1px solid #e5e5e5;
                padding: 16px;
                margin: 16px 0;
              }
              .label {
                font-size: 12px;
                color: #737373;
                text-transform: lowercase;
                margin-bottom: 4px;
              }
              .value {
                font-size: 14px;
                color: #000000;
                word-break: break-word;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>new early access request</h1>
              <p>someone has requested early access to uvacompute.</p>
              
              <div class="info-box">
                <div class="label">email address</div>
                <div class="value">${email}</div>
              </div>
              
              <div class="info-box">
                <div class="label">reason for interest</div>
                <div class="value">${reason}</div>
              </div>
              
              <div style="margin-top: 24px; display: flex; gap: 12px;">
                <a href="${approveUrl}" style="flex: 1; display: inline-block; background-color: #22c55e; color: #ffffff; text-decoration: none; padding: 12px 24px; border: 1px solid #000000; text-transform: lowercase; font-family: 'Courier New', monospace; text-align: center;">
                  approve access
                </a>
                <a href="${denyUrl}" style="flex: 1; display: inline-block; background-color: #ef4444; color: #ffffff; text-decoration: none; padding: 12px 24px; border: 1px solid #000000; text-transform: lowercase; font-family: 'Courier New', monospace; text-align: center;">
                  deny request
                </a>
              </div>
              
              <p style="margin-top: 24px; color: #737373; font-size: 12px;">
                you can reply directly to this email to respond to ${email}
              </p>
            </div>
          </body>
        </html>
      `,
    });

    return { success: true };
  } catch (error) {
    console.error("Failed to send early access email:", error);
    throw new Error("failed to submit early access request. please try again.");
  }
}
