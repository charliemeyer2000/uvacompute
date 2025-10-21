import { flag } from "flags/next";

export const areWeLive = flag({
  key: "areWeLive",
  decide() {
    return false;
  },
});

export const earlyAccessEnabled = flag({
  key: "earlyAccessEnabled",
  decide() {
    return true;
  },
});

export const rootFlags = [areWeLive, earlyAccessEnabled] as const;
