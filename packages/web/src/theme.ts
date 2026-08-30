export type Theme = "dark" | "light";

export function getInitialTheme(saved: string | null): Theme {
  return saved === "light" ? "light" : "dark";
}

export function toggleTheme(theme: Theme): Theme {
  return theme === "dark" ? "light" : "dark";
}
