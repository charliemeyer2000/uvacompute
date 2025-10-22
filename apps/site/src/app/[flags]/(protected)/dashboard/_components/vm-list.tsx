"use client";

import ActiveVMs from "./active-vms";
import VMHistory from "./vm-history";

export default function VMList() {
  return (
    <div className="space-y-8">
      <ActiveVMs />
      <VMHistory />
    </div>
  );
}
