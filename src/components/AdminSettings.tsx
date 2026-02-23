import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import { useCompanySettings, CompanySettings } from "@/hooks/useCompanySettings";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Save, Palette, Type, MessageSquare, Smile, RectangleHorizontal, Circle, Building2, Upload, Image } from "lucide-react";

const FONT_OPTIONS = [
  "Inter", "Roboto", "Open Sans", "Lato", "Montserrat",
  "Poppins", "Nunito", "Raleway", "Source Sans 3", "PT Sans",
];

const COLOR_PRESETS = [
  { name: "Indigo", value: "234 89% 64%" },
  { name: "Blue", value: "217 91% 60%" },
  { name: "Emerald", value: "160 84% 39%" },
  { name: "Rose", value: "347 77% 50%" },
  { name: "Amber", value: "38 92% 50%" },
  { name: "Violet", value: "263 70% 50%" },
  { name: "Teal", value: "173 80% 40%" },
  { name: "Orange", value: "25 95% 53%" },
  { name: "Cyan", value: "189 94% 43%" },
  { name: "Pink", value: "330 81% 60%" },
];
export default function AdminSettings() {
  const { profile } = useAuth();
  const { t, lang } = useLanguage();
  const { settings } = useCompanySettings();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [form, setForm] = useState({
    welcome_message: "Welcome!",
    use_emojis: true,
    secondary_font: "Inter",
    button_shape: "rounded" as "rounded" | "rectangular",
    primary_color: "234 89% 64%",
  });

  // Company name & logo
  const { data: companyData } = useQuery({
    queryKey: ["company-edit", profile?.company_id],
    queryFn: async () => {
      if (!profile?.company_id) return null;
      const { data } = await supabase.from("companies").select("name, logo_url").eq("id", profile.company_id).single();
      return data as { name: string; logo_url: string | null } | null;
    },
    enabled: !!profile?.company_id,
  });

  const [companyName, setCompanyName] = useState("");
  const [companyLogoFile, setCompanyLogoFile] = useState<File | null>(null);
  const [companyLogoPreview, setCompanyLogoPreview] = useState<string | null>(null);

  useEffect(() => {
    if (companyData) {
      setCompanyName(companyData.name);
      setCompanyLogoPreview(companyData.logo_url || null);
    }
  }, [companyData]);

  const handleCompanyLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setCompanyLogoFile(file);
      setCompanyLogoPreview(URL.createObjectURL(file));
    }
  };

  const saveCompanyInfo = useMutation({
    mutationFn: async () => {
      if (!profile?.company_id) throw new Error("No company");
      let logoUrl = companyData?.logo_url || null;

      if (companyLogoFile) {
        const ext = companyLogoFile.name.split(".").pop() || "png";
        const path = `${profile.company_id}/logo.${ext}`;
        const { error: uploadError } = await supabase.storage.from("company-logos").upload(path, companyLogoFile, { upsert: true });
        if (uploadError) throw uploadError;
        const { data: urlData } = supabase.storage.from("company-logos").getPublicUrl(path);
        logoUrl = urlData.publicUrl;
      }

      const { error } = await supabase.from("companies").update({ name: companyName, logo_url: logoUrl } as any).eq("id", profile.company_id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company-edit"] });
      queryClient.invalidateQueries({ queryKey: ["company-info"] });
      queryClient.invalidateQueries({ queryKey: ["company-name"] });
      queryClient.invalidateQueries({ queryKey: ["brand-logo"] });
      setCompanyLogoFile(null);
      toast({ title: lang === "es" ? "Compañía actualizada" : "Company updated" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  useEffect(() => {
    if (settings) {
      setForm({
        welcome_message: settings.welcome_message,
        use_emojis: settings.use_emojis,
        secondary_font: settings.secondary_font,
        button_shape: settings.button_shape,
        primary_color: settings.primary_color,
      });
    }
  }, [settings]);

  const saveSettings = useMutation({
    mutationFn: async () => {
      if (!profile?.company_id) throw new Error("No company");
      const payload = { ...form, company_id: profile.company_id };

      if (settings?.id) {
        const { error } = await (supabase.from as any)("company_settings")
          .update(payload)
          .eq("id", settings.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase.from as any)("company_settings")
          .insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company-settings"] });
      toast({ title: lang === "es" ? "Ajustes guardados" : "Settings saved" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const inputClass = "w-full px-4 py-2.5 rounded-xl bg-muted/50 border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50";

  return (
    <div className="space-y-6">
      {/* Company Info Card */}
      <div className="glass-card rounded-[2.5rem] animate-fade-in-up">
        <div className="px-6 lg:px-8 pt-6 pb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
            <Building2 className="w-4 h-4 text-primary" />
            {lang === "es" ? "Información de la compañía" : "Company Information"}
          </h2>
          <button
            onClick={() => saveCompanyInfo.mutate()}
            disabled={saveCompanyInfo.isPending}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5" />
            {t("save")}
          </button>
        </div>
        <div className="px-6 lg:px-8 pb-8 space-y-6">
          {/* Company Name */}
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Building2 className="w-3 h-3" />
              {lang === "es" ? "Nombre de la compañía" : "Company name"}
            </label>
            <input
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder={lang === "es" ? "Nombre de tu compañía" : "Your company name"}
              className={`${inputClass} mt-1`}
            />
          </div>

          {/* Company Logo */}
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 mb-2">
              <Image className="w-3 h-3" />
              {lang === "es" ? "Logo de la compañía" : "Company logo"}
            </label>
            <div className="flex items-center gap-4">
              {companyLogoPreview ? (
                <img src={companyLogoPreview} alt="Logo" className="w-16 h-16 rounded-2xl object-cover border border-border" />
              ) : (
                <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center border border-border">
                  <Building2 className="w-8 h-8 text-muted-foreground" />
                </div>
              )}
              <label className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-muted hover:bg-muted/80 text-sm font-medium text-foreground transition-colors">
                <Upload className="w-4 h-4" />
                {lang === "es" ? "Subir logo" : "Upload logo"}
                <input type="file" accept="image/*" onChange={handleCompanyLogoChange} className="hidden" />
              </label>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">
              {lang === "es" ? "Se mostrará en el menú lateral" : "Shown in the sidebar menu"}
            </p>
          </div>
        </div>
      </div>

      {/* Customization Card (existing) */}
      <div className="glass-card rounded-[2.5rem] animate-fade-in-up">
        <div className="px-6 lg:px-8 pt-6 pb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
            <Palette className="w-4 h-4 text-primary" />
            {lang === "es" ? "Personalización" : "Customization"}
          </h2>
          <button
            onClick={() => saveSettings.mutate()}
            disabled={saveSettings.isPending}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5" />
            {t("save")}
          </button>
        </div>
        <div className="px-6 lg:px-8 pb-8 space-y-6">
          {/* Welcome Message */}
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <MessageSquare className="w-3 h-3" />
              {lang === "es" ? "Mensaje de bienvenida" : "Welcome message"}
            </label>
            <input
              value={form.welcome_message}
              onChange={(e) => setForm({ ...form, welcome_message: e.target.value })}
              placeholder={lang === "es" ? "Ej: ¡Bienvenido al equipo!" : "E.g. Welcome to the team!"}
              className={`${inputClass} mt-1`}
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              {lang === "es" ? "Se mostrará en el dashboard del empleado" : "Shown on the employee dashboard"}
            </p>
          </div>

          {/* Emojis Toggle */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Smile className="w-4 h-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium text-foreground">{lang === "es" ? "Usar emojis" : "Use emojis"}</p>
                <p className="text-[10px] text-muted-foreground">{lang === "es" ? "Mostrar emojis en la interfaz" : "Show emojis in the interface"}</p>
              </div>
            </div>
            <button
              onClick={() => setForm({ ...form, use_emojis: !form.use_emojis })}
              className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${form.use_emojis ? "bg-primary" : "bg-muted"}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-card shadow-lg transition-transform duration-200 ${form.use_emojis ? "translate-x-5" : "translate-x-0"}`} />
            </button>
          </div>

          {/* Secondary Font */}
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Type className="w-3 h-3" />
              {lang === "es" ? "Tipografía secundaria" : "Secondary typography"}
            </label>
            <select
              value={form.secondary_font}
              onChange={(e) => setForm({ ...form, secondary_font: e.target.value })}
              className={`${inputClass} mt-1`}
            >
              {FONT_OPTIONS.map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </div>

          {/* Button Shape */}
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 block">
              {lang === "es" ? "Forma de botones" : "Button shape"}
            </label>
            <div className="flex gap-3">
              <button
                onClick={() => setForm({ ...form, button_shape: "rounded" })}
                className={`flex-1 flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all duration-200 ${
                  form.button_shape === "rounded" ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/30"
                }`}
              >
                <div className="w-full h-9 rounded-full bg-primary/20 flex items-center justify-center">
                  <Circle className="w-4 h-4 text-primary" />
                </div>
                <span className="text-xs font-medium text-foreground">{lang === "es" ? "Circular" : "Rounded"}</span>
              </button>
              <button
                onClick={() => setForm({ ...form, button_shape: "rectangular" })}
                className={`flex-1 flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all duration-200 ${
                  form.button_shape === "rectangular" ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/30"
                }`}
              >
                <div className="w-full h-9 rounded-lg bg-primary/20 flex items-center justify-center">
                  <RectangleHorizontal className="w-4 h-4 text-primary" />
                </div>
                <span className="text-xs font-medium text-foreground">{lang === "es" ? "Rectangular" : "Rectangular"}</span>
              </button>
            </div>
          </div>

          {/* Primary Color */}
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 mb-2">
              <Palette className="w-3 h-3" />
              {lang === "es" ? "Color primario" : "Primary color"}
            </label>
            <div className="grid grid-cols-5 gap-2">
              {COLOR_PRESETS.map((c) => (
                <button
                  key={c.value}
                  onClick={() => setForm({ ...form, primary_color: c.value })}
                  className={`group flex flex-col items-center gap-1.5 p-2 rounded-xl transition-all duration-200 ${
                    form.primary_color === c.value ? "bg-muted ring-2 ring-primary" : "hover:bg-muted/50"
                  }`}
                >
                  <div
                    className="w-8 h-8 rounded-full border-2 border-card shadow-md transition-transform group-hover:scale-110"
                    style={{ backgroundColor: `hsl(${c.value})` }}
                  />
                  <span className="text-[9px] font-medium text-muted-foreground">{c.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Preview */}
          <div className="pt-4 border-t border-border/50">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
              {lang === "es" ? "Vista previa" : "Preview"}
            </p>
            <div className="p-4 rounded-2xl bg-muted/30 border border-border/50 space-y-3">
              <p className="text-sm text-foreground" style={{ fontFamily: form.secondary_font !== "Inter" ? `'${form.secondary_font}', sans-serif` : undefined }}>
                {form.welcome_message} {form.use_emojis ? "👋" : ""}
              </p>
              <div className="flex gap-2">
                <button
                  className="px-4 py-2 text-xs font-semibold text-card transition-colors"
                  style={{
                    backgroundColor: `hsl(${form.primary_color})`,
                    borderRadius: form.button_shape === "rounded" ? "9999px" : "0.75rem",
                  }}
                >
                  {lang === "es" ? "Botón ejemplo" : "Sample button"}
                </button>
                <button
                  className="px-4 py-2 text-xs font-semibold border border-border text-foreground transition-colors"
                  style={{
                    borderRadius: form.button_shape === "rounded" ? "9999px" : "0.75rem",
                  }}
                >
                  {lang === "es" ? "Secundario" : "Secondary"}
                </button>
              </div>
            </div>
          </div>

          {/* Note about dark mode */}
          <div className="p-4 rounded-2xl bg-muted/30 border border-border/50">
            <p className="text-xs text-muted-foreground">
              💡 {lang === "es"
                ? "Cada empleado puede elegir entre modo oscuro y claro desde su panel."
                : "Each employee can choose between dark and light mode from their dashboard."}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}