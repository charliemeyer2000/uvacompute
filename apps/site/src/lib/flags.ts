import { flag } from "flags/next";

export const shouldHideWebsite = flag({
  key: "shouldHideWebsite",
  decide() {
    return true;
  },
});
