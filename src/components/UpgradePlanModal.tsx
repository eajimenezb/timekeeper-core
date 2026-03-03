import { useState } from "react";
import { useLanguage } from "@/hooks/useLanguage";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { X, Check, Building2, Rocket, Crown, Zap } from "lucide-react";

interface UpgradePlanModalProps {
  open: boolean;
  onClose: () => void;
  currentPlan: string;
  currentSeats: number;
  usedSeats: number;
}

const plans = [
  {
    id: "essential",
    maxSeats: 10,
    icon: Building2,
    color: "primary",
    featuresEs: [
      "Hasta 10 colaboradores",
      "Marcación básica con geovalla",
      "Reporte semanal en CSV",
      "Soporte por email",
    ],
    featuresEn: [
      "Up to 10 employees",
      "Basic punch with geofence",
      "Weekly CSV report",
      "Email support",
    ],
  },
  {
    id: "professional",
    maxSeats: 50,
    icon: Rocket,
    color: "primary",
    popular: true,
    featuresEs: [
      "Hasta 50 colaboradores",
      "Todo lo del plan Essential",
      "Panel de auditoría (Dashboard)",
      "Exportación Excel/CSV avanzada",
      "Descuento anual disponible",
    ],
    featuresEn: [
      "Up to 50 employees",
      "Everything in Essential",
      "Audit dashboard (Recharts)",
      "Advanced Excel/CSV export",
      "Annual discount available",
    ],
  },
  {
    id: "enterprise",
    maxSeats: 9999,
    icon: Crown,
    color: "primary",
    featuresEs: [
      "Colaboradores ilimitados",
      "Todo lo del plan Professional",
      "Soporte multi-sede",
      "API para integración de nómina",
      "Soporte prioritario 24/7",
    ],
    featuresEn: [
      "Unlimited employees",
      "Everything in Professional",
      "Multi-location support",
      "Payroll integration API",
      "Priority 24/7 support",
    ],
  },
];

export default function UpgradePlanModal({ open, onClose, currentPlan, currentSeats, usedSeats }: UpgradePlanModalProps) {
  const { t, lang } = useLanguage();
  const { profile } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState<string | null>(null);

  if (!open) return null;

  const handleSelectPlan = async (planId: string, maxSeats: number) => {
    if (planId === currentPlan) return;
    if (planId === "enterprise") {
      window.open("mailto:sales@axistrack.app?subject=Enterprise%20Plan%20Inquiry", "_blank");
      return;
    }
    setLoading(planId);
    try {
      const { error } = await supabase
        .from("companies")
        .update({
          plan_type: planId,
          max_seats: maxSeats,
          subscription_status: "active",
        } as any)
        .eq("id", profile!.company_id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["admin-company"] });
      queryClient.invalidateQueries({ queryKey: ["company-billing"] });
      toast({ title: lang === "es" ? "Plan actualizado" : "Plan updated" });
      onClose();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setLoading(null);
    }
  };

  const planNames: Record<string, { es: string; en: string }> = {
    trial: { es: "Prueba", en: "Trial" },
    essential: { es: "Essential", en: "Essential" },
    professional: { es: "Professional", en: "Professional" },
    enterprise: { es: "Enterprise", en: "Enterprise" },
  };

  const getPlanLabel = (id: string) => planNames[id]?.[lang] || id;

  return (
    <div className="fixed inset-0 bg-foreground/20 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
      <div className="bg-card rounded-[2rem] w-full max-w-3xl shadow-2xl animate-scale-in overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="p-6 pb-4 border-b border-border/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-warning/10 flex items-center justify-center">
                <Zap className="w-5 h-5 text-warning" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-foreground">
                  {lang === "es" ? "Límite de asientos alcanzado" : "Seat Limit Reached"}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {lang === "es"
                    ? `Tu plan ${getPlanLabel(currentPlan)} permite ${currentSeats} empleados. Actualmente tienes ${usedSeats}.`
                    : `Your ${getPlanLabel(currentPlan)} plan allows ${currentSeats} employees. You currently have ${usedSeats}.`}
                </p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 rounded-xl hover:bg-muted transition-colors">
              <X className="w-5 h-5 text-muted-foreground" />
            </button>
          </div>
        </div>

        {/* Plans Grid */}
        <div className="p-6 grid grid-cols-1 sm:grid-cols-3 gap-4 max-h-[70vh] overflow-y-auto">
          {plans.map((plan) => {
            const isCurrent = plan.id === currentPlan;
            const isDowngrade = plans.findIndex(p => p.id === plan.id) < plans.findIndex(p => p.id === currentPlan);
            const features = lang === "es" ? plan.featuresEs : plan.featuresEn;
            const Icon = plan.icon;

            return (
              <div
                key={plan.id}
                className={`relative rounded-2xl border p-5 flex flex-col transition-all ${
                  plan.popular
                    ? "border-primary shadow-lg shadow-primary/10 ring-1 ring-primary/20"
                    : "border-border/50"
                } ${isCurrent ? "bg-primary/5" : "bg-card"}`}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold uppercase tracking-wider">
                    {lang === "es" ? "Popular" : "Popular"}
                  </div>
                )}

                <div className="flex items-center gap-2 mb-3">
                  <div className={`w-8 h-8 rounded-xl ${plan.popular ? "bg-primary/10" : "bg-muted"} flex items-center justify-center`}>
                    <Icon className={`w-4 h-4 ${plan.popular ? "text-primary" : "text-muted-foreground"}`} />
                  </div>
                  <div>
                    <h3 className="font-bold text-foreground text-sm">{getPlanLabel(plan.id)}</h3>
                    <p className="text-[10px] text-muted-foreground">
                      {plan.id === "enterprise"
                        ? (lang === "es" ? "Cotización personalizada" : "Custom pricing")
                        : (lang === "es" ? `Hasta ${plan.maxSeats} empleados` : `Up to ${plan.maxSeats} employees`)}
                    </p>
                  </div>
                </div>

                {isCurrent && (
                  <div className="mb-3 px-2 py-1 rounded-lg bg-primary/10 text-primary text-[10px] font-bold uppercase tracking-wider text-center">
                    {lang === "es" ? "Plan actual" : "Current plan"}
                  </div>
                )}

                <ul className="space-y-2 flex-1 mb-4">
                  {features.map((f, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                      <Check className="w-3.5 h-3.5 text-success shrink-0 mt-0.5" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => handleSelectPlan(plan.id, plan.maxSeats)}
                  disabled={isCurrent || isDowngrade || loading === plan.id}
                  className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                    plan.popular && !isCurrent
                      ? "bg-primary text-primary-foreground hover:bg-primary/90"
                      : isCurrent
                      ? "bg-muted text-muted-foreground"
                      : "bg-muted hover:bg-muted/80 text-foreground"
                  }`}
                >
                  {loading === plan.id
                    ? (lang === "es" ? "Actualizando..." : "Updating...")
                    : isCurrent
                    ? (lang === "es" ? "Plan actual" : "Current plan")
                    : plan.id === "enterprise"
                    ? (lang === "es" ? "Contactar ventas" : "Contact Sales")
                    : (lang === "es" ? "Seleccionar" : "Select")}
                </button>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-6 pb-5 pt-2">
          <p className="text-[10px] text-muted-foreground text-center">
            {lang === "es"
              ? "Los cambios de plan se aplican inmediatamente. Sin cargos por ahora."
              : "Plan changes apply immediately. No charges for now."}
          </p>
        </div>
      </div>
    </div>
  );
}
