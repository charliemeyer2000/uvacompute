import { flag } from "flags/next";

export const areWeLive = flag({
  key: "areWeLive",
  decide() {
    return false;
  },
});

export const rootFlags = [areWeLive] as const;
