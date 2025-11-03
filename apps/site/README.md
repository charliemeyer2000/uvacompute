This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## UVA Compute Site

This Next.js application serves as the web frontend and API gateway for UVA Compute, handling authentication and proxying requests to the VM orchestration service.

## Getting Started

First, set up your environment variables. Create a `.env.local` file:

```bash
# VM Orchestration Service URL
VM_ORCHESTRATION_SERVICE_URL=http://localhost:8080
```

Then, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## API Routes

### VM Management

- `POST /api/vms` - Create a new VM
  - Requires authentication
  - Automatically adds userId from session
  - Proxies to VM orchestration service

- `DELETE /api/vms/[vmId]` - Delete a VM
  - Requires authentication
  - Proxies to VM orchestration service

- `GET /api/vms/[vmId]` - Get VM status
  - Requires authentication
  - Proxies to VM orchestration service

### Authentication

- `POST /api/auth/device/code` - Start device authorization flow
- `POST /api/auth/device/token` - Poll for device token
- `GET /api/auth/session` - Get current session

## Environment Variables

### Required

- `VM_ORCHESTRATION_SERVICE_URL` - URL of the VM orchestration service (default: http://localhost:8080)

### SSH Connection (Optional)

- `SSH2INCUS_HOST` - Hostname for SSH proxy (default: "localhost")
- `SSH2INCUS_PORT` - Port for SSH proxy (default: 2222)

### SSH Access Configuration

The CLI connects to VMs via an SSH proxy (ssh2incus) running on your workstation. To enable public access without requiring Tailscale:

**Using Tailscale Funnel (Recommended):**

```bash
# On workstation, expose SSH via Tailscale Funnel TCP
sudo tailscale funnel --bg --tcp=8443 tcp://localhost:2222

# Then set in your site deployment:
SSH2INCUS_HOST=ai-workstation.tail0eb43d.ts.net
SSH2INCUS_PORT=8443
```

**Alternative (Direct public IP):**
If your workstation has a publicly accessible IP:

```bash
# On workstation, allow port 2222 through firewall
sudo ufw allow 2222/tcp

# Then set in your site deployment:
SSH2INCUS_HOST=your-public-ip-or-hostname
SSH2INCUS_PORT=2222
```

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
