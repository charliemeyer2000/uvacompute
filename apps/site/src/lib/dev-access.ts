export function isDevToolsAllowed(userEmail?: string | null): boolean {
  if (!userEmail) return false;

  const adminUsers =
    process.env.ADMIN_USERS?.split(",").map((email) => email.trim()) || [];

  if (adminUsers.length === 0) {
    return false;
  }

  return adminUsers.includes(userEmail);
}

export function getAdminUsers(): string[] {
  return process.env.ADMIN_USERS?.split(",").map((email) => email.trim()) || [];
}
