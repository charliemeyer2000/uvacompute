import { flag } from "flags/next";

export const earlyAccessEnabled = flag({
  key: "earlyAccessEnabled",
  decide() {
    return true;
  },
});

export const rootFlags = [earlyAccessEnabled] as const;
