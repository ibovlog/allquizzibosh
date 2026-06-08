import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  ShieldCheck,
  Upload,
  Loader2,
  FileText,
  Trash2,
  ArrowLeft,
  ListChecks,
  BarChart3,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  adminLogin,
  getAdminData,
  extractQuiz,
  clearQuestions,
  clearResults,
} from "@/lib/quiz.functions";
import { pdfToImages } from "@/lib/pdf-to-images";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Admin — AI Quiz" }] }),
  component: AdminPage,
});

type AdminResult = {
  id: string;
  seat_number: number;
  score: number;
  total: number;
  created_at: string;
};
type AdminQuestion = {
  id: string;
  prompt: string;
  options: string[];
  correct_index: number;
  position: number;
};

function AdminPage() {
  const login = useServerFn(adminLogin);
  const fetchData = useServerFn(getAdminData);
  const runExtract = useServerFn(extractQuiz);
  const wipeQuestions = useServerFn(clearQuestions);
  const wipeResults = useServerFn(clearResults);

  const [password, setPassword] = useState("");
  const [authed, setAuthed] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);
  const [results, setResults] = useState<AdminResult[]>([]);
  const [questions, setQuestions] = useState<AdminQuestion[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState("");

  async function refresh(pw: string) {
    const data = await fetchData({ data: { password: pw } });
    setResults(data.results as AdminResult[]);
    setQuestions(
      (data.questions as AdminQuestion[]).map((q) => ({
        ...q,
        options: Array.isArray(q.options) ? q.options : [],
      })),
    );
  }

  async function doLogin() {
    if (!password.trim()) {
      toast.error("Zəhmət olmasa parolu daxil edin.");
      return;
    }
    setLoggingIn(true);
    try {
      const res = await login({ data: { password } });
      if (!res.ok) {
        toast.error("Parol yanlışdır.");
        return;
      }
      await refresh(password);
      setAuthed(true);
    } catch {
      toast.error("Giriş zamanı xəta baş verdi.");
    } finally {
      setLoggingIn(false);
    }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.type !== "application/pdf") {
      toast.error("Zəhmət olmasa PDF faylı seçin.");
      return;
    }
    setUploading(true);
    try {
      setUploadStatus("PDF səhifələri oxunur…");
      const images = await pdfToImages(file, { maxPages: 30 });
      if (images.length === 0) {
        toast.error("PDF-dən səhifə oxunmadı.");
        return;
      }
      setUploadStatus(
        `${images.length} səhifə AI ilə təhlil olunur… (bir az çəkə bilər)`,
      );
      const res = await runExtract({
        data: { password, images, replace: true },
      });
      toast.success(`${res.count} sual yaradıldı!`);
      await refresh(password);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("RATE_LIMIT")) {
        toast.error("AI çox sorğu aldı. Bir az sonra cəhd edin.");
      } else if (msg.includes("CREDITS_EXHAUSTED")) {
        toast.error("AI kreditləri bitib. Workspace-ə kredit əlavə edin.");
      } else {
        toast.error(msg || "PDF emalı zamanı xəta baş verdi.");
      }
    } finally {
      setUploading(false);
      setUploadStatus("");
    }
  }

  if (!authed) {
    return (
      <main className="relative flex min-h-screen items-center justify-center bg-background px-4">
        <div
          className="pointer-events-none absolute inset-0 opacity-90"
          style={{ background: "var(--gradient-hero)" }}
        />
        <div className="pointer-events-none absolute inset-0 bg-background/75 backdrop-blur-3xl" />
        <div
          className="relative z-10 w-full max-w-sm rounded-3xl border border-border bg-card p-8"
          style={{ boxShadow: "var(--shadow-card)" }}
        >
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <ShieldCheck className="h-7 w-7" />
          </div>
          <h1 className="mt-5 text-center text-2xl font-bold text-foreground">
            Admin girişi
          </h1>
          <p className="mt-1 text-center text-sm text-muted-foreground">
            PDF yükləmək və nəticələrə baxmaq üçün parolu daxil edin.
          </p>
          <div className="mt-6 space-y-4">
            <Input
              type="password"
              placeholder="Admin parolu"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && doLogin()}
              className="h-12 rounded-xl"
            />
            <Button
              onClick={doLogin}
              disabled={loggingIn}
              className="h-12 w-full rounded-xl text-base font-semibold"
            >
              {loggingIn ? <Loader2 className="h-5 w-5 animate-spin" /> : "Daxil ol"}
            </Button>
          </div>
          <div className="mt-6 text-center">
            <Link
              to="/"
              className="text-sm font-medium text-muted-foreground hover:text-primary"
            >
              ← Quiz səhifəsinə qayıt
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const avg =
    results.length > 0
      ? Math.round(
          (results.reduce((a, r) => a + r.score / Math.max(r.total, 1), 0) /
            results.length) *
            100,
        )
      : 0;

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-4xl px-4 py-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Admin paneli</h1>
            <p className="text-sm text-muted-foreground">
              PDF-dən AI ilə test yaradın və nəticələri izləyin.
            </p>
          </div>
          <Link to="/">
            <Button variant="outline" className="rounded-xl">
              <ArrowLeft className="mr-1 h-4 w-4" />
              Quiz
            </Button>
          </Link>
        </div>

        <Tabs defaultValue="upload">
          <TabsList className="mb-6 grid w-full grid-cols-3 rounded-xl">
            <TabsTrigger value="upload" className="rounded-lg">
              <Upload className="mr-1.5 h-4 w-4" /> PDF yüklə
            </TabsTrigger>
            <TabsTrigger value="questions" className="rounded-lg">
              <ListChecks className="mr-1.5 h-4 w-4" /> Suallar
            </TabsTrigger>
            <TabsTrigger value="results" className="rounded-lg">
              <BarChart3 className="mr-1.5 h-4 w-4" /> Nəticələr
            </TabsTrigger>
          </TabsList>

          <TabsContent value="upload">
            <div
              className="rounded-3xl border border-border bg-card p-8"
              style={{ boxShadow: "var(--shadow-soft)" }}
            >
              <label
                className={cn(
                  "flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border p-10 text-center transition-colors hover:border-primary/50 hover:bg-secondary/40",
                  uploading && "pointer-events-none opacity-70",
                )}
              >
                <input
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={onFile}
                  disabled={uploading}
                />
                {uploading ? (
                  <Loader2 className="h-10 w-10 animate-spin text-primary" />
                ) : (
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <Sparkles className="h-7 w-7" />
                  </div>
                )}
                <p className="mt-4 text-base font-semibold text-foreground">
                  {uploading ? uploadStatus : "PDF faylı seçin"}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Mətnli və ya skan/şəkil PDF. AI sualları və cavabları avtomatik
                  çıxaracaq (maks. 30 səhifə).
                </p>
              </label>
              <p className="mt-4 text-center text-xs text-muted-foreground">
                Qeyd: Yeni PDF köhnə sualları əvəz edir.
              </p>
              {questions.length > 0 && (
                <p className="mt-2 text-center text-sm font-medium text-foreground">
                  Hazırda {questions.length} sual mövcuddur.
                </p>
              )}
            </div>
          </TabsContent>

          <TabsContent value="questions">
            <div className="space-y-3">
              {questions.length > 0 && (
                <div className="flex justify-end">
                  <Button
                    variant="outline"
                    onClick={async () => {
                      await wipeQuestions({ data: { password } });
                      await refresh(password);
                      toast.success("Suallar silindi.");
                    }}
                    className="rounded-xl text-destructive hover:text-destructive"
                  >
                    <Trash2 className="mr-1.5 h-4 w-4" /> Hamısını sil
                  </Button>
                </div>
              )}
              {questions.length === 0 ? (
                <Empty icon={<FileText />} text="Hələ sual yoxdur. PDF yükləyin." />
              ) : (
                questions.map((q, idx) => (
                  <div
                    key={q.id}
                    className="rounded-2xl border border-border bg-card p-5"
                  >
                    <p className="font-medium text-foreground">
                      {idx + 1}. {q.prompt}
                    </p>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {q.options.map((o, i) => (
                        <div
                          key={i}
                          className={cn(
                            "rounded-lg border px-3 py-2 text-sm",
                            i === q.correct_index
                              ? "border-success/40 bg-success/10 font-medium text-success"
                              : "border-border text-muted-foreground",
                          )}
                        >
                          {String.fromCharCode(65 + i)}. {o}
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </TabsContent>

          <TabsContent value="results">
            {results.length > 0 && (
              <div className="mb-5 grid grid-cols-2 gap-4">
                <Stat label="Cəhd sayı" value={String(results.length)} />
                <Stat label="Orta nəticə" value={`${avg}%`} />
              </div>
            )}
            <div className="space-y-3">
              {results.length > 0 && (
                <div className="flex justify-end">
                  <Button
                    variant="outline"
                    onClick={async () => {
                      await wipeResults({ data: { password } });
                      await refresh(password);
                      toast.success("Nəticələr silindi.");
                    }}
                    className="rounded-xl text-destructive hover:text-destructive"
                  >
                    <Trash2 className="mr-1.5 h-4 w-4" /> Nəticələri sil
                  </Button>
                </div>
              )}
              {results.length === 0 ? (
                <Empty icon={<BarChart3 />} text="Hələ nəticə yoxdur." />
              ) : (
                <div
                  className="overflow-hidden rounded-2xl border border-border bg-card"
                  style={{ boxShadow: "var(--shadow-soft)" }}
                >
                  <table className="w-full text-sm">
                    <thead className="bg-secondary/60 text-muted-foreground">
                      <tr>
                        <th className="px-4 py-3 text-left font-medium">Sıra №</th>
                        <th className="px-4 py-3 text-left font-medium">Nəticə</th>
                        <th className="px-4 py-3 text-left font-medium">Faiz</th>
                        <th className="px-4 py-3 text-left font-medium">Tarix</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.map((r) => (
                        <tr key={r.id} className="border-t border-border">
                          <td className="px-4 py-3 font-semibold text-foreground">
                            {r.seat_number}
                          </td>
                          <td className="px-4 py-3 text-foreground">
                            {r.score}/{r.total}
                          </td>
                          <td className="px-4 py-3 text-foreground">
                            {Math.round((r.score / Math.max(r.total, 1)) * 100)}%
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {new Date(r.created_at).toLocaleString("az-AZ")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="rounded-2xl border border-border bg-card p-5"
      style={{ boxShadow: "var(--shadow-soft)" }}
    >
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-3xl font-bold text-primary">{value}</p>
    </div>
  );
}

function Empty({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-border bg-card p-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary text-muted-foreground">
        {icon}
      </div>
      <p className="mt-4 text-sm text-muted-foreground">{text}</p>
    </div>
  );
}