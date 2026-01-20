"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

export default function DashboardPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (searchParams.get("verified") === "true") {
      toast.success("email verified successfully!", {
        description: "welcome to uvacompute",
      });
      router.replace("/vms?verified=true");
    } else {
      router.replace("/vms");
    }
  }, [searchParams, router]);

  return null;
}
