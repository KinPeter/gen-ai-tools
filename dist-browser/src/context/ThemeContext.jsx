import { createContext, useContext, useEffect, useState } from "react";

const ThemeContext = createContext();

const STORAGE_KEY = "dist-browser-theme";
const DARK_QUERY = "(prefers-color-scheme: dark)";

function getSystemTheme() {
  if (typeof window !== "undefined" && window.matchMedia) {
    return window.matchMedia(DARK_QUERY).matches ? "dark" : "light";
  }
  return "light";
}

function getStoredTheme() {
  if (typeof window !== "undefined") {
    return localStorage.getItem(STORAGE_KEY);
  }
  return null;
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    const stored = getStoredTheme();
    if (stored === "dark" || stored === "light") return stored;
    return getSystemTheme();
  });

  useEffect(() => {
    const stored = getStoredTheme();
    if (stored === "dark" || stored === "light") {
      setTheme(stored);
    } else {
      setTheme(getSystemTheme());
    }
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  // Listen for system theme changes
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia(DARK_QUERY);
    const handler = (e) => {
      // Only update when there's no stored preference
      if (!getStoredTheme()) {
        setTheme(e.matches ? "dark" : "light");
      }
    };
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, next);
    }
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}

export default ThemeContext;
