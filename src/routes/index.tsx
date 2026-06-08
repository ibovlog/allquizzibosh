import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles, ShieldCheck, ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { joinQuiz } from "@/lib/quiz.functions";
import { getDeviceId } from "@/lib/quiz-client";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "AI Quiz — PDF-dən ağıllı test" },
      { name: "description", content: "PDF yükləyin, süni intellekt onu avtomatik test (quiz) formatına çevirsin. Sıra nömrənizi daxil edib testə başlayın." },
      { property: "og:title", content: "AI Quiz — PDF-dən ağıllı test" },
      { property: "og:description", content: "PDF-dən süni intellektlə yaradılan testlər." },
    ],
  }),
  component: Index,
});

function Index() {
  const navigate = useNavigate();
  const join = useServerFn(joinQuiz);
  const [assessmentName, setAssessmentName] = useState("");
  const [seat, setSeat] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function start() {
    setError("");
    const seatNum = parseInt(seat, 10);
    if (!assessmentName.trim()) {
      setError("Assessment adını daxil edin.");
      return;
    }
    if (!seatNum || seatNum < 1) {
      setError("Düzgün sıra nömrəsi daxil edin.");
      return;
    }
    setLoading(true);
    try {
      const res = await join({
        data: {
          assessment_name: assessmentName.trim(),
          seat_number: seatNum,
          device_id: getDeviceId(),
        },
      });
      if (!res.ok) {
        setError(res.reason);
        return;
      }
      sessionStorage.setItem(
        "quizConfig",
        JSON.stringify({
          assessmentId: res.assessment.id,
          assessmentName: res.assessment.name,
          seat: seatNum,
          count: res.assessment.question_count,
          order: res.assessment.order_mode,
        }),
      );
      navigate({ to: "/quiz" });
    } catch {
      setError("Giriş zamanı xəta baş verdi. Yenidən cəhd edin.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-background">
      <div
        className="pointer-events-none absolute inset-0 opacity-90"
        style={{ background: "var(--gradient-hero)" }}
      />
      <div className="pointer-events-none absolute inset-0 bg-background/70 backdrop-blur-3xl" />

      <div className="relative z-10 mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center px-4 py-12">
        <div className="mb-6 flex items-center gap-2 rounded-full border border-border bg-card/80 px-4 py-1.5 text-sm font-medium text-primary shadow-sm">
          <Sparkles className="h-4 w-4" />
          AI əsaslı Quiz
        </div>

        <div
          className="w-full rounded-3xl border border-border bg-card p-7 sm:p-9"
          style={{ boxShadow: "var(--shadow-card)" }}
        >
          <h1 className="text-center text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Quizə xoş gəlmisiniz
          </h1>
          <p className="mt-2 text-center text-sm text-muted-foreground">
            Assessment adını və sıra nömrənizi daxil edib testə başlayın.
          </p>

          <div className="mt-8 space-y-5">
            <div className="space-y-2">
              <Label htmlFor="assessment">Assessment adı</Label>
              <Input
                id="assessment"
                placeholder="Məs. karyerasuallar"
                value={assessmentName}
                onChange={(e) => setAssessmentName(e.target.value)}
                className="h-12 rounded-xl text-base"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="seat">Sıra nömrəsi</Label>
              <Input
                id="seat"
                type="number"
                min={1}
                placeholder="Məs. 12"
                value={seat}
                onChange={(e) => setSeat(e.target.value)}
                className="h-12 rounded-xl text-base"
                onKeyDown={(e) => e.key === "Enter" && start()}
              />
            </div>

            {error && (
              <p className="text-sm font-medium text-destructive">{error}</p>
            )}

            <Button
              onClick={start}
              disabled={loading}
              className="group h-12 w-full rounded-xl text-base font-semibold"
            >
              {loading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  Başla
                  <ArrowRight className="ml-1 h-5 w-5 transition-transform group-hover:translate-x-1" />
                </>
              )}
            </Button>
          </div>

          <div className="mt-7 border-t border-border pt-5 text-center">
            <Link
              to="/admin"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
            >
              <ShieldCheck className="h-4 w-4" />
              Admin girişi
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
