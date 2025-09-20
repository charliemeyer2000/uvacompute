import { betterAuth } from "better-auth";

const auth = betterAuth({
  database: {
    provider: "sqlite",
    url: ":memory:",
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
  },
});

export default auth;
