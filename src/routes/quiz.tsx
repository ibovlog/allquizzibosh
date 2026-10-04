import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Trophy, ArrowLeft, ArrowRight, Loader2, Bell, Flag, XCircle, Check, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ExamGuard, type ExamSecurity } from "@/components/ExamGuard";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { saveProgress, checkBlocked, reportProblem, finishAttempt } from "@/lib/quiz.functions";
import {
  fetchQuestions,
  shuffle,
  permutation,
  applyOptionOrder,
  type QuizQuestion,
  type ResultDetail,
} from "@/lib/quiz-client";

export const Route = createFileRoute("/quiz")({
  head: () => ({ meta: [{ title: "Test — AI Quiz" }] }),
  component: QuizPage,
});

type Config = {
  assessmentId: string;
  assessmentName: string;
  seat: number | null;
  accessKey: string | null;
  participantId: string | null;
  accessKeyId: string | null;
  studentToken: string;
  count: number;
  order: "sequential" | "random";
  rangeStart: number | null;
  rangeEnd: number | null;
  resumeIndex: number;
  resumeAnswers: Record<string, number>;
  shuffleOptions: boolean;
  attemptNumber: number;
  startedAt: string;
  security?: ExamSecurity;
};

type Msg = { id: string; body: string; kind: string; created_at: string };

function QuizPage() {
  const navigate = useNavigate();
  const persist = useServerFn(saveProgress);
  const pollBlocked = useServerFn(checkBlocked);
  const sendReport = useServerFn(reportProblem);
  const finalize = useServerFn(finishAttempt);

  const [config, setConfig] = useState<Config | null>(null);
  const [questions, setQuestions] = useState<QuizQuestion[] | null>(null);
  const [optionOrders, setOptionOrders] = useState<Record<string, number[]>>({});
  const [result, setResult] = useState<{
    score: number;
    total: number;
    blank_count: number;
    details: ResultDetail[];
  } | null>(null);
  const [loadError, setLoadError] = useState("");
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [finished, setFinished] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [reporting, setReporting] = useState(false);
  const [reportText, setReportText] = useState("");

  useEffect(() => {
    const raw = sessionStorage.getItem("quizConfig");
    if (!raw) {
      navigate({ to: "/" });
      return;
    }
    const cfg = JSON.parse(raw) as Config;
    setConfig(cfg);
    setAnswers(cfg.resumeAnswers ?? {});
    fetchQuestions(cfg.assessmentId)
      .then((all) => {
        if (all.length === 0) {
          setLoadError("Hələ heç bir sual yüklənməyib. Admin PDF yükləməlidir.");
          setQuestions([]);
          return;
        }
        // keep a stable question order across refreshes
        const savedOrder = sessionStorage.getItem("quizOrder");
        let ordered: QuizQuestion[];
        if (savedOrder) {
          const ids = JSON.parse(savedOrder) as string[];
          const byId = new Map(all.map((q) => [q.id, q]));
          ordered = ids.map((id) => byId.get(id)).filter(Boolean) as QuizQuestion[];
          if (ordered.length === 0) ordered = all;
        } else {
          // Restrict to the chosen PDF question-number range (if any).
          let pool = all;
          if (cfg.rangeStart != null && cfg.rangeEnd != null) {
            pool = all.filter(
              (q) =>
                q.pdf_number != null &&
                q.pdf_number >= cfg.rangeStart! &&
                q.pdf_number <= cfg.rangeEnd!,
            );
            if (pool.length === 0) pool = all;
          }
          const base =
            cfg.order === "random"
              ? shuffle(pool)
              : [...pool].sort((a, b) => (a.pdf_number ?? a.position) - (b.pdf_number ?? b.position));
          ordered = base.slice(0, Math.min(cfg.count, base.length));
          sessionStorage.setItem("quizOrder", JSON.stringify(ordered.map((q) => q.id)));
        }
        // dynamic answer-choice shuffling (stable across refreshes within an attempt)
        const orders: Record<string, number[]> = {};
        if (cfg.shuffleOptions) {
          let optMap: Record<string, number[]> = {};
          const savedOpts = sessionStorage.getItem("quizOptions");
          if (savedOpts) {
            try { optMap = JSON.parse(savedOpts) as Record<string, number[]>; } catch { optMap = {}; }
          }
          ordered = ordered.map((q) => {
            let order = optMap[q.id];
            if (!order || order.length !== q.options.length) {
              order = permutation(q.options.length);
              optMap[q.id] = order;
            }
            orders[q.id] = order;
            return applyOptionOrder(q, order);
          });
          sessionStorage.setItem("quizOptions", JSON.stringify(optMap));
        } else {
          ordered.forEach((q) => {
            orders[q.id] = q.options.map((_, i) => i);
          });
        }
        setOptionOrders(orders);
        setQuestions(ordered);
        setCurrent(Math.min(cfg.resumeIndex ?? 0, Math.max(0, ordered.length - 1)));
      })
      .catch(() => setLoadError("Suallar yüklənərkən xəta baş verdi."));
  }, [navigate]);

  const kick = useCallback(
    (reason: string) => {
      toast.error(reason);
      sessionStorage.removeItem("quizConfig");
      sessionStorage.removeItem("quizOrder");
      navigate({ to: "/" });
    },
    [navigate],
  );

  const terminateCheat = useCallback(() => {
    kick("Qaydalar pozuldu: limitdən çox pəncərə dəyişdiyiniz üçün imtahan bağlandı.");
  }, [kick]);

  // Realtime: admin messages + instant block via participants table.
  useEffect(() => {
    if (!config) return;
    const channel = supabase
      .channel(`quiz-${config.assessmentId}-${config.seat ?? config.accessKey}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "admin_messages" },
        (payload) => {
          const m = payload.new as {
            id: string; body: string; kind: string; created_at: string;
            assessment_id: string | null; seat_number: number | null;
          };
          const forAssessment = m.assessment_id === null || m.assessment_id === config.assessmentId;
          const forSeat = m.seat_number === null || m.seat_number === config.seat;
          if (!forAssessment || !forSeat) return;
          setMessages((prev) => [{ id: m.id, body: m.body, kind: m.kind, created_at: m.created_at }, ...prev]);
          if (m.kind === "warning") toast.warning(m.body);
          else toast.info(m.body);
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "participants" },
        (payload) => {
          const p = payload.new as { id: string; blocked: boolean };
          if (config.participantId && p.id === config.participantId && p.blocked) {
            kick("Girişiniz admin tərəfindən bloklandı.");
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [config, kick]);

  // Polling fallback (covers access-key logins + reliability).
  useEffect(() => {
    if (!config || finished) return;
    if (!config.participantId && !config.accessKeyId) return;
    const t = setInterval(async () => {
      try {
        const res = await pollBlocked({
          data: {
            student_token: config.studentToken,
            participant_id: config.participantId,
            access_key_id: config.accessKeyId,
          },
        });
        if (res.blocked) kick("Girişiniz admin tərəfindən bloklandı.");
      } catch {
        /* ignore */
      }
    }, 4000);
    return () => clearInterval(t);
  }, [config, finished, pollBlocked, kick]);

  // Save progress (debounced) when answers / position change.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!config || finished || !questions) return;
    if (!config.participantId && !config.accessKeyId) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      persist({
        data: {
          student_token: config.studentToken,
          participant_id: config.participantId,
          access_key_id: config.accessKeyId,
          current_index: current,
          answers,
        },
      }).catch(() => {});
    }, 800);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [answers, current, config, finished, questions, persist]);

  const unanswered = useMemo(
    () => (questions ? questions.filter((q) => answers[q.id] === undefined).length : 0),
    [questions, answers],
  );

  async function doFinish() {
    if (!questions || !config) return;
    setConfirmOpen(false);
    setSaving(true);
    // Convert each displayed answer to the ORIGINAL option index, since the
    // server scores against the original (unshuffled) option order.
    const payload = questions.map((q) => {
      const displayed = answers[q.id];
      const order = optionOrders[q.id];
      const chosen =
        displayed === undefined
          ? null
          : order && order[displayed] !== undefined
            ? order[displayed]
            : displayed;
      return { question_id: q.id, chosen };
    });
    try {
      const res = await finalize({
        data: {
          student_token: config.studentToken,
          assessment_id: config.assessmentId,
          participant_id: config.participantId,
          access_key_id: config.accessKeyId,
          seat_number: config.seat ?? 0,
          access_key: config.accessKey,
          attempt_number: config.attemptNumber,
          started_at: config.startedAt,
          answers: payload,
        },
      });
      setResult({
        score: res.score,
        total: res.total,
        blank_count: res.blank_count,
        details: res.details as ResultDetail[],
      });
    } catch {
      setSaving(false);
      toast.error("Nəticə göndərilmədi. Yenidən cəhd edin.");
      return;
    }
    // clear saved order/options so the next attempt reshuffles
    sessionStorage.removeItem("quizOrder");
    sessionStorage.removeItem("quizOptions");
    setSaving(false);
    setFinished(true);
  }

  async function submitReport() {
    if (!config || !questions) return;
    if (!reportText.trim()) return toast.error("Problemi qısaca yazın.");
    try {
      await sendReport({
        data: {
          student_token: config.studentToken,
          assessment_id: config.assessmentId,
          seat_number: config.seat,
          pdf_number: questions[current]?.pdf_number ?? null,
          question_id: questions[current]?.id ?? null,
          question_text: questions[current]?.prompt ?? null,
          access_key: config.accessKey,
          body: reportText.trim(),
        },
      });
      toast.success("Bildiriş adminə göndərildi.");
      setReportText("");
      setReporting(false);
    } catch {
      toast.error("Bildiriş göndərilmədi.");
    }
  }

  if (loadError) {
    return (
      <Centered>
        <p className="text-center text-base text-muted-foreground">{loadError}</p>
        <Button onClick={() => navigate({ to: "/" })} className="mt-6 rounded-xl">Geri qayıt</Button>
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

  if (finished && result) {
    const { score, total, blank_count: blank, details } = result;
    const pct = total > 0 ? Math.round((score / total) * 100) : 0;
    const wrong = total - score - blank;
    const reviewList = details
      .map((d, idx) => ({ d, idx }))
      .filter(({ d }) => d.chosen !== d.correct);
    return (
      <main className="min-h-screen bg-background">
        <div className="mx-auto max-w-2xl px-4 py-8">
          <div className="rounded-3xl border border-border bg-card p-8 text-center" style={{ boxShadow: "var(--shadow-card)" }}>
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Trophy className="h-8 w-8" />
            </div>
            <h2 className="mt-5 text-2xl font-bold text-foreground">Test bitdi!</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {config.assessmentName}
              {config.seat ? ` · Sıra nömrəsi: ${config.seat}` : ""} · Cəhd {config.attemptNumber}
            </p>
            <div className="mt-6 text-5xl font-bold text-primary">
              {score}
              <span className="text-2xl text-muted-foreground">/{total}</span>
            </div>
            <p className="mt-2 text-sm font-medium text-muted-foreground">{pct}% düzgün</p>
            <div className="mt-5 grid grid-cols-3 gap-2 text-sm">
              <div className="rounded-xl border border-success/40 bg-success/10 p-3">
                <p className="text-lg font-bold text-success">{score}</p>
                <p className="text-xs text-muted-foreground">Düz</p>
              </div>
              <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3">
                <p className="text-lg font-bold text-destructive">{wrong}</p>
                <p className="text-xs text-muted-foreground">Səhv</p>
              </div>
              <div className="rounded-xl border border-border bg-secondary/40 p-3">
                <p className="text-lg font-bold text-foreground">{blank}</p>
                <p className="text-xs text-muted-foreground">Boş</p>
              </div>
            </div>
          </div>

          <h3 className="mb-3 mt-8 text-lg font-bold text-foreground">Səhv və boş suallar</h3>
          {reviewList.length === 0 ? (
            <p className="rounded-2xl border border-success/40 bg-success/10 p-5 text-center text-sm font-medium text-success">
              Bütün suallara düzgün cavab verdiniz! 🎉
            </p>
          ) : (
          <div className="space-y-3">
            {reviewList.map(({ d, idx }) => {
              const i = idx;
              const chosen = d.chosen;
              const ok = chosen === d.correct;
              return (
                <div key={i} className="rounded-2xl border border-border bg-card p-5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium text-foreground">{i + 1}. {d.prompt}</p>
                    <div className="flex shrink-0 items-center gap-2">
                      {d.pdf_number != null && (
                        <span className="rounded-md bg-secondary px-2 py-0.5 text-xs font-semibold text-muted-foreground">PDF #{d.pdf_number}</span>
                      )}
                      {ok ? <Check className="h-5 w-5 text-success" /> : <XCircle className="h-5 w-5 text-destructive" />}
                    </div>
                  </div>
                  <div className="mt-3 space-y-2">
                    {d.options.map((o, oi) => {
                      const isCorrect = oi === d.correct;
                      const isChosen = oi === chosen;
                      return (
                        <div
                          key={oi}
                          className={cn(
                            "rounded-lg border px-3 py-2 text-sm",
                            isCorrect
                              ? "border-success/50 bg-success/10 font-medium text-success"
                              : isChosen
                                ? "border-destructive/50 bg-destructive/10 text-destructive"
                                : "border-border text-muted-foreground",
                          )}
                        >
                          {String.fromCharCode(65 + oi)}. {o}
                          {isChosen && !isCorrect && " — sizin cavabınız"}
                          {isCorrect && " — doğru cavab"}
                        </div>
                      );
                    })}
                    {chosen === null && (
                      <p className="text-xs font-medium text-muted-foreground">Cavablanmayıb</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          )}

          <Button onClick={() => navigate({ to: "/" })} className="mt-8 h-12 w-full rounded-xl text-base font-semibold">
            Ana səhifəyə qayıt
          </Button>
        </div>
      </main>
    );
  }

  const q = questions[current];
  const selected = answers[q.id];
  const isLast = current === questions.length - 1;
  const progress = ((current + 1) / questions.length) * 100;

  return (
    <main className="min-h-screen bg-background">
      <ExamGuard
        security={config.security}
        studentToken={config.studentToken}
        active={!finished}
        onTerminate={terminateCheat}
      />
      <div className="mx-auto max-w-2xl px-4 py-8">
        {messages.length > 0 && (
          <div
            className={cn(
              "mb-5 flex items-start gap-3 rounded-2xl border p-4 text-sm",
              messages[0].kind === "warning"
                ? "border-destructive/40 bg-destructive/10 text-destructive"
                : "border-primary/40 bg-primary/10 text-foreground",
            )}
          >
            <Bell className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-semibold">Admindən ismarıc</p>
              <p className="mt-0.5">{messages[0].body}</p>
            </div>
          </div>
        )}
        <div className="mb-2 flex items-center justify-between text-sm font-medium text-muted-foreground">
          <span>
            {config.assessmentName}
            {config.seat ? ` · Sıra #${config.seat}` : ""}
          </span>
          <span className="text-right">
            {current + 1} / {questions.length}
            {q.pdf_number != null && (
              <span className="ml-2 rounded-md bg-secondary px-2 py-0.5 text-xs font-semibold text-primary">PDF #{q.pdf_number}</span>
            )}
          </span>
        </div>
        <div className="mb-6 h-2 w-full overflow-hidden rounded-full bg-secondary">
          <div className="h-full rounded-full transition-all duration-300" style={{ width: `${progress}%`, background: "var(--gradient-accent)" }} />
        </div>

        <div className="rounded-3xl border border-border bg-card p-6 sm:p-8" style={{ boxShadow: "var(--shadow-card)" }}>
          <h2 className="text-xl font-semibold leading-relaxed text-foreground">{q.prompt}</h2>
          <div className="mt-6 space-y-3">
            {q.options.map((opt, i) => {
              const active = selected === i;
              return (
                <button
                  key={i}
                  onClick={() => setAnswers((a) => ({ ...a, [q.id]: i }))}
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
                      active ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground",
                    )}
                  >
                    {active ? <CheckCircle2 className="h-5 w-5" /> : String.fromCharCode(65 + i)}
                  </span>
                  <span>{opt}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Prev / Next directly under the question */}
        <div className="mt-5 flex items-center justify-between gap-3">
          <Button
            variant="outline"
            onClick={() => setCurrent((c) => Math.max(0, c - 1))}
            disabled={current === 0}
            className="h-12 rounded-xl"
          >
            <ArrowLeft className="mr-1 h-5 w-5" /> Geri
          </Button>
          <Button
            variant="outline"
            onClick={() => setCurrent((c) => Math.min(questions.length - 1, c + 1))}
            disabled={isLast}
            className="h-12 flex-1 rounded-xl text-base font-semibold"
          >
            Növbəti <ArrowRight className="ml-1 h-5 w-5" />
          </Button>
        </div>

        {/* Finish test — always visible */}
        <Button
          onClick={() => setConfirmOpen(true)}
          disabled={saving}
          className="mt-3 h-12 w-full rounded-xl text-base font-semibold"
        >
          {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : "Testi bitir"}
        </Button>

        {/* Numbered navigation below the buttons */}
        <div className="mt-5 grid grid-cols-6 gap-2 sm:grid-cols-10">
          {questions.map((qq, i) => {
            const isCurrent = i === current;
            const answered = answers[qq.id] !== undefined;
            return (
              <button
                key={qq.id}
                onClick={() => setCurrent(i)}
                className={cn(
                  "flex h-10 items-center justify-center rounded-xl border text-sm font-semibold transition-all",
                  isCurrent
                    ? "border-primary bg-primary text-primary-foreground shadow-md"
                    : answered
                      ? "border-primary/40 bg-primary/10 text-primary"
                      : "border-border bg-card text-muted-foreground hover:border-primary/40",
                )}
              >
                {i + 1}
              </button>
            );
          })}
        </div>

        {/* Report a problem */}
        <div className="mt-6">
          {reporting ? (
            <div className="rounded-2xl border border-border bg-card p-4">
              <p className="mb-2 text-sm font-medium text-foreground">
                Problemi bildir {q.pdf_number != null && <span className="text-muted-foreground">(PDF #{q.pdf_number})</span>}
              </p>
              <textarea
                value={reportText}
                onChange={(e) => setReportText(e.target.value)}
                rows={2}
                className="w-full rounded-xl border border-border bg-background p-3 text-sm"
                placeholder="Məsələn: variantlar səhvdir…"
              />
              <div className="mt-2 flex gap-2">
                <Button size="sm" onClick={submitReport} className="rounded-lg">Göndər</Button>
                <Button size="sm" variant="outline" onClick={() => setReporting(false)} className="rounded-lg">Ləğv et</Button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setReporting(true)}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-destructive"
            >
              <Flag className="h-4 w-4" /> Problemi bildir
            </button>
          )}
        </div>
      </div>

      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl border border-border bg-card p-6 text-center" style={{ boxShadow: "var(--shadow-card)" }}>
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <AlertTriangle className="h-7 w-7" />
            </div>
            <h3 className="mt-4 text-lg font-bold text-foreground">Testi bitirmək istədiyinizə əminsiniz?</h3>
            {unanswered > 0 && (
              <p className="mt-2 text-sm font-medium text-destructive">
                Sizin {unanswered} cavablandırılmamış sualınız var.
              </p>
            )}
            <div className="mt-6 flex flex-col gap-2">
              <Button onClick={doFinish} disabled={saving} className="h-11 rounded-xl text-base font-semibold">
                {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : "Bəli, bitir və nəticəni göstər"}
              </Button>
              <Button variant="outline" onClick={() => setConfirmOpen(false)} className="h-11 rounded-xl">
                {unanswered > 0 ? "Cavablandırılmamış suallara qayıt" : "Ləğv et"}
              </Button>
            </div>
          </div>
        </div>
      )}
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