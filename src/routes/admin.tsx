import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
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
  FolderPlus,
  Users,
  MessageSquare,
  Plus,
  Pencil,
  Lock,
  Unlock,
  RotateCcw,
  Send,
  Check,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  adminLogin,
  getAdminData,
  extractQuiz,
  clearQuestions,
  clearResults,
  createAssessment,
  updateAssessment,
  deleteAssessment,
  saveQuestion,
  deleteQuestion,
  setParticipantBlocked,
  resetParticipant,
  deleteParticipant,
  sendMessage,
} from "@/lib/quiz.functions";
import { pdfToImages } from "@/lib/pdf-to-images";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Admin — AI Quiz" }] }),
  component: AdminPage,
});

type Assessment = {
  id: string;
  name: string;
  description: string | null;
  question_count: number;
  order_mode: string;
  is_open: boolean;
  created_at: string;
};
type AdminResult = {
  id: string;
  assessment_id: string | null;
  seat_number: number;
  score: number;
  total: number;
  created_at: string;
};
type AdminQuestion = {
  id: string;
  assessment_id: string;
  prompt: string;
  options: string[];
  correct_index: number;
  position: number;
};
type Participant = {
  id: string;
  assessment_id: string;
  seat_number: number;
  device_id: string | null;
  blocked: boolean;
  created_at: string;
};

function AdminPage() {
  const login = useServerFn(adminLogin);
  const fetchData = useServerFn(getAdminData);
  const runExtract = useServerFn(extractQuiz);
  const wipeQuestions = useServerFn(clearQuestions);
  const wipeResults = useServerFn(clearResults);
  const addAssessment = useServerFn(createAssessment);
  const editAssessment = useServerFn(updateAssessment);
  const removeAssessment = useServerFn(deleteAssessment);
  const storeQuestion = useServerFn(saveQuestion);
  const removeQuestion = useServerFn(deleteQuestion);
  const blockParticipant = useServerFn(setParticipantBlocked);
  const doReset = useServerFn(resetParticipant);
  const removeParticipant = useServerFn(deleteParticipant);
  const postMessage = useServerFn(sendMessage);

  const [password, setPassword] = useState("");
  const [authed, setAuthed] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [results, setResults] = useState<AdminResult[]>([]);
  const [questions, setQuestions] = useState<AdminQuestion[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState("");

  // assessment form
  const [aName, setAName] = useState("");
  const [aCount, setACount] = useState("20");
  const [aOrder, setAOrder] = useState<"random" | "sequential">("random");

  async function refresh(pw: string) {
    const data = await fetchData({ data: { password: pw } });
    setAssessments(data.assessments as Assessment[]);
    setResults(data.results as AdminResult[]);
    setQuestions(
      (data.questions as AdminQuestion[]).map((q) => ({
        ...q,
        options: Array.isArray(q.options) ? q.options : [],
      })),
    );
    setParticipants(data.participants as Participant[]);
    if (!selected && data.assessments.length > 0) {
      setSelected((data.assessments[0] as Assessment).id);
    }
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

  const selectedAssessment = assessments.find((a) => a.id === selected) || null;
  const aQuestions = useMemo(
    () => questions.filter((q) => q.assessment_id === selected),
    [questions, selected],
  );
  const aParticipants = useMemo(
    () => participants.filter((p) => p.assessment_id === selected),
    [participants, selected],
  );
  const aResults = useMemo(
    () => results.filter((r) => r.assessment_id === selected),
    [results, selected],
  );

  async function handleCreateAssessment() {
    if (!aName.trim()) {
      toast.error("Assessment adını daxil edin.");
      return;
    }
    try {
      const res = await addAssessment({
        data: {
          password,
          name: aName.trim(),
          question_count: parseInt(aCount, 10) || 20,
          order_mode: aOrder,
        },
      });
      setAName("");
      await refresh(password);
      setSelected(res.id);
      toast.success("Assessment yaradıldı.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Xəta baş verdi.");
    }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!selected) {
      toast.error("Əvvəlcə assessment seçin və ya yaradın.");
      return;
    }
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
      setUploadStatus(`${images.length} səhifə AI ilə təhlil olunur…`);
      const res = await runExtract({
        data: { password, assessment_id: selected, images, replace: true },
      });
      toast.success(`${res.count} sual yaradıldı!`);
      await refresh(password);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("RATE_LIMIT")) toast.error("AI çox sorğu aldı. Bir az sonra cəhd edin.");
      else if (msg.includes("CREDITS_EXHAUSTED"))
        toast.error("AI kreditləri bitib. Workspace-ə kredit əlavə edin.");
      else toast.error(msg || "PDF emalı zamanı xəta baş verdi.");
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
          <h1 className="mt-5 text-center text-2xl font-bold text-foreground">Admin girişi</h1>
          <p className="mt-1 text-center text-sm text-muted-foreground">
            Assessment idarə etmək üçün parolu daxil edin.
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
            <Link to="/" className="text-sm font-medium text-muted-foreground hover:text-primary">
              ← Quiz səhifəsinə qayıt
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Admin paneli</h1>
            <p className="text-sm text-muted-foreground">
              Assessmentlər, suallar, iştirakçılar və ismarıclar.
            </p>
          </div>
          <Link to="/">
            <Button variant="outline" className="rounded-xl">
              <ArrowLeft className="mr-1 h-4 w-4" />
              Quiz
            </Button>
          </Link>
        </div>

        {/* Assessment selector */}
        {assessments.length > 0 && (
          <div className="mb-6 flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground">Assessment:</span>
            {assessments.map((a) => (
              <button
                key={a.id}
                onClick={() => setSelected(a.id)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-sm font-medium transition-all",
                  selected === a.id
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-foreground hover:border-primary/40",
                )}
              >
                {a.name}
                {!a.is_open && " (bağlı)"}
              </button>
            ))}
          </div>
        )}

        <Tabs defaultValue="assessments">
          <TabsList className="mb-6 grid w-full grid-cols-3 rounded-xl sm:grid-cols-5">
            <TabsTrigger value="assessments" className="rounded-lg">
              <FolderPlus className="mr-1.5 h-4 w-4" /> Paketlər
            </TabsTrigger>
            <TabsTrigger value="upload" className="rounded-lg">
              <Upload className="mr-1.5 h-4 w-4" /> PDF / Suallar
            </TabsTrigger>
            <TabsTrigger value="participants" className="rounded-lg">
              <Users className="mr-1.5 h-4 w-4" /> İştirakçılar
            </TabsTrigger>
            <TabsTrigger value="messages" className="rounded-lg">
              <MessageSquare className="mr-1.5 h-4 w-4" /> Mesaj
            </TabsTrigger>
            <TabsTrigger value="results" className="rounded-lg">
              <BarChart3 className="mr-1.5 h-4 w-4" /> Nəticələr
            </TabsTrigger>
          </TabsList>

          {/* ===== Assessments ===== */}
          <TabsContent value="assessments">
            <div
              className="mb-5 rounded-3xl border border-border bg-card p-6"
              style={{ boxShadow: "var(--shadow-soft)" }}
            >
              <h3 className="mb-4 text-base font-semibold text-foreground">Yeni assessment</h3>
              <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-end">
                <div className="space-y-1.5">
                  <Label>Ad</Label>
                  <Input
                    placeholder="Məs. karyerasuallar"
                    value={aName}
                    onChange={(e) => setAName(e.target.value)}
                    className="h-11 rounded-xl"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Sual sayı</Label>
                  <Input
                    type="number"
                    min={1}
                    value={aCount}
                    onChange={(e) => setACount(e.target.value)}
                    className="h-11 rounded-xl"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Ardıcıllıq</Label>
                  <select
                    value={aOrder}
                    onChange={(e) => setAOrder(e.target.value as "random" | "sequential")}
                    className="h-11 w-full rounded-xl border border-border bg-card px-3 text-sm"
                  >
                    <option value="random">Qarışıq</option>
                    <option value="sequential">Ardıcıl</option>
                  </select>
                </div>
                <Button onClick={handleCreateAssessment} className="h-11 rounded-xl">
                  <Plus className="mr-1 h-4 w-4" /> Yarat
                </Button>
              </div>
            </div>

            <div className="space-y-3">
              {assessments.length === 0 ? (
                <Empty icon={<FolderPlus />} text="Hələ assessment yoxdur." />
              ) : (
                assessments.map((a) => (
                  <AssessmentRow
                    key={a.id}
                    a={a}
                    qCount={questions.filter((q) => q.assessment_id === a.id).length}
                    onToggle={async () => {
                      await editAssessment({
                        data: { password, id: a.id, is_open: !a.is_open },
                      });
                      await refresh(password);
                    }}
                    onSaveCount={async (n) => {
                      await editAssessment({ data: { password, id: a.id, question_count: n } });
                      await refresh(password);
                      toast.success("Yeniləndi.");
                    }}
                    onDelete={async () => {
                      if (!confirm(`"${a.name}" silinsin? Bütün sualları da silinəcək.`)) return;
                      await removeAssessment({ data: { password, id: a.id } });
                      if (selected === a.id) setSelected("");
                      await refresh(password);
                      toast.success("Silindi.");
                    }}
                  />
                ))
              )}
            </div>
          </TabsContent>

          {/* ===== Upload / Questions ===== */}
          <TabsContent value="upload">
            {!selectedAssessment ? (
              <Empty icon={<FileText />} text="Əvvəlcə yuxarıdan assessment seçin." />
            ) : (
              <div className="space-y-5">
                <div
                  className="rounded-3xl border border-border bg-card p-6"
                  style={{ boxShadow: "var(--shadow-soft)" }}
                >
                  <label
                    className={cn(
                      "flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border p-8 text-center transition-colors hover:border-primary/50 hover:bg-secondary/40",
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
                      {uploading ? uploadStatus : `"${selectedAssessment.name}" üçün PDF yüklə`}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Mətnli və ya skan PDF. Yeni PDF köhnə sualları əvəz edir.
                    </p>
                  </label>
                </div>

                <QuestionsEditor
                  assessmentId={selected}
                  questions={aQuestions}
                  password={password}
                  onSave={storeQuestion}
                  onDelete={removeQuestion}
                  onClear={wipeQuestions}
                  refresh={() => refresh(password)}
                />
              </div>
            )}
          </TabsContent>

          {/* ===== Participants ===== */}
          <TabsContent value="participants">
            {!selectedAssessment ? (
              <Empty icon={<Users />} text="Əvvəlcə assessment seçin." />
            ) : aParticipants.length === 0 ? (
              <Empty icon={<Users />} text="Hələ iştirakçı yoxdur." />
            ) : (
              <div className="space-y-3">
                {aParticipants.map((p) => (
                  <ParticipantRow
                    key={p.id}
                    p={p}
                    onBlock={async () => {
                      await blockParticipant({ data: { password, id: p.id, blocked: !p.blocked } });
                      await refresh(password);
                    }}
                    onReset={async (newSeat) => {
                      await doReset({
                        data: { password, id: p.id, new_seat: newSeat },
                      });
                      await refresh(password);
                      toast.success("İştirakçı resetləndi.");
                    }}
                    onDelete={async () => {
                      await removeParticipant({ data: { password, id: p.id } });
                      await refresh(password);
                    }}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          {/* ===== Messages ===== */}
          <TabsContent value="messages">
            {!selectedAssessment ? (
              <Empty icon={<MessageSquare />} text="Əvvəlcə assessment seçin." />
            ) : (
              <MessageSender
                assessment={selectedAssessment}
                participants={aParticipants}
                password={password}
                onSend={postMessage}
              />
            )}
          </TabsContent>

          {/* ===== Results ===== */}
          <TabsContent value="results">
            {!selectedAssessment ? (
              <Empty icon={<BarChart3 />} text="Əvvəlcə assessment seçin." />
            ) : (
              <>
                {aResults.length > 0 && (
                  <div className="mb-5 flex justify-end">
                    <Button
                      variant="outline"
                      onClick={async () => {
                        await wipeResults({ data: { password, assessment_id: selected } });
                        await refresh(password);
                        toast.success("Nəticələr silindi.");
                      }}
                      className="rounded-xl text-destructive hover:text-destructive"
                    >
                      <Trash2 className="mr-1.5 h-4 w-4" /> Nəticələri sil
                    </Button>
                  </div>
                )}
                {aResults.length === 0 ? (
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
                        {aResults.map((r) => (
                          <tr key={r.id} className="border-t border-border">
                            <td className="px-4 py-3 font-semibold text-foreground">{r.seat_number}</td>
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
              </>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}

function AssessmentRow({
  a,
  qCount,
  onToggle,
  onSaveCount,
  onDelete,
}: {
  a: Assessment;
  qCount: number;
  onToggle: () => void;
  onSaveCount: (n: number) => void;
  onDelete: () => void;
}) {
  const [count, setCount] = useState(String(a.question_count));
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-5">
      <div>
        <p className="font-semibold text-foreground">{a.name}</p>
        <p className="text-sm text-muted-foreground">
          {qCount} sual · {a.order_mode === "random" ? "Qarışıq" : "Ardıcıl"} ·{" "}
          {a.is_open ? "Açıq" : "Bağlı"}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          min={1}
          value={count}
          onChange={(e) => setCount(e.target.value)}
          className="h-9 w-20 rounded-lg"
        />
        <Button
          size="sm"
          variant="outline"
          onClick={() => onSaveCount(parseInt(count, 10) || a.question_count)}
          className="rounded-lg"
        >
          Saxla
        </Button>
        <Button size="sm" variant="outline" onClick={onToggle} className="rounded-lg">
          {a.is_open ? "Bağla" : "Aç"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={onDelete}
          className="rounded-lg text-destructive hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function QuestionsEditor({
  assessmentId,
  questions,
  password,
  onSave,
  onDelete,
  onClear,
  refresh,
}: {
  assessmentId: string;
  questions: AdminQuestion[];
  password: string;
  onSave: ReturnType<typeof useServerFn>;
  onDelete: ReturnType<typeof useServerFn>;
  onClear: ReturnType<typeof useServerFn>;
  refresh: () => Promise<void>;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-foreground">{questions.length} sual</p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setAdding(true)} className="rounded-lg">
            <Plus className="mr-1 h-4 w-4" /> Sual əlavə et
          </Button>
          {questions.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                if (!confirm("Bütün suallar silinsin?")) return;
                await onClear({ data: { password, assessment_id: assessmentId } });
                await refresh();
                toast.success("Suallar silindi.");
              }}
              className="rounded-lg text-destructive hover:text-destructive"
            >
              <Trash2 className="mr-1 h-4 w-4" /> Hamısını sil
            </Button>
          )}
        </div>
      </div>

      {adding && (
        <QuestionForm
          onCancel={() => setAdding(false)}
          onSubmit={async (vals) => {
            await onSave({
              data: { password, assessment_id: assessmentId, ...vals },
            });
            setAdding(false);
            await refresh();
            toast.success("Sual əlavə edildi.");
          }}
        />
      )}

      {questions.map((q, idx) =>
        editing === q.id ? (
          <QuestionForm
            key={q.id}
            initial={q}
            onCancel={() => setEditing(null)}
            onSubmit={async (vals) => {
              await onSave({
                data: { password, id: q.id, assessment_id: assessmentId, ...vals },
              });
              setEditing(null);
              await refresh();
              toast.success("Yadda saxlanıldı.");
            }}
          />
        ) : (
          <div key={q.id} className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-start justify-between gap-3">
              <p className="font-medium text-foreground">
                {idx + 1}. {q.prompt}
              </p>
              <div className="flex shrink-0 gap-1">
                <Button size="icon" variant="ghost" onClick={() => setEditing(q.id)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={async () => {
                    await onDelete({ data: { password, id: q.id } });
                    await refresh();
                  }}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
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
        ),
      )}
    </div>
  );
}

function QuestionForm({
  initial,
  onSubmit,
  onCancel,
}: {
  initial?: AdminQuestion;
  onSubmit: (vals: {
    prompt: string;
    options: string[];
    correct_index: number;
  }) => Promise<void>;
  onCancel: () => void;
}) {
  const [prompt, setPrompt] = useState(initial?.prompt ?? "");
  const [options, setOptions] = useState<string[]>(initial?.options ?? ["", ""]);
  const [correct, setCorrect] = useState(initial?.correct_index ?? 0);
  const [saving, setSaving] = useState(false);

  async function submit() {
    const clean = options.map((o) => o.trim()).filter(Boolean);
    if (!prompt.trim()) return toast.error("Sual mətnini daxil edin.");
    if (clean.length < 2) return toast.error("Ən azı 2 variant lazımdır.");
    setSaving(true);
    try {
      await onSubmit({
        prompt: prompt.trim(),
        options: clean,
        correct_index: Math.min(correct, clean.length - 1),
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Xəta.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl border border-primary/40 bg-card p-5">
      <Label className="mb-1.5 block">Sual</Label>
      <Textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        className="mb-4 rounded-xl"
        rows={2}
      />
      <Label className="mb-1.5 block">Variantlar (düzgün cavabı seçin)</Label>
      <div className="space-y-2">
        {options.map((o, i) => (
          <div key={i} className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCorrect(i)}
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border text-sm font-semibold",
                correct === i
                  ? "border-success bg-success/10 text-success"
                  : "border-border text-muted-foreground",
              )}
            >
              {correct === i ? <Check className="h-4 w-4" /> : String.fromCharCode(65 + i)}
            </button>
            <Input
              value={o}
              onChange={(e) =>
                setOptions((prev) => prev.map((x, idx) => (idx === i ? e.target.value : x)))
              }
              className="h-9 rounded-lg"
              placeholder={`Variant ${String.fromCharCode(65 + i)}`}
            />
            {options.length > 2 && (
              <Button
                size="icon"
                variant="ghost"
                onClick={() => {
                  setOptions((prev) => prev.filter((_, idx) => idx !== i));
                  if (correct >= i && correct > 0) setCorrect((c) => c - 1);
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        ))}
      </div>
      {options.length < 8 && (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setOptions((prev) => [...prev, ""])}
          className="mt-2"
        >
          <Plus className="mr-1 h-4 w-4" /> Variant əlavə et
        </Button>
      )}
      <div className="mt-4 flex gap-2">
        <Button onClick={submit} disabled={saving} className="rounded-xl">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Yadda saxla"}
        </Button>
        <Button variant="outline" onClick={onCancel} className="rounded-xl">
          Ləğv et
        </Button>
      </div>
    </div>
  );
}

function ParticipantRow({
  p,
  onBlock,
  onReset,
  onDelete,
}: {
  p: Participant;
  onBlock: () => void;
  onReset: (newSeat?: number) => void;
  onDelete: () => void;
}) {
  const [seat, setSeat] = useState(String(p.seat_number));
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "flex h-11 w-11 items-center justify-center rounded-xl text-lg font-bold",
            p.blocked ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary",
          )}
        >
          {p.seat_number}
        </div>
        <div>
          <p className="font-semibold text-foreground">Sıra #{p.seat_number}</p>
          <p className="text-xs text-muted-foreground">
            {p.blocked ? "Bloklanıb" : p.device_id ? "Cihaza bağlı" : "Boş cihaz"}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="number"
          min={1}
          value={seat}
          onChange={(e) => setSeat(e.target.value)}
          className="h-9 w-20 rounded-lg"
        />
        <Button
          size="sm"
          variant="outline"
          onClick={() => onReset(parseInt(seat, 10) || p.seat_number)}
          className="rounded-lg"
        >
          <RotateCcw className="mr-1 h-4 w-4" /> Reset
        </Button>
        <Button size="sm" variant="outline" onClick={onBlock} className="rounded-lg">
          {p.blocked ? (
            <>
              <Unlock className="mr-1 h-4 w-4" /> Aç
            </>
          ) : (
            <>
              <Lock className="mr-1 h-4 w-4" /> Blokla
            </>
          )}
        </Button>
        <Button
          size="icon"
          variant="ghost"
          onClick={onDelete}
          className="text-destructive hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function MessageSender({
  assessment,
  participants,
  password,
  onSend,
}: {
  assessment: Assessment;
  participants: Participant[];
  password: string;
  onSend: ReturnType<typeof useServerFn>;
}) {
  const [body, setBody] = useState("");
  const [kind, setKind] = useState<"info" | "warning">("info");
  const [target, setTarget] = useState<string>("all");
  const [sending, setSending] = useState(false);

  async function send() {
    if (!body.trim()) return toast.error("Mesaj mətnini daxil edin.");
    setSending(true);
    try {
      await onSend({
        data: {
          password,
          assessment_id: assessment.id,
          seat_number: target === "all" ? null : parseInt(target, 10),
          body: body.trim(),
          kind,
        },
      });
      setBody("");
      toast.success("Mesaj göndərildi.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Xəta.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      className="rounded-3xl border border-border bg-card p-6"
      style={{ boxShadow: "var(--shadow-soft)" }}
    >
      <h3 className="mb-4 text-base font-semibold text-foreground">
        "{assessment.name}" üçün anlıq ismarıc
      </h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Hədəf</Label>
          <select
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            className="h-11 w-full rounded-xl border border-border bg-card px-3 text-sm"
          >
            <option value="all">Hamıya</option>
            {participants.map((p) => (
              <option key={p.id} value={String(p.seat_number)}>
                Sıra #{p.seat_number}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label>Tip</Label>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as "info" | "warning")}
            className="h-11 w-full rounded-xl border border-border bg-card px-3 text-sm"
          >
            <option value="info">Məlumat</option>
            <option value="warning">Xəbərdarlıq</option>
          </select>
        </div>
      </div>
      <div className="mt-3 space-y-1.5">
        <Label>Mesaj</Label>
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          className="rounded-xl"
          placeholder="İstifadəçilərə göndəriləcək mesaj…"
        />
      </div>
      <Button onClick={send} disabled={sending} className="mt-4 rounded-xl">
        {sending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <>
            <Send className="mr-1.5 h-4 w-4" /> Göndər
          </>
        )}
      </Button>
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