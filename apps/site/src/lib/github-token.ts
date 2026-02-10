export type TokenValidationResult = {
  valid: boolean;
  username?: string;
  tokenType?: "classic" | "fine-grained";
  error?: string;
};

export async function validateGithubToken(
  token: string,
): Promise<TokenValidationResult> {
  if (!token || token.trim().length === 0) {
    return { valid: false, error: "Token is empty" };
  }

  try {
    const res = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
      },
    });

    if (res.status === 401) {
      return { valid: false, error: "Invalid token — authentication failed" };
    }

    if (!res.ok) {
      return {
        valid: false,
        error: `GitHub API returned ${res.status}`,
      };
    }

    const user = await res.json();
    const username = user.login as string;

    // Check x-oauth-scopes header — present for classic PATs, absent for fine-grained
    const oauthScopes = res.headers.get("x-oauth-scopes");

    if (oauthScopes !== null) {
      // Classic PAT — check for 'repo' scope
      const scopes = oauthScopes.split(",").map((s) => s.trim());
      if (!scopes.includes("repo")) {
        return {
          valid: false,
          username,
          tokenType: "classic",
          error: `Token is missing the "repo" scope (has: ${oauthScopes || "none"}). Create a new token with the "repo" scope.`,
        };
      }
      return { valid: true, username, tokenType: "classic" };
    }

    // No x-oauth-scopes header — fine-grained PAT
    // Can't introspect permissions; accept it and let the webhook handler
    // surface errors at runtime if the token lacks Administration:Write
    return { valid: true, username, tokenType: "fine-grained" };
  } catch (err) {
    return {
      valid: false,
      error: `Failed to validate token: ${err instanceof Error ? err.message : "unknown error"}`,
    };
  }
}
