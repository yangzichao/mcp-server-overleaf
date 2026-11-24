export function notAMemberMessage(email: string, projectLabel: string): string {
  return `${email} is not an invited member of ${projectLabel}; read_project (view members) lists who is, and someone who joined through a sharing link is changed only in Overleaf's Share menu. Nothing changed.`;
}
