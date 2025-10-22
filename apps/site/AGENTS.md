# uvacompute Developer Guide

**Target Audience**: AI agents and developers working on the uvacompute site codebase.

## Stack Overview

### Frontend

- **Next.js 15** (App Router) - React framework with file-based routing
- **TypeScript** (strict mode) - Type-safe development
- **Tailwind CSS** - Utility-first styling
- **Shadcn UI** - Customized component library
- **TanStack Form + Zod** - Type-safe form handling and validation
- **Sonner** - Toast notifications
- **Lucide React** - Icon library

### Backend

- **Convex** - Backend-as-a-service with real-time database and serverless functions
- **Better Auth** - Authentication with Convex adapter
- **Resend** - Transactional email service

### Package Manager

- **pnpm** - Fast, efficient package manager

## Architecture

### Project Structure

```
apps/site/src/
├── app/[flags]/              # Feature-flagged routes
│   ├── (protected)/          # Auth-protected pages
│   │   ├── _components/      # Shared protected components
│   │   ├── dashboard/
│   │   └── profile/
│   ├── login/
│   ├── signup/
│   ├── verify-email/
│   ├── forgot-password/
│   └── reset-password/
├── components/ui/            # Reusable UI components
├── lib/                      # Utilities and helpers
└── docs/                     # Documentation

apps/site/convex/
├── schema.ts                 # Database schema
├── auth.ts                   # Better Auth configuration
├── http.ts                   # HTTP endpoints
└── [feature].ts              # Feature-specific functions
```

### Naming Conventions

- **Files**: kebab-case (`vm-list.tsx`, `login-schema.ts`)
- **Components**: PascalCase (`VMList`, `ActiveVMs`)
- **Variables**: camelCase (`handleSubmit`, `isInvalid`)
- **Constants**: UPPER_SNAKE_CASE (`ITEMS_PER_PAGE`)
- **Private directories**: Underscore prefix (`_components/`, `_schemas/`)

## Authentication System

### How It Works

uvacompute uses Better Auth with Convex using a **local install** approach. This gives full control over the auth schema and allows custom fields.

**Email/Password Sign-up**:

1. User fills form (name, email, password)
2. `authClient.signUp.email()` is called
3. Better Auth creates user record in `convex/betterAuth/user` table, hashes password, creates session
4. Email verification required (enforced in protected layout)
5. User redirected to `/verify-email` with resend option

**OAuth Sign-in** (Google/GitHub):

1. User clicks social button → redirects to provider
2. After authorization, Better Auth retrieves profile data
3. User record created/updated with name, email, picture
4. Session created (email pre-verified for OAuth)
5. User redirected to `/dashboard`

**Email Verification**:

- Required for email/password users
- Emails sent via Resend from `noreply@notifications.uvacompute.com`
- Verification link → Better Auth API → redirects to `/verify-email`
- Protected layout checks `user.emailVerified` and redirects unverified users

**Password Reset**:

1. User requests reset at `/forgot-password`
2. Email sent with token (expires in 1 hour)
3. User clicks link → `/reset-password?token=...`
4. New password submitted → account updated

### Local Install Architecture

Better Auth is installed as a **local Convex component** at `convex/betterAuth/`:

- `convex/betterAuth/convex.config.ts` - Component definition
- `convex/betterAuth/schema.ts` - Auto-generated Better Auth schema
- `convex/betterAuth/adapter.ts` - Database adapter functions
- `convex/betterAuth/auth.ts` - Static auth export for CLI
- `convex/betterAuth/currentUser.ts` - User retrieval helpers
- `convex/betterAuth/userHelpers.ts` - Type-safe user mutations/queries

Schema is generated via:

```bash
cd convex/betterAuth
npx @better-auth/cli generate -y
```

### Accessing User Data

**Frontend (Better Auth Session)**:

```tsx
import { authClient } from "@/lib/auth-client";

const { data: session } = authClient.useSession();
const userName = session?.user?.name;
const userEmail = session?.user?.email;
```

**Frontend (Convex Queries)**:

```tsx
import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";

// No token passing needed - auth is automatic via ctx.auth
const user = useQuery(api.auth.getCurrentUser);
```

**Backend (Convex Queries/Mutations)**:

```tsx
import { query } from "./_generated/server";
import { v } from "convex/values";
import { authComponent } from "./auth";

export const myQuery = query({
  args: {}, // No token parameter needed
  handler: async (ctx, args) => {
    // Get authenticated user via ctx.auth
    const user = await authComponent.getAuthUser(ctx);

    if (!user) {
      throw new Error("Unauthenticated");
    }

    // Use user._id, user.email, etc.
    return user;
  },
});
```

### Critical Implementation Notes

⚠️ **Standard Authentication Pattern - Use `authComponent` methods**:

**For queries/mutations that need authentication:**

```tsx
import { query } from "./_generated/server";
import { authComponent } from "./auth";

export const myQuery = query({
  args: {},
  handler: async (ctx) => {
    // Get authenticated user (throws error if not authenticated)
    const user = await authComponent.getAuthUser(ctx);
    if (!user) throw new Error("Unauthenticated");

    // Access user._id, user.email, user.hasEarlyAccess, etc.
    return await ctx.db
      .query("vms")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
  },
});
```

**For queries that handle both logged-in and logged-out states:**

```tsx
import { query } from "./_generated/server";
import { authComponent } from "./auth";

export const myQuery = query({
  args: {},
  handler: async (ctx) => {
    // Returns user or null (doesn't throw error)
    const user = await authComponent.safeGetAuthUser(ctx);

    if (!user) {
      return { message: "Please log in" };
    }

    return { message: `Hello ${user.name}` };
  },
});
```

**Key Points:**

- **Always** use `authComponent.getAuthUser(ctx)` for protected queries/mutations
- Use `authComponent.safeGetAuthUser(ctx)` for `getCurrentUser` or public-facing queries
- **Never** pass `userId` as an argument - it's a security vulnerability!
- User ID is accessed via `user._id` from the authenticated user object
- Custom fields like `hasEarlyAccess` are available on the user object
- No manual token passing is required - Better Auth handles this automatically

### User Table Schema

Better Auth manages the `user` table in `convex/betterAuth/schema.ts`:

- **Core fields**: `name`, `email`, `emailVerified`, `image`
- **Timestamps**: `createdAt`, `updatedAt`
- **Custom fields**: `hasEarlyAccess` (boolean, for early access system)
- **System fields**: `_id`, `_creationTime` (auto-added by Convex)

### Adding Custom User Fields

1. Update `convex/auth.ts`:

```tsx
export const createAuth = (ctx, { optionsOnly } = { optionsOnly: false }) =>
  betterAuth({
    // ...
    user: {
      additionalFields: {
        myCustomField: {
          type: "string",
          defaultValue: "default",
        },
      },
    },
    // ...
  });
```

2. Regenerate schema:

```bash
cd convex/betterAuth
npx @better-auth/cli generate -y
```

3. Access in queries:

```tsx
import { authComponent } from "./auth";

const user = await authComponent.getAuthUser(ctx);
console.log(user.myCustomField);
```

### Common Auth Issues & Solutions

**Issue**: "Unauthenticated" errors in Convex functions

- **Cause**: Missing `convex/auth.config.ts` or `expectAuth: true` in ConvexReactClient
- **Solution**:
  1. Ensure `convex/auth.config.ts` exists with Better Auth JWT provider configuration
  2. Verify `expectAuth: true` is set in `src/providers/convexClientProvider.tsx`
  3. Use either `ctx.auth.getUserIdentity()` or `authComponent.getAuthUser(ctx)` for auth checks

**Issue**: User data not loading on protected pages

- **Cause**: Not using the proper auth method or missing `expectAuth: true` in ConvexReactClient
- **Solution**: Verify `expectAuth: true` is set in `convexClientProvider.tsx` and use `authComponent.getAuthUser(ctx)` in backend

**Issue**: Schema changes not reflected in queries

- **Cause**: Need to regenerate Better Auth schema
- **Solution**: Run `cd convex/betterAuth && npx @better-auth/cli generate -y`

### Critical Gotchas

⚠️ **Use `authComponent` methods consistently**

- Always use `authComponent.getAuthUser(ctx)` for authentication
- Never pass `userId` as an argument - get it from the authenticated user
- Use `authComponent.safeGetAuthUser(ctx)` for public queries that can handle logged-out users

⚠️ **Set `expectAuth: true` in ConvexReactClient**

- This ensures queries wait for authentication before running
- Located in `src/providers/convexClientProvider.tsx`

⚠️ **Regenerate schema after adding custom fields**

- Changes to `user.additionalFields` in `convex/auth.ts` require schema regeneration
- Run: `cd convex/betterAuth && npx @better-auth/cli generate -y`
- Restart Convex dev server after regeneration

⚠️ **Component functions are isolated**

- Functions in `convex/betterAuth/` can only be called via `ctx.runQuery/ctx.runMutation`
- Cannot be called directly from frontend
- Must go through parent app queries/mutations

## Design Language

### Core Principles

- **Minimalist aesthetic** - Clean, simple, functional
- **Monospace typography** - All text uses `font-mono`
- **Lowercase preferred** - UI text, labels, buttons all lowercase
- **Sharp edges** - No rounded corners on any elements
- **Limited color palette** - Black, white, gray, orange accent

### Color Palette

```css
Black:  #000000  /* Primary text, borders, buttons */
White:  #FFFFFF  /* Backgrounds, button text */
Gray:   #gray-300, #gray-500, #gray-800  /* Secondary elements */
Orange: orange-accent  /* Links, CTAs, highlights */
Red:    #red-600  /* Error states */
```

### Component Styling

**Buttons**: No rounded corners, monospace font, black/white/outline variants
**Inputs**: Sharp borders, `border-gray-300` default, `border-black` on focus, `border-red-600` on error
**Borders**: 1px solid, no border-radius
**Shadows**: Minimal or none, use simple borders instead
**Focus states**: Simple border color change (no complex rings)

### Visual Feedback

- **Validation errors**: Red borders via `aria-invalid`, toast notifications (no inline error text)
- **Loading states**: Text changes ("sign in" → "signing in..."), skeleton components
- **Hover states**: Border/background color changes, no shadows

## Coding Best Practices

### Component Structure

```tsx
"use client";

// 1. Imports (grouped: React → Next.js → Third-party → Internal → Local)
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "@tanstack/react-form";
import { Button } from "@/components/ui/button";
import { schema } from "./_schemas/schema";

// 2. Component
export default function Component() {
  // Hooks first
  const router = useRouter();
  const [state, setState] = useState();

  // Handlers
  const handleAction = async () => { /* ... */ };

  // Render
  return ( /* JSX */ );
}
```

### Forms: TanStack + Zod Pattern

**1. Define Schema** (`_schemas/form-schema.ts`):

```tsx
import { z } from "zod";

export const formSchema = z.object({
  email: z.string().min(1, "please enter your email").email("invalid email"),
  password: z.string().min(8, "password must be at least 8 characters"),
});

export type FormData = z.infer<typeof formSchema>;
```

**2. Setup Form**:

```tsx
const form = useForm({
  defaultValues: { email: "", password: "" },
  validators: { onSubmit: formSchema },
  onSubmit: async ({ value }) => {
    // Submit logic
  },
  onSubmitInvalid: ({ formApi }) => {
    const firstError = Object.values(formApi.state.fieldMeta).find(
      (field) => field.errors.length > 0,
    )?.errors[0];
    const message =
      typeof firstError === "string" ? firstError : firstError?.message;
    if (message) toast.error("validation error", { description: message });
  },
});
```

**3. Build Form**:

```tsx
<form
  onSubmit={(e) => {
    e.preventDefault();
    form.handleSubmit();
  }}
  noValidate
>
  <form.Field
    name="email"
    children={(field) => (
      <Field>
        <FieldLabel htmlFor={field.name}>email address</FieldLabel>
        <Input
          id={field.name}
          name={field.name}
          value={field.state.value}
          onBlur={field.handleBlur}
          onChange={(e) => field.handleChange(e.target.value)}
          aria-invalid={!field.state.meta.isValid}
          autoComplete="email"
        />
      </Field>
    )}
  />
  <Button type="submit" disabled={form.state.isSubmitting}>
    {form.state.isSubmitting ? "submitting..." : "submit"}
  </Button>
</form>
```

### Error Handling

```tsx
// Success
toast.success("action completed", { description: "details" });

// Error
toast.error("action failed", { description: error.message });

// Try-catch pattern
try {
  await operation();
  toast.success("success");
} catch (error) {
  toast.error("failed", {
    description: error instanceof Error ? error.message : "unknown error",
  });
}
```

### State Management Rules

**useEffect - Use Sparingly!**
✅ Good use cases:

- Subscribing to external systems (WebSocket, browser APIs)
- Cleanup on unmount
- Syncing with non-React APIs

❌ Anti-patterns (don't use useEffect for):

- **Redirects** - Handle in auth callbacks instead
- **Data fetching** - Use Suspense + Convex queries
- **Data transformations** - Do in render or useMemo
- **Event handlers** - Use event handlers directly

**Example: Auth Redirects**

```tsx
// ❌ Bad
useEffect(() => {
  if (session) router.push("/dashboard");
}, [session]);

// ✅ Good
await authClient.signIn.email(
  { email, password },
  {
    onSuccess: () => router.push("/dashboard"),
  },
);
```

**Example: Session-based Redirects**

```tsx
// ✅ Only use useEffect for checking existing session state
const { data: session, isPending } = authClient.useSession();

useEffect(() => {
  if (!isPending && session) {
    if (session.user.emailVerified) {
      router.push("/dashboard");
    } else {
      router.push(
        `/verify-email?email=${encodeURIComponent(session.user.email)}`,
      );
    }
  }
}, [isPending, session, router]);
```

### Data Fetching with Suspense

**Always use Suspense for loading states:**

```tsx
// ✅ Good - declarative loading
<Suspense fallback={<SkeletonLoader />}>
  <DataComponent />
</Suspense>;

// Component fetches data directly
function DataComponent() {
  const data = useQuery(api.module.fn, { arg: value });
  if (data === undefined) return null; // Suspense handles this
  return <Display data={data} />;
}

// ❌ Bad - manual loading state with useEffect
const [data, setData] = useState(null);
const [loading, setLoading] = useState(true);
useEffect(() => {
  fetchData().then((d) => {
    setData(d);
    setLoading(false);
  });
}, []);
```

### Component Reuse

**Always reuse existing components - don't recreate:**

- Next.js `Link` for navigation (never `<a>`)
- Shadcn UI: Button, Input, Skeleton, etc.
- Lucide Icons: Eye, EyeOff, X, ArrowLeft, etc.
- Field components: Field, FieldLabel, FieldDescription

**Composition over creation:**

```tsx
// ✅ Compose existing components
<Button variant="outline" asChild>
  <Link href="/signup">sign up</Link>
</Button>

// ❌ Don't recreate
<a href="/signup" className="...">sign up</a>
```

## Convex Patterns

### Schema Definition

```tsx
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  vms: defineTable({
    userId: v.string(),
    name: v.optional(v.string()),
    status: v.union(v.literal("running"), v.literal("stopped")),
  })
    .index("by_user", ["userId"])
    .index("by_user_and_status", ["userId", "status"]),
});
```

### Query/Mutation Syntax

```tsx
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const getUser = query({
  args: { userId: v.id("users") },
  returns: v.union(
    v.object({
      /* ... */
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    return await ctx.db.get(args.userId);
  },
});

export const updateVM = mutation({
  args: { vmId: v.id("vms"), status: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.vmId, { status: args.status });
    return null;
  },
});
```

### Key Rules

- Always include `args` and `returns` validators
- Use `v.null()` for functions that don't return values
- Use indexes instead of `.filter()` for queries
- Prefix internal functions with `internal` from `./_generated/server`

## Common Anti-Patterns to Avoid

### ❌ Don't

- Use `useEffect` for redirects (handle in callbacks)
- Use `useEffect` for data fetching (use Suspense)
- Use `alert()` or `confirm()` (use toast)
- Create custom implementations (reuse components)
- Show inline error messages (use toast + aria-invalid)
- Use rounded corners or complex shadows
- Mix uppercase/lowercase in UI text
- Ignore TypeScript errors
- Use `any` type

### ✅ Do

- Handle redirects in callbacks
- Use Suspense for loading states
- Use toast for all notifications
- Reuse Button, Input, Field, Skeleton, Link
- Show errors via toast + red borders
- Use sharp edges, simple borders
- Use lowercase for all UI text
- Fix TypeScript errors immediately
- Type everything properly

## File Organization Best Practices

### When to Create Files

- **Page components**: In `app/[flags]/[route]/page.tsx`
- **Page-specific components**: In `[route]/_components/`
- **Schemas**: In `[route]/_schemas/`
- **Shared UI**: In `components/ui/`
- **Utilities**: In `lib/`

### Import Order

1. React imports
2. Next.js imports
3. Third-party libraries
4. Internal components
5. Local files (schemas, components)

## Testing Guidelines

Test these scenarios:

- Form validation (valid/invalid inputs)
- Auth flows (sign up, sign in, OAuth)
- Protected route access (authenticated/unauthenticated)
- Email verification flow
- Password reset flow
- Loading states
- Error states

## Key Resources

### Official Documentation

- [Next.js 15](https://nextjs.org/docs) - App Router, Server Components
- [Convex](https://docs.convex.dev) - Database, queries, mutations
- [Better Auth](https://better-auth.com) - Authentication
- [Better Auth Convex Adapter](https://better-auth.com/docs/adapters/convex)
- [TanStack Form](https://tanstack.com/form) - Form handling
- [Zod](https://zod.dev) - Schema validation
- [Shadcn UI](https://ui.shadcn.com) - Component library
- [Tailwind CSS](https://tailwindcss.com) - Styling

### Authentication-Specific Resources

- **[Convex Better Auth Local Install](https://convex-better-auth.netlify.app/features/local-install)** - CRITICAL: Primary guide for local install setup
- **[Better Auth Schema Configuration](https://www.better-auth.com/docs/concepts/database#schema-configuration)** - Custom fields and schema generation
- **[Better Auth CLI](https://www.better-auth.com/docs/concepts/cli)** - Schema generation commands
- **[Convex Components](https://docs.convex.dev/production/components)** - Understanding component architecture
- **[Better Auth Plugins](https://www.better-auth.com/docs/plugins/overview)** - Device authorization and other plugins
- **[Resend with Better Auth](https://www.better-auth.com/docs/integrations/resend)** - Email verification setup

### Internal Files

- `convex/schema.ts` - Main database schema (VMs, SSH keys, etc.)
- `convex/auth.ts` - Better Auth configuration and `authComponent` export
- `convex/auth.config.ts` - Convex auth configuration (JWT issuer)
- `convex/betterAuth/` - Local Better Auth component
  - `schema.ts` - Auto-generated auth tables (user, session, account, etc.)
  - `userHelpers.ts` - Type-safe user queries/mutations
  - `adapter.ts` - Database adapter for Better Auth
  - `auth.ts` - Static auth instance for CLI
  - `convex.config.ts` - Component definition
- `src/lib/auth-client.ts` - Frontend auth client setup
- `src/providers/convexClientProvider.tsx` - Convex + Better Auth provider (with `expectAuth: true`)
- `src/components/ui/` - Reusable UI components

## Quick Start for New Developers

### Initial Setup

1. Clone the repository
2. Install dependencies: `pnpm install`
3. Set up environment variables (copy from team or create new OAuth apps)
4. Start Convex: `npx convex dev` (in one terminal)
5. Start Next.js: `pnpm dev` (in another terminal)
6. Visit `http://localhost:3000`

### First Time Working with Auth?

1. **Read the Local Install docs**: [Convex Better Auth Local Install](https://convex-better-auth.netlify.app/features/local-install)
2. **Understand the pattern**: Use `authComponent.getAuthUser(ctx)` for authentication
3. **Check existing implementations**: Look at `protected-layout.tsx` or `profile/page.tsx` for examples
4. **When adding new queries**: Use `authComponent.getAuthUser(ctx)` from `convex/auth.ts` to get the authenticated user

### Adding a New Protected Query

**Template**:

```tsx
// In convex/myFeature.ts
import { query } from "./_generated/server";
import { v } from "convex/values";
import { authComponent } from "./auth";

export const myQuery = query({
  args: {
    // ... your args
  },
  handler: async (ctx, args) => {
    // Get authenticated user
    const user = await authComponent.getAuthUser(ctx);

    if (!user) {
      throw new Error("Unauthenticated");
    }

    // Your query logic here
    return { userId: user._id };
  },
});
```

**Frontend usage**:

```tsx
import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";

const data = useQuery(api.myFeature.myQuery);
```

## Quick Reference

### Common Commands

```bash
pnpm install                              # Install dependencies
pnpm dev                                  # Start Next.js dev server
npx convex dev                            # Start Convex dev server
cd convex/betterAuth && npx @better-auth/cli generate -y  # Regenerate auth schema
```

### Environment Variables

```env
NEXT_PUBLIC_CONVEX_URL=      # Convex deployment URL
CONVEX_DEPLOY_KEY=           # Convex deploy key
SITE_URL=                    # Site URL (for callbacks)
GOOGLE_CLIENT_ID=            # Google OAuth
GOOGLE_CLIENT_SECRET=
GITHUB_CLIENT_ID=            # GitHub OAuth
GITHUB_CLIENT_SECRET=
RESEND_API_KEY=              # Email service
ADMIN_USERS=                 # Comma-separated emails for admin access (dev tools + auto-approved early access)
```

### Email Configuration (Resend)

**Sender Address**:

- Use `noreply@notifications.uvacompute.com` for all transactional emails
- Ensure domain `notifications.uvacompute.com` is verified in Resend dashboard
- Main domain `uvacompute.com` must also be verified

**Email Types**:

1. **Verification Email** (`src/lib/email.ts` → `sendVerificationEmail`)
   - Sent automatically on sign-up for email/password users
   - Skipped for OAuth users (pre-verified)
2. **Password Reset** (`src/lib/email.ts` → `sendPasswordResetEmail`)
   - Sent when user requests password reset
   - Token expires in 1 hour (3600 seconds)
3. **Early Access Request** (`src/app/[flags]/api/early-access/route.ts`)
   - Sent to admin when user requests early access
   - Includes approve/deny links

**Testing Emails Locally**:

- Resend works in development with production API key
- Check Resend dashboard logs for delivery status
- Use real email addresses for testing (Resend doesn't support test mode like some providers)

### Common Patterns

**Protected Route Layout**:

```tsx
// apps/site/src/app/[flags]/(protected)/layout.tsx
export default async function Layout({ children }) {
  const cookieStore = await cookies();
  const session = cookieStore.get("better-auth.session_token");
  if (!session?.value) redirect("/login");
  return <ProtectedLayout>{children}</ProtectedLayout>;
}
```

**Toast Notification**:

```tsx
toast.error("title", { description: "message" });
toast.success("title", { description: "message" });
```

**Loading with Suspense**:

```tsx
<Suspense fallback={<Skeleton className="h-48 w-full" />}>
  <AsyncComponent />
</Suspense>
```

## Debugging Authentication

### Useful Debugging Queries

**Check all sessions in database**:

```tsx
// Add to convex/betterAuth/currentUser.ts temporarily
export const debugSessions = query({
  args: {},
  handler: async (ctx) => {
    const sessions = await ctx.db.query("session").collect();
    return sessions.map((s) => ({
      token: s.token.substring(0, 10) + "...",
      userId: s.userId,
      expired: s.expiresAt < Date.now(),
      expiresAt: new Date(s.expiresAt).toISOString(),
    }));
  },
});
```

**Check user data**:

```tsx
// Frontend debugging
const { data: session } = authClient.useSession();
console.log("Better Auth session:", session);

const user = useQuery(api.auth.getCurrentUser);
console.log("Convex user:", user);
```

**Backend debugging**:

```tsx
// In your Convex query
import { authComponent } from "./auth";

const user = await authComponent.getAuthUser(ctx);
console.log("Authenticated user:", user);
```

### Common Debugging Steps

1. **Verify Better Auth session exists**:
   - Check browser console for `session` object
   - Verify `session?.user` has expected data

2. **Verify ConvexReactClient has `expectAuth: true`**:
   - Check `src/providers/convexClientProvider.tsx`
   - Ensure `expectAuth: true` is set in the client configuration

3. **Verify JWT auth config exists**:
   - Check `convex/auth.config.ts` exists and defines the Better Auth JWT issuer
   - Restart Convex dev server after changes

4. **Verify user exists**:
   - Check Convex dashboard → Data → `user` table (in betterAuth component)
   - Verify user has expected fields

5. **Check for expired sessions**:
   - Sessions expire after 30 days by default
   - Check Convex dashboard → Data → `session` table (in betterAuth component)

## Understanding the Component Architecture

### Better Auth Component Structure

The `convex/betterAuth/` directory is a **Convex component** - a self-contained module with its own:

- Schema (`schema.ts`) - Auto-generated Better Auth tables
- Adapter (`adapter.ts`) - Database adapter functions
- Configuration (`convex.config.ts`) - Component definition
- User helpers (`userHelpers.ts`) - Type-safe user mutations/queries

Components are **never exposed to the internet**, even if functions are public. They're only accessible from parent components or the main app via `ctx.runQuery/ctx.runMutation`.

### How Components Communicate

**Main App → Better Auth Component**:

```tsx
// From main app (convex/auth.ts)
import { authComponent } from "./auth";

// Get authenticated user via the Better Auth adapter
const user = await authComponent.getAuthUser(ctx);
```

**Component Functions**:

You can also call component functions directly for advanced use cases:

```tsx
// Update user early access status
await ctx.runMutation(components.betterAuth.userHelpers.updateUserEarlyAccess, {
  userId: user._id,
  hasEarlyAccess: true,
});
```

## Git & Version Control

Git operations are managed by the user. Focus on writing clean, well-structured code.

---

**Remember**: Minimize code, optimize for readability, follow framework conventions, leverage TypeScript, and maintain clean architecture. When in doubt, check existing implementations in the codebase.
