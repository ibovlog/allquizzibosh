import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Sparkles, ShieldCheck, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

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
  const [seat, setSeat] = useState("");
  const [count, setCount] = useState("20");
  const [order, setOrder] = useState<"sequential" | "random">("random");
  const [error, setError] = useState("");

  function start() {
    const seatNum = parseInt(seat, 10);
    const countNum = parseInt(count, 10);
    if (!seatNum || seatNum < 1 || seatNum > 30) {
      setError("Sıra nömrəsi 1 ilə 30 arasında olmalıdır.");
      return;
    }
    if (!countNum || countNum < 1 || countNum > 75) {
      setError("Sual sayı 1 ilə 75 arasında olmalıdır.");
      return;
    }
    sessionStorage.setItem(
      "quizConfig",
      JSON.stringify({ seat: seatNum, count: countNum, order }),
    );
    navigate({ to: "/quiz" });
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
            Sıra nömrənizi (1–30) daxil edin və testə başlayın.
          </p>

          <div className="mt-8 space-y-5">
            <div className="space-y-2">
              <Label htmlFor="seat">Sıra nömrəsi (1–30)</Label>
              <Input
                id="seat"
                type="number"
                min={1}
                max={30}
                placeholder="Məs. 12"
                value={seat}
                onChange={(e) => setSeat(e.target.value)}
                className="h-12 rounded-xl text-base"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="count">Sual sayı (1–75)</Label>
              <Input
                id="count"
                type="number"
                min={1}
                max={75}
                value={count}
                onChange={(e) => setCount(e.target.value)}
                className="h-12 rounded-xl text-base"
              />
            </div>

            <div className="space-y-2">
              <Label>Ardıcıllıq</Label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setOrder("sequential")}
                  className={cn(
                    "h-12 rounded-xl border text-sm font-medium transition-all",
                    order === "sequential"
                      ? "border-primary bg-primary text-primary-foreground shadow-md"
                      : "border-border bg-card text-foreground hover:border-primary/40",
                  )}
                >
                  Ardıcıl
                </button>
                <button
                  type="button"
                  onClick={() => setOrder("random")}
                  className={cn(
                    "h-12 rounded-xl border text-sm font-medium transition-all",
                    order === "random"
                      ? "border-primary bg-primary text-primary-foreground shadow-md"
                      : "border-border bg-card text-foreground hover:border-primary/40",
                  )}
                >
                  Qarışıq (random)
                </button>
              </div>
            </div>

            {error && (
              <p className="text-sm font-medium text-destructive">{error}</p>
            )}

            <Button
              onClick={start}
              className="group h-12 w-full rounded-xl text-base font-semibold"
            >
              Başla
              <ArrowRight className="ml-1 h-5 w-5 transition-transform group-hover:translate-x-1" />
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
