export function friendlyError(error: unknown, fallback: string, validationFallback: string) {
  const message = error instanceof Error ? error.message : "";
  const longOption = message.match(/body\.option(?:List)?\.\d+: Too big: expected string to have <=(\d+) characters/);
  if (longOption) return `An option is too long. Please shorten it to ${longOption[1]} characters or fewer.`;
  if (message.includes("Validation failed:")) return validationFallback;
  return fallback;
}
