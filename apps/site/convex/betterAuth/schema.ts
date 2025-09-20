import { defineSchema } from "convex/server";
import { tables } from "./generatedSchema";

// Don't add custom fields or change types to the generated schema
// here, use Better Auth's schema config for that:
// https://www.better-auth.com/docs/concepts/database#extending-core-schema
const schema = defineSchema({
  ...tables,
});

export default schema;
