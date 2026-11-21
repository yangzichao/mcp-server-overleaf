export function unfilledBundlePlaceholder(settingKey: string): string {
  return `\${user_config.${settingKey}}`;
}
