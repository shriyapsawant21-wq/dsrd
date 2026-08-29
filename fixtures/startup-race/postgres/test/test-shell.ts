const windowsGitBash = "C:\\Program Files\\Git\\bin\\bash.exe";

export function resolveTestShell(
  platform: NodeJS.Platform,
  override = process.env.POSTGRES_TEST_SHELL
): string {
  if (override) {
    return override;
  }

  return platform === "win32" ? windowsGitBash : "/bin/sh";
}
