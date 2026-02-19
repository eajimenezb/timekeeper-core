import { useState, useEffect } from "react";

export function useLiveTimer(clockInAt: string | null | undefined, isClockedIn: boolean) {
  const [elapsed, setElapsed] = useState("00:00:00");

  useEffect(() => {
    if (!isClockedIn || !clockInAt) {
      setElapsed("00:00:00");
      return;
    }

    const calc = () => {
      const diff = Math.max(0, Math.floor((Date.now() - new Date(clockInAt).getTime()) / 1000));
      const h = String(Math.floor(diff / 3600)).padStart(2, "0");
      const m = String(Math.floor((diff % 3600) / 60)).padStart(2, "0");
      const s = String(diff % 60).padStart(2, "0");
      setElapsed(`${h}:${m}:${s}`);
    };

    calc();
    const id = setInterval(calc, 1000);
    return () => clearInterval(id);
  }, [clockInAt, isClockedIn]);

  return elapsed;
}
