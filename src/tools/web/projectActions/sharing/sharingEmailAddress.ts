const ONE_BARE_ADDRESS = /^[^\s@<>,;"]+@[^\s@<>,;"]+$/;

/** Overleaf trims and lowercases an invited address (`EmailHelper.parseEmail`) and stores it that way. */
export function requireSharingEmailAddress(email: string): string {
  const address = email.trim().toLowerCase();
  if (!ONE_BARE_ADDRESS.test(address)) {
    throw new Error(
      `email must be one address such as ada@example.com, without a name, brackets or a second address; "${email}" is not. Nothing was sent.`,
    );
  }
  return address;
}

export function isSameEmailAddress(first: string, second: string): boolean {
  return first.trim().toLowerCase() === second.trim().toLowerCase();
}
