import { randomInt } from "node:crypto";

export function getValidationString(): string {
  return `${randomInt(0, 100)} ${randomInt(0, 100)} ${randomInt(0, 100)}`;
}
