import { useEffect, useRef, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FunctionReturnType } from "convex/server";
import { api } from "../../../../../convex/_generated/api";

type RedirectLogicProps = {
  user: FunctionReturnType<typeof api.auth.getCurrentUser> | undefined;
  earlyAccessEnabled: boolean;
  hasEarlyAccess: boolean | undefined;
  hasPendingRequest: boolean | undefined;
  pathname: string | null;
  syncEarlyAccess: () => Promise<boolean>;
  router: ReturnType<typeof useRouter>;
};

type RedirectState = {
  shouldRedirect: boolean;
  isLoading: boolean;
};

export function useRedirectLogic({
  user,
  earlyAccessEnabled,
  hasEarlyAccess,
  hasPendingRequest,
  pathname,
  syncEarlyAccess,
  router,
}: RedirectLogicProps): RedirectState {
  const hasSyncedRef = useRef(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const state = useMemo((): RedirectState => {
    if (!user) {
      return { shouldRedirect: false, isLoading: true };
    }

    // Still syncing - show loading
    if (isSyncing) {
      return { shouldRedirect: false, isLoading: true };
    }

    if (earlyAccessEnabled && hasEarlyAccess === undefined) {
      return { shouldRedirect: false, isLoading: true };
    }

    if (earlyAccessEnabled && hasPendingRequest === undefined) {
      return { shouldRedirect: false, isLoading: true };
    }

    const isOnOnboarding = pathname?.includes("/onboarding");
    const needsEarlyAccessRedirect =
      earlyAccessEnabled &&
      hasEarlyAccess === false &&
      !isOnOnboarding &&
      hasPendingRequest !== undefined;

    return {
      shouldRedirect: !user.emailVerified || needsEarlyAccessRedirect,
      isLoading: false,
    };
  }, [
    user,
    isSyncing,
    earlyAccessEnabled,
    hasEarlyAccess,
    hasPendingRequest,
    pathname,
  ]);

  // Email verification redirect
  useEffect(() => {
    if (!user) return;
    if (!user.emailVerified) {
      router.push(`/verify-email?email=${encodeURIComponent(user.email)}`);
    }
  }, [user, router]);

  // Sync early access (wait for it to complete)
  useEffect(() => {
    if (!user) return;
    if (!earlyAccessEnabled) return;
    if (hasSyncedRef.current) return;

    async function sync() {
      setIsSyncing(true);
      await syncEarlyAccess();
      hasSyncedRef.current = true;
      setIsSyncing(false);
    }

    sync();
  }, [user, earlyAccessEnabled, syncEarlyAccess]);

  // Early access redirect (only after sync is done)
  useEffect(() => {
    if (!user) return;
    if (isSyncing) return; // DON'T redirect while syncing
    if (!earlyAccessEnabled) return;
    if (hasEarlyAccess === undefined || hasPendingRequest === undefined) return;

    const isOnOnboarding = pathname?.includes("/onboarding");
    if (hasEarlyAccess === false && !isOnOnboarding) {
      router.push(hasPendingRequest ? "/pending-approval" : "/early-access");
    }
  }, [
    user,
    isSyncing,
    earlyAccessEnabled,
    hasEarlyAccess,
    hasPendingRequest,
    pathname,
    router,
  ]);

  return state;
}
