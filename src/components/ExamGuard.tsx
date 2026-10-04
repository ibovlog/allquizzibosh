import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Moon, Sun, Maximize, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { recordTabSwitch } from "@/lib/quiz.functions";

export type ExamSecurity = {
  enableDarkMode: boolean;
  enableAntiCheat: boolean;
  maxTabSwitches: number;
  enableFullscreen: boolean;
  blockCopy: boolean;
};

export function ExamGuard({
  security,
  studentToken,
  active,
  onTerminate,
}: {
  security: ExamSecurity | undefined;
  studentToken: string;
  active: boolean;
  onTerminate: () => void;
}) {
  const record = useServerFn(recordTabSwitch);
  const [dark, setDark] = useState(false);
  const [warning, setWarning] = useState<{ count: number; max: number } | null>(null);
  const [needFs, setNeedFs] = useState(false);
  const last = useRef(0);

  // Dark mode
  useEffect(() => {
    if (!security?.enableDarkMode) return;
    setDark(localStorage.getItem("quizDark") === "1");
  }, [security?.enableDarkMode]);
  useEffect(() => {
    const on = Boolean(security?.enableDarkMode && dark);
    document.documentElement.classList.toggle("dark", on);
    return () => document.documentElement.classList.remove("dark");
  }, [dark, security?.enableDarkMode]);

  // Tab switch detection
  useEffect(() => {
    if (!active || !security?.enableAntiCheat) return;
    const hit = async () => {
      const now = Date.now();
      if (now - last.current < 1500) return;
      last.current = now;
      try {
        const r = await record({ data: { student_token: studentToken } });
        if (r.terminated) onTerminate();
        else if (r.max > 0) setWarning({ count: r.count, max: r.max });
      } catch {
        /* ignore */
      }
    };
    const onVis = () => {
      if (document.visibilityState === "hidden") void hit();
    };
    const onBlur = () => void hit();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("blur", onBlur);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("blur", onBlur);
    };
  }, [active, security?.enableAntiCheat, studentToken, record, onTerminate]);

  // Fullscreen
  useEffect(() => {
    if (!active || !security?.enableFullscreen) return;
    const check = () => setNeedFs(!document.fullscreenElement);
    check();
    document.addEventListener("fullscreenchange", check);
    return () => {
      document.removeEventListener("fullscreenchange", check);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
  }, [active, security?.enableFullscreen]);

  // Copy / right-click / screenshot blocking
  useEffect(() => {
    if (!active || !security?.blockCopy) return;
    const prevent = (e: Event) => e.preventDefault();
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && ["c", "x", "v", "a", "p", "s", "u"].includes(k)) e.preventDefault();
      if (k === "printscreen" || k === "f12") {
        e.preventDefault();
        navigator.clipboard?.writeText("").catch(() => {});
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === "PrintScreen") navigator.clipboard?.writeText("").catch(() => {});
    };
    document.addEventListener("copy", prevent);
    document.addEventListener("cut", prevent);
    document.addEventListener("paste", prevent);
    document.addEventListener("contextmenu", prevent);
    document.addEventListener("selectstart", prevent);
    document.addEventListener("dragstart", prevent);
    document.addEventListener("keydown", onKey);
    document.addEventListener("keyup", onKeyUp);
    document.body.style.userSelect = "none";
    return () => {
      document.removeEventListener("copy", prevent);
      document.removeEventListener("cut", prevent);
      document.removeEventListener("paste", prevent);
      document.removeEventListener("contextmenu", prevent);
      document.removeEventListener("selectstart", prevent);
      document.removeEventListener("dragstart", prevent);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("keyup", onKeyUp);
      document.body.style.userSelect = "";
    };
  }, [active, security?.blockCopy]);

  if (!security) return null;

  return (
    <>
      {security.enableDarkMode && (
        <Button
          size="icon"
          variant="outline"
          aria-label="Gecə rejimi"
          onClick={() => {
            const n = !dark;
            setDark(n);
            localStorage.setItem("quizDark", n ? "1" : "0");
          }}
          className="fixed right-4 top-4 z-40 rounded-full"
        >
          {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
      )}

      {active && needFs && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 p-6">
          <div className="max-w-sm rounded-2xl border border-border bg-card p-6 text-center shadow-lg">
            <Maximize className="mx-auto h-10 w-10 text-primary" />
            <p className="mt-3 text-lg font-semibold text-foreground">Tam ekran tələb olunur</p>
            <p className="mt-1 text-sm text-muted-foreground">İmtahanı davam etdirmək üçün tam ekran rejiminə keçin.</p>
            <Button
              className="mt-4 w-full rounded-lg"
              onClick={() => document.documentElement.requestFullscreen?.().catch(() => {})}
            >
              Tam ekrana keç
            </Button>
          </div>
        </div>
      )}

      {active && warning && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-background/90 p-6">
          <div className="max-w-sm rounded-2xl border border-destructive/40 bg-card p-6 text-center shadow-lg">
            <AlertTriangle className="mx-auto h-10 w-10 text-destructive" />
            <p className="mt-3 text-lg font-semibold text-foreground">Diqqət! İmtahan pəncərəsindən çıxdınız</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Xəbərdarlıq: <b className="text-destructive">{warning.count} / {warning.max}</b>. Limit dolarsa imtahanınız
              ləğv ediləcək.
            </p>
            <Button className="mt-4 w-full rounded-lg" onClick={() => setWarning(null)}>
              Anladım
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
