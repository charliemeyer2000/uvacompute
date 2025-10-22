"use client";

import { Suspense } from "react";
import ActiveVMs from "./active-vms";
import VMHistory from "./vm-history";
import { ActiveVMsSkeleton, VMHistorySkeleton } from "./vm-list-skeleton";

export default function VMList() {
  return (
    <div className="space-y-8">
      <Suspense fallback={<ActiveVMsSkeleton />}>
        <ActiveVMs />
      </Suspense>

      <Suspense fallback={<VMHistorySkeleton />}>
        <VMHistory />
      </Suspense>
    </div>
  );
}
