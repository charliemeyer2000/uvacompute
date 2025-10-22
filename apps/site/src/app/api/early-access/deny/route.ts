import { NextRequest, NextResponse } from "next/server";
import { fetchMutation } from "convex/nextjs";
import { api } from "../../../../../convex/_generated/api";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const token = searchParams.get("token");

  if (!token) {
    return new NextResponse(
      `
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
              min-height: 100vh;
              display: flex;
              align-items: center;
              justify-content: center;
            }
            .container {
              max-width: 600px;
              margin: 0 auto;
              text-align: center;
            }
            h1 {
              font-size: 24px;
              font-weight: 400;
              margin-bottom: 16px;
              text-transform: lowercase;
            }
            p {
              font-size: 14px;
              line-height: 1.6;
              color: #737373;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>invalid request</h1>
            <p>no token provided</p>
          </div>
        </body>
      </html>
      `,
      {
        status: 400,
        headers: { "Content-Type": "text/html" },
      },
    );
  }

  try {
    const result = await fetchMutation(api.earlyAccessTokens.denyByToken, {
      token,
    });

    if (!result.success) {
      return new NextResponse(
        `
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
                min-height: 100vh;
                display: flex;
                align-items: center;
                justify-content: center;
              }
              .container {
                max-width: 600px;
                margin: 0 auto;
                text-align: center;
              }
              h1 {
                font-size: 24px;
                font-weight: 400;
                margin-bottom: 16px;
                text-transform: lowercase;
                color: #ef4444;
              }
              p {
                font-size: 14px;
                line-height: 1.6;
                color: #737373;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>denial failed</h1>
              <p>${result.error}</p>
            </div>
          </body>
        </html>
        `,
        {
          status: 400,
          headers: { "Content-Type": "text/html" },
        },
      );
    }

    return new NextResponse(
      `
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
              min-height: 100vh;
              display: flex;
              align-items: center;
              justify-content: center;
            }
            .container {
              max-width: 600px;
              margin: 0 auto;
              text-align: center;
            }
            h1 {
              font-size: 24px;
              font-weight: 400;
              margin-bottom: 16px;
              text-transform: lowercase;
            }
            p {
              font-size: 14px;
              line-height: 1.6;
              color: #737373;
            }
            .email {
              font-weight: 600;
              color: #000000;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>request denied</h1>
            <p>early access request from <span class="email">${result.email}</span> has been denied.</p>
          </div>
        </body>
      </html>
      `,
      {
        status: 200,
        headers: { "Content-Type": "text/html" },
      },
    );
  } catch (error) {
    return new NextResponse(
      `
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
              min-height: 100vh;
              display: flex;
              align-items: center;
              justify-content: center;
            }
            .container {
              max-width: 600px;
              margin: 0 auto;
              text-align: center;
            }
            h1 {
              font-size: 24px;
              font-weight: 400;
              margin-bottom: 16px;
              text-transform: lowercase;
              color: #ef4444;
            }
            p {
              font-size: 14px;
              line-height: 1.6;
              color: #737373;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>error</h1>
            <p>an unexpected error occurred</p>
          </div>
        </body>
      </html>
      `,
      {
        status: 500,
        headers: { "Content-Type": "text/html" },
      },
    );
  }
}
