const REDACTION_MARKER = "***REDACTED***";
const SHORTEST_REDACTED_SECRET = 4;

function markSecretCharacters(text: string, secrets: readonly string[]): Uint8Array {
  const insideSecret = new Uint8Array(text.length);
  for (const secret of secrets) {
    if (secret.length < SHORTEST_REDACTED_SECRET) continue;
    for (let start = text.indexOf(secret); start !== -1; start = text.indexOf(secret, start + 1)) {
      insideSecret.fill(1, start, start + secret.length);
    }
  }
  return insideSecret;
}

/**
 * Overleaf git tokens behave like passwords. They can surface in git's stderr,
 * in remote URLs and in error messages, so every string that leaves this process
 * (tool output, logs, thrown errors) is passed through here first.
 */
export function redactSecrets(text: string, secrets: readonly string[]): string {
  const holdsSecret = secrets.some(
    (secret) => secret.length >= SHORTEST_REDACTED_SECRET && text.includes(secret),
  );
  if (!holdsSecret) return text;
  const insideSecret = markSecretCharacters(text, secrets);
  let redacted = "";
  let index = 0;
  while (index < text.length) {
    const runIsSecret = insideSecret[index] === 1;
    const runEnd = insideSecret.indexOf(runIsSecret ? 0 : 1, index);
    const end = runEnd === -1 ? text.length : runEnd;
    redacted += runIsSecret ? REDACTION_MARKER : text.slice(index, end);
    index = end;
  }
  return redacted;
}
