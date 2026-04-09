import {
  confirm as inquirerConfirm,
  select as inquirerSelect,
  password as inquirerPassword,
} from "@inquirer/prompts";
import { isNonInteractive } from "./utils";

type ConfirmOptions = Parameters<typeof inquirerConfirm>[0];
type SelectOptions = Parameters<typeof inquirerSelect>[0];
type PasswordOptions = Parameters<typeof inquirerPassword>[0];

export async function confirm(options: ConfirmOptions): Promise<boolean> {
  if (isNonInteractive()) {
    return options.default ?? true;
  }
  return inquirerConfirm(options);
}

export async function select<T>(
  options: SelectOptions & { nonInteractiveDefault?: T },
): Promise<T> {
  if (isNonInteractive()) {
    if (options.nonInteractiveDefault !== undefined) {
      return options.nonInteractiveDefault;
    }
    throw new Error(
      "Cannot select interactively in non-interactive mode. Please provide a specific value.",
    );
  }
  return inquirerSelect(options) as Promise<T>;
}

export async function password(options: PasswordOptions): Promise<string> {
  if (isNonInteractive()) {
    return "";
  }
  return inquirerPassword(options);
}
