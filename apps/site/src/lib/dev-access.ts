export function isDevToolsAllowed(userEmail?: string | null): boolean {
  if (!userEmail) return false;

  const allowedUsers =
    process.env.DEV_TOOLS_ALLOWED_USERS?.split(",").map((email) =>
      email.trim(),
    ) || [];

  if (allowedUsers.length === 0) {
    return false;
  }

  return allowedUsers.includes(userEmail);
}

export function getDevToolsAllowedUsers(): string[] {
  return (
    process.env.DEV_TOOLS_ALLOWED_USERS?.split(",").map((email) =>
      email.trim(),
    ) || []
  );
}
