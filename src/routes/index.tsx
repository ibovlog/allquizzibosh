import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles, ShieldCheck, ArrowRight, ArrowLeft, Loader2, Shuffle, ListOrdered } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { joinQuiz } from "@/lib/quiz.functions";
import { getDeviceId } from "@/lib/quiz-client";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "AI Quiz — PDF-dən ağıllı test" },
      { name: "description", content: "PDF və ya Word yükləyin, süni intellekt onu avtomatik test formatına çevirsin. Assessment adı və giriş məlumatınızı daxil edib testə başlayın." },
      { property: "og:title", content: "AI Quiz — PDF-dən ağıllı test" },
      { property: "og:description", content: "PDF/Word-dən süni intellektlə yaradılan testlər." },
    ],
  }),
  component: Index,
});

type Loaded = {
  id: string;
  name: string;
  login_mode: "seat" | "key" | "both";
  seat_min: number;
  seat_max: number;
  question_count: number;
  order_mode: "random" | "sequential";
  available: number;
  allow_range: boolean;
  pdf_numbers: number[];
};

function Index() {
  const navigate = useNavigate();
  const join = useServerFn(joinQuiz);
  const [assessmentName, setAssessmentName] = useState("");
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [seat, setSeat] = useState("");
  const [accessKey, setAccessKey] = useState("");
  const [order, setOrder] = useState<"random" | "sequential">("random");
  const [count, setCount] = useState("");
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function lookup() {
    setError("");
    if (!assessmentName.trim()) {
      setError("Assessment adını daxil edin.");
      return;
    }
    setLoading(true);
    try {
      const { data: a } = await supabase
        .from("assessments")
        .select("id, name, login_mode, seat_min, seat_max, question_count, order_mode, is_open, allow_range")
        .ilike("name", assessmentName.trim())
        .maybeSingle();
      if (!a) {
        setError("Bu adda assessment tapılmadı.");
        return;
      }
      if (!a.is_open) {
        setError("Bu assessment hazırda bağlıdır.");
        return;
      }
      const { data: qrows } = await supabase
        .from("questions")
        .select("pdf_number")
        .eq("assessment_id", a.id);
      const available = qrows?.length ?? 0;
      const pdfNumbers = (qrows ?? [])
        .map((r) => r.pdf_number)
        .filter((n): n is number => typeof n === "number")
        .sort((x, y) => x - y);
      if (available === 0) {
        setError("Bu assessmentdə hələ sual yoxdur.");
        return;
      }
      const lm = (a.login_mode as Loaded["login_mode"]) ?? "seat";
      const allowRange = Boolean(a.allow_range) && pdfNumbers.length > 0;
      setLoaded({
        id: a.id,
        name: a.name,
        login_mode: lm,
        seat_min: a.seat_min,
        seat_max: a.seat_max,
        question_count: a.question_count,
        order_mode: (a.order_mode as "random" | "sequential") ?? "random",
        available,
        allow_range: allowRange,
        pdf_numbers: pdfNumbers,
      });
      setOrder((a.order_mode as "random" | "sequential") ?? "random");
      setCount(String(Math.min(a.question_count, available)));
      if (allowRange) {
        setRangeStart(String(pdfNumbers[0]));
        setRangeEnd(String(pdfNumbers[pdfNumbers.length - 1]));
      }
    } catch {
      setError("Yoxlama zamanı xəta baş verdi.");
    } finally {
      setLoading(false);
    }
  }

  async function start() {
    if (!loaded) return;
    setError("");
    const needSeat = loaded.login_mode === "seat" || loaded.login_mode === "both";
    const needKey = loaded.login_mode === "key" || loaded.login_mode === "both";
    const seatNum = parseInt(seat, 10);
    if (needSeat && (!seatNum || seatNum < 1)) {
      setError("Düzgün sıra nömrəsi daxil edin.");
      return;
    }
    if (needKey && !accessKey.trim()) {
      setError("Giriş açarını daxil edin.");
      return;
    }
    // PDF range validation + in-range availability
    let rStart: number | null = null;
    let rEnd: number | null = null;
    let inRange = loaded.available;
    if (loaded.allow_range) {
      const pdfMin = loaded.pdf_numbers[0];
      const pdfMax = loaded.pdf_numbers[loaded.pdf_numbers.length - 1];
      rStart = parseInt(rangeStart, 10);
      rEnd = parseInt(rangeEnd, 10);
      if (!rStart || !rEnd) {
        setError("PDF sual aralığını daxil edin.");
        return;
      }
      if (rStart > rEnd) {
        setError("Başlanğıc nömrəsi son nömrədən böyük ola bilməz.");
        return;
      }
      if (rStart < pdfMin || rEnd > pdfMax) {
        setError(`PDF nömrələri ${pdfMin}–${pdfMax} aralığında olmalıdır.`);
        return;
      }
      inRange = loaded.pdf_numbers.filter((n) => n >= rStart! && n <= rEnd!).length;
      if (inRange === 0) {
        setError("Seçilmiş aralıqda sual yoxdur.");
        return;
      }
    }
    const chosenCount = Math.max(1, Math.min(parseInt(count, 10) || inRange, inRange));
    setLoading(true);
    try {
      const res = await join({
        data: {
          assessment_name: loaded.name,
          seat_number: needSeat ? seatNum : null,
          access_key: needKey ? accessKey.trim() : null,
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
          seat: needSeat ? seatNum : null,
          accessKey: needKey ? accessKey.trim() : null,
          participantId: res.participantId,
          accessKeyId: res.accessKeyId,
          count: chosenCount,
          order,
          rangeStart: rStart,
          rangeEnd: rEnd,
          resumeIndex: res.resumeIndex ?? 0,
          resumeAnswers: res.resumeAnswers ?? {},
          shuffleOptions: res.assessment.shuffle_options ?? true,
          attemptNumber: res.attemptNumber ?? 1,
          startedAt: res.startedAt ?? new Date().toISOString(),
        }),
      );
      sessionStorage.removeItem("quizOrder");
      sessionStorage.removeItem("quizOptions");
      navigate({ to: "/quiz" });
    } catch {
      setError("Giriş zamanı xəta baş verdi. Yenidən cəhd edin.");
    } finally {
      setLoading(false);
    }
  }

  const needSeat = loaded && (loaded.login_mode === "seat" || loaded.login_mode === "both");
  const needKey = loaded && (loaded.login_mode === "key" || loaded.login_mode === "both");
  const rs = parseInt(rangeStart, 10);
  const re = parseInt(rangeEnd, 10);
  const inRangeCount =
    loaded && loaded.allow_range && rs && re && rs <= re
      ? loaded.pdf_numbers.filter((n) => n >= rs && n <= re).length
      : loaded?.available ?? 0;

  return (
    <main className="relative min-h-screen overflow-hidden bg-background">
      <div className="pointer-events-none absolute inset-0 opacity-90" style={{ background: "var(--gradient-hero)" }} />
      <div className="pointer-events-none absolute inset-0 bg-background/70 backdrop-blur-3xl" />

      <div className="relative z-10 mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center px-4 py-12">
        <div className="mb-6 flex items-center gap-2 rounded-full border border-border bg-card/80 px-4 py-1.5 text-sm font-medium text-primary shadow-sm">
          <Sparkles className="h-4 w-4" />
          Quiz App — by @_.ibosh
        </div>

        <div className="w-full rounded-3xl border border-border bg-card p-7 sm:p-9" style={{ boxShadow: "var(--shadow-card)" }}>
          <h1 className="text-center text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Quizə xoş gəlmisiniz
          </h1>
          <p className="mt-2 text-center text-sm text-muted-foreground">
            {loaded ? `"${loaded.name}" — giriş məlumatlarını daxil edin.` : "Assessment adını daxil edib davam edin."}
          </p>

          {!loaded ? (
            <div className="mt-8 space-y-5">
              <div className="space-y-2">
                <Label htmlFor="assessment">Assessment adı</Label>
                <Input
                  id="assessment"
                  placeholder="Məs. quiz1234"
                  value={assessmentName}
                  onChange={(e) => setAssessmentName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && lookup()}
                  className="h-12 rounded-xl text-base"
                />
              </div>
              {error && <p className="text-sm font-medium text-destructive">{error}</p>}
              <Button onClick={lookup} disabled={loading} className="group h-12 w-full rounded-xl text-base font-semibold">
                {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : (<>Davam et <ArrowRight className="ml-1 h-5 w-5 transition-transform group-hover:translate-x-1" /></>)}
              </Button>
            </div>
          ) : (
            <div className="mt-8 space-y-5">
              {needSeat && (
                <div className="space-y-2">
                  <Label htmlFor="seat">Sıra nömrəsi ({loaded.seat_min}–{loaded.seat_max})</Label>
                  <Input
                    id="seat"
                    type="number"
                    min={loaded.seat_min}
                    max={loaded.seat_max}
                    placeholder={`Məs. ${loaded.seat_min}`}
                    value={seat}
                    onChange={(e) => setSeat(e.target.value)}
                    className="h-12 rounded-xl text-base"
                  />
                </div>
              )}
              {needKey && (
                <div className="space-y-2">
                  <Label htmlFor="key">Giriş açarı</Label>
                  <Input
                    id="key"
                    placeholder="Məs. QUIZ1234"
                    value={accessKey}
                    onChange={(e) => setAccessKey(e.target.value)}
                    className="h-12 rounded-xl text-base"
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label>Sualların sırası</Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setOrder("sequential")}
                    className={cn(
                      "flex items-center justify-center gap-2 rounded-xl border p-3 text-sm font-medium transition-all",
                      order === "sequential" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground",
                    )}
                  >
                    <ListOrdered className="h-4 w-4" /> Ardıcıl
                  </button>
                  <button
                    type="button"
                    onClick={() => setOrder("random")}
                    className={cn(
                      "flex items-center justify-center gap-2 rounded-xl border p-3 text-sm font-medium transition-all",
                      order === "random" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground",
                    )}
                  >
                    <Shuffle className="h-4 w-4" /> Qarışıq
                  </button>
                </div>
              </div>

              {loaded.allow_range && (
                <div className="space-y-2">
                  <Label>PDF sual aralığı (#{loaded.pdf_numbers[0]}–#{loaded.pdf_numbers[loaded.pdf_numbers.length - 1]})</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={loaded.pdf_numbers[0]}
                      max={loaded.pdf_numbers[loaded.pdf_numbers.length - 1]}
                      value={rangeStart}
                      onChange={(e) => setRangeStart(e.target.value)}
                      className="h-12 rounded-xl text-base"
                      aria-label="Başlanğıc"
                    />
                    <span className="text-muted-foreground">–</span>
                    <Input
                      type="number"
                      min={loaded.pdf_numbers[0]}
                      max={loaded.pdf_numbers[loaded.pdf_numbers.length - 1]}
                      value={rangeEnd}
                      onChange={(e) => setRangeEnd(e.target.value)}
                      className="h-12 rounded-xl text-base"
                      aria-label="Son"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">Bu aralıqda {inRangeCount} sual var.</p>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="count">Sual sayı (maksimum {inRangeCount})</Label>
                <Input
                  id="count"
                  type="number"
                  min={1}
                  max={inRangeCount}
                  value={count}
                  onChange={(e) => setCount(e.target.value)}
                  className="h-12 rounded-xl text-base"
                />
              </div>

              {error && <p className="text-sm font-medium text-destructive">{error}</p>}

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => { setLoaded(null); setError(""); }} className="h-12 rounded-xl">
                  <ArrowLeft className="h-5 w-5" />
                </Button>
                <Button onClick={start} disabled={loading} className="group h-12 flex-1 rounded-xl text-base font-semibold">
                  {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : (<>Başla <ArrowRight className="ml-1 h-5 w-5 transition-transform group-hover:translate-x-1" /></>)}
                </Button>
              </div>
            </div>
          )}

          <div className="mt-7 border-t border-border pt-5 text-center">
            <Link to="/admin" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-primary">
              <ShieldCheck className="h-4 w-4" />
              Admin girişi
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}