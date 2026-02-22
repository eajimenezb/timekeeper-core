import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";

export interface CompanySettings {
  id?: string;
  company_id: string;
  welcome_message: string;
  use_emojis: boolean;
  secondary_font: string;
  button_shape: "rounded" | "rectangular";
  primary_color: string;
}

const defaultSettings: Omit<CompanySettings, "company_id"> = {
  welcome_message: "Welcome!",
  use_emojis: true,
  secondary_font: "Inter",
  button_shape: "rounded",
  primary_color: "234 89% 64%",
};

interface CompanySettingsContextType {
  settings: CompanySettings | null;
  darkMode: boolean;
  setDarkMode: (v: boolean) => void;
  isLoading: boolean;
}

const CompanySettingsContext = createContext<CompanySettingsContextType | undefined>(undefined);

export function CompanySettingsProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const [darkMode, setDarkModeState] = useState(() => localStorage.getItem("dark-mode") === "true");

  const { data: settings, isLoading } = useQuery({
    queryKey: ["company-settings", profile?.company_id],
    queryFn: async () => {
      if (!profile?.company_id) return null;
      const { data } = await (supabase.from as any)("company_settings")
        .select("*")
        .eq("company_id", profile.company_id)
        .maybeSingle();
      if (data) return data as CompanySettings;
      return { ...defaultSettings, company_id: profile.company_id } as CompanySettings;
    },
    enabled: !!profile?.company_id,
  });

  const setDarkMode = (v: boolean) => {
    setDarkModeState(v);
    localStorage.setItem("dark-mode", String(v));
  };

  // Apply dark mode
  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
  }, [darkMode]);

  // Apply primary color as CSS variable override
  useEffect(() => {
    if (!settings?.primary_color) return;
    const color = settings.primary_color;
    document.documentElement.style.setProperty("--primary", color);
    document.documentElement.style.setProperty("--accent", color);
    document.documentElement.style.setProperty("--ring", color);
    document.documentElement.style.setProperty("--sidebar-primary", color);
    document.documentElement.style.setProperty("--sidebar-ring", color);
    return () => {
      document.documentElement.style.removeProperty("--primary");
      document.documentElement.style.removeProperty("--accent");
      document.documentElement.style.removeProperty("--ring");
      document.documentElement.style.removeProperty("--sidebar-primary");
      document.documentElement.style.removeProperty("--sidebar-ring");
    };
  }, [settings?.primary_color]);

  // Apply secondary font
  useEffect(() => {
    if (!settings?.secondary_font || settings.secondary_font === "Inter") return;
    // Load font from Google Fonts
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(settings.secondary_font)}:wght@300;400;500;600;700&display=swap`;
    document.head.appendChild(link);
    document.documentElement.style.setProperty("--font-secondary", `'${settings.secondary_font}', sans-serif`);
    return () => {
      document.head.removeChild(link);
      document.documentElement.style.removeProperty("--font-secondary");
    };
  }, [settings?.secondary_font]);

  return (
    <CompanySettingsContext.Provider value={{ settings: settings ?? null, darkMode, setDarkMode, isLoading }}>
      {children}
    </CompanySettingsContext.Provider>
  );
}

export function useCompanySettings() {
  const ctx = useContext(CompanySettingsContext);
  if (!ctx) throw new Error("useCompanySettings must be used within CompanySettingsProvider");
  return ctx;
}
