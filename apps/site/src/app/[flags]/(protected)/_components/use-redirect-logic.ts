import { useEffect, useRef, useMemo } from "react";
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

  const state = useMemo((): RedirectState => {
    if (!user) {
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
  }, [user, earlyAccessEnabled, hasEarlyAccess, hasPendingRequest, pathname]);

  useEffect(() => {
    if (!user) return;

    if (!user.emailVerified) {
      router.push(`/verify-email?email=${encodeURIComponent(user.email)}`);
      return;
    }

    if (earlyAccessEnabled && !hasSyncedRef.current) {
      syncEarlyAccess();
      hasSyncedRef.current = true;
    }

    const isOnOnboarding = pathname?.includes("/onboarding");
    if (
      earlyAccessEnabled &&
      hasEarlyAccess === false &&
      !isOnOnboarding &&
      hasPendingRequest !== undefined
    ) {
      router.push(hasPendingRequest ? "/pending-approval" : "/early-access");
    }
  }, [
    user,
    earlyAccessEnabled,
    hasEarlyAccess,
    hasPendingRequest,
    pathname,
    syncEarlyAccess,
    router,
  ]);

  return state;
}
