import { Moon, Sun } from "lucide-react";
import type { Theme } from "./theme";

export function NavControls({ theme, onToggle }: { theme: Theme; onToggle: () => void }) {
  const nextTheme = theme === "dark" ? "light" : "dark";
  return <div className="nav-icons">
    <button className="theme-toggle" onClick={onToggle} aria-label={`Switch to ${nextTheme} mode`} title={`Switch to ${nextTheme} mode`}>
      {theme === "dark" ? <Sun size={17}/> : <Moon size={17}/>}
    </button>
  </div>;
}
