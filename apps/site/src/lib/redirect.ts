/**
 * Validates that a redirect URL is safe to use.
 *
 * This prevents open redirect vulnerabilities by ensuring the redirect:
 * - Is a relative path (starts with /)
 * - Is not a protocol-relative URL (//evil.com)
 * - Does not contain absolute URLs (http://, https://)
 *
 * @param redirect - The redirect URL to validate
 * @returns true if the redirect is safe, false otherwise
 */
export function isValidRedirect(redirect: string | null): boolean {
  if (!redirect) return false;

  // Must start with / (relative path)
  if (!redirect.startsWith("/")) return false;

  // Cannot be protocol-relative URL (//evil.com)
  if (redirect.startsWith("//")) return false;

  // Cannot contain absolute URLs
  if (redirect.includes("://")) return false;

  return true;
}

/**
 * Gets a safe redirect URL from a query parameter.
 *
 * @param redirect - The redirect parameter from searchParams
 * @param fallback - The fallback URL to use if redirect is invalid (default: "/vms")
 * @returns A safe redirect URL
 */
export function getSafeRedirect(
  redirect: string | null,
  fallback: string = "/vms",
): string {
  if (!redirect || !isValidRedirect(redirect)) {
    return fallback;
  }
  return redirect;
}
