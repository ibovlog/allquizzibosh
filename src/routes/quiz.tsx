import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Trophy, ArrowLeft, ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  fetchQuestions,
  submitResult,
  shuffle,
  type QuizQuestion,
} from "@/lib/quiz-client";

export const Route = createFileRoute("/quiz")({
  head: () => ({ meta: [{ title: "Test — AI Quiz" }] }),
  component: QuizPage,
});

type Config = { seat: number; count: number; order: "sequential" | "random" };

function QuizPage() {
  const navigate = useNavigate();
  const [config, setConfig] = useState<Config | null>(null);
  const [questions, setQuestions] = useState<QuizQuestion[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [finished, setFinished] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const raw = sessionStorage.getItem("quizConfig");
    if (!raw) {
      navigate({ to: "/" });
      return;
    }
    const cfg = JSON.parse(raw) as Config;
    setConfig(cfg);
    fetchQuestions()
      .then((all) => {
        if (all.length === 0) {
          setLoadError("Hələ heç bir sual yüklənməyib. Admin PDF yükləməlidir.");
          setQuestions([]);
          return;
        }
        const ordered = cfg.order === "random" ? shuffle(all) : all;
        setQuestions(ordered.slice(0, Math.min(cfg.count, ordered.length)));
      })
      .catch(() => setLoadError("Suallar yüklənərkən xəta baş verdi."));
  }, [navigate]);

  const score = useMemo(() => {
    if (!questions) return 0;
    return questions.reduce(
      (acc, q, i) => acc + (answers[i] === q.correct_index ? 1 : 0),
      0,
    );
  }, [questions, answers]);

  async function finish() {
    if (!questions || !config) return;
    setSaving(true);
    try {
      await submitResult({
        seat_number: config.seat,
        score,
        total: questions.length,
      });
    } catch {
      /* ignore save errors for the student */
    }
    setSaving(false);
    setFinished(true);
  }

  if (loadError) {
    return (
      <Centered>
        <p className="text-center text-base text-muted-foreground">{loadError}</p>
        <Button onClick={() => navigate({ to: "/" })} className="mt-6 rounded-xl">
          Geri qayıt
        </Button>
      </Centered>
    );
  }

  if (!questions || !config) {
    return (
      <Centered>
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="mt-4 text-sm text-muted-foreground">Yüklənir…</p>
      </Centered>
    );
  }

  if (finished) {
    const pct = Math.round((score / questions.length) * 100);
    return (
      <Centered>
        <div
          className="w-full max-w-md rounded-3xl border border-border bg-card p-8 text-center"
          style={{ boxShadow: "var(--shadow-card)" }}
        >
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Trophy className="h-8 w-8" />
          </div>
          <h2 className="mt-5 text-2xl font-bold text-foreground">Test bitdi!</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Sıra nömrəsi: {config.seat}
          </p>
          <div className="mt-6 text-5xl font-bold text-primary">
            {score}
            <span className="text-2xl text-muted-foreground">/{questions.length}</span>
          </div>
          <p className="mt-2 text-sm font-medium text-muted-foreground">{pct}% düzgün</p>
          <Button
            onClick={() => navigate({ to: "/" })}
            className="mt-8 h-12 w-full rounded-xl text-base font-semibold"
          >
            Ana səhifəyə qayıt
          </Button>
        </div>
      </Centered>
    );
  }

  const q = questions[current];
  const selected = answers[current];
  const isLast = current === questions.length - 1;
  const progress = ((current + 1) / questions.length) * 100;

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl px-4 py-8">
        <div className="mb-6 flex items-center justify-between text-sm font-medium text-muted-foreground">
          <span>Sıra #{config.seat}</span>
          <span>
            Sual {current + 1} / {questions.length}
          </span>
        </div>
        <div className="mb-8 h-2 w-full overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{ width: `${progress}%`, background: "var(--gradient-accent)" }}
          />
        </div>

        <div
          className="rounded-3xl border border-border bg-card p-6 sm:p-8"
          style={{ boxShadow: "var(--shadow-card)" }}
        >
          <h2 className="text-xl font-semibold leading-relaxed text-foreground">
            {q.prompt}
          </h2>

          <div className="mt-6 space-y-3">
            {q.options.map((opt, i) => {
              const active = selected === i;
              return (
                <button
                  key={i}
                  onClick={() => setAnswers((a) => ({ ...a, [current]: i }))}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-2xl border p-4 text-left text-base transition-all",
                    active
                      ? "border-primary bg-primary/5 text-foreground"
                      : "border-border bg-card text-foreground hover:border-primary/40 hover:bg-secondary/50",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-sm font-semibold",
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border text-muted-foreground",
                    )}
                  >
                    {active ? (
                      <CheckCircle2 className="h-5 w-5" />
                    ) : (
                      String.fromCharCode(65 + i)
                    )}
                  </span>
                  <span>{opt}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between gap-3">
          <Button
            variant="outline"
            onClick={() => setCurrent((c) => Math.max(0, c - 1))}
            disabled={current === 0}
            className="h-12 rounded-xl"
          >
            <ArrowLeft className="mr-1 h-5 w-5" />
            Əvvəlki
          </Button>

          {isLast ? (
            <Button
              onClick={finish}
              disabled={saving}
              className="h-12 flex-1 rounded-xl text-base font-semibold"
            >
              {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : "Testi bitir"}
            </Button>
          ) : (
            <Button
              onClick={() => setCurrent((c) => Math.min(questions.length - 1, c + 1))}
              className="h-12 flex-1 rounded-xl text-base font-semibold"
            >
              Növbəti
              <ArrowRight className="ml-1 h-5 w-5" />
            </Button>
          )}
        </div>
      </div>
    </main>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      {children}
    </main>
  );
}