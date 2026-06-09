import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import {
  ShieldCheck, Upload, Loader2, FileText, Trash2, ArrowLeft, BarChart3, Sparkles,
  FolderPlus, Users, MessageSquare, Plus, Pencil, Lock, Unlock, RotateCcw, Send,
  Check, X, KeyRound, AlertTriangle, Search, Copy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  adminLogin, getAdminData, extractQuiz, clearQuestions, clearResults,
  createAssessment, updateAssessment, deleteAssessment, saveQuestion, deleteQuestion,
  setParticipantBlocked, resetParticipant, deleteParticipant, sendMessage,
  createAccessKeys, setAccessKeyBlocked, resetAccessKey, deleteAccessKey,
  resolveProcessingError, deleteProcessingError,
} from "@/lib/quiz.functions";
import { docxToText } from "@/lib/quiz-client";
import { pdfToImages } from "@/lib/pdf-to-images";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Admin — AI Quiz" }] }),
  component: AdminPage,
});

type Assessment = {
  id: string; name: string; description: string | null; question_count: number;
  order_mode: string; is_open: boolean; login_mode: "seat" | "key" | "both";
  seat_min: number; seat_max: number; resume_after_unblock: boolean; created_at: string;
};
type AdminResult = {
  id: string; assessment_id: string | null; seat_number: number; score: number;
  total: number; details: unknown; created_at: string;
};
type AdminQuestion = {
  id: string; assessment_id: string; prompt: string; options: string[];
  correct_index: number; position: number; pdf_number: number | null; source_file: string | null;
};
type Participant = {
  id: string; assessment_id: string; seat_number: number; access_key: string | null;
  device_id: string | null; blocked: boolean; created_at: string;
};
type AccessKey = {
  id: string; assessment_id: string; key_code: string; device_id: string | null;
  blocked: boolean; created_at: string;
};
type ProcessingError = {
  id: string; assessment_id: string | null; file_name: string | null;
  question_number: number | null; reason: string; raw_excerpt: string | null;
  question_id: string | null; status: string; created_at: string;
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
  const addKeys = useServerFn(createAccessKeys);
  const blockKey = useServerFn(setAccessKeyBlocked);
  const resetKey = useServerFn(resetAccessKey);
  const removeKey = useServerFn(deleteAccessKey);
  const resolveErr = useServerFn(resolveProcessingError);
  const removeErr = useServerFn(deleteProcessingError);

  const [password, setPassword] = useState("");
  const [authed, setAuthed] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [results, setResults] = useState<AdminResult[]>([]);
  const [questions, setQuestions] = useState<AdminQuestion[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [accessKeys, setAccessKeys] = useState<AccessKey[]>([]);
  const [procErrors, setProcErrors] = useState<ProcessingError[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState("");

  // assessment form
  const [aName, setAName] = useState("");
  const [aCount, setACount] = useState("20");
  const [aOrder, setAOrder] = useState<"random" | "sequential">("random");
  const [aLogin, setALogin] = useState<"seat" | "key" | "both">("seat");
  const [aSeatMin, setASeatMin] = useState("1");
  const [aSeatMax, setASeatMax] = useState("100");

  async function refresh(pw: string) {
    const data = await fetchData({ data: { password: pw } });
    setAssessments(data.assessments as Assessment[]);
    setResults(data.results as AdminResult[]);
    setQuestions(
      (data.questions as AdminQuestion[]).map((q) => ({
        ...q, options: Array.isArray(q.options) ? q.options : [],
      })),
    );
    setParticipants(data.participants as Participant[]);
    setAccessKeys(data.accessKeys as AccessKey[]);
    setProcErrors(data.processingErrors as ProcessingError[]);
    if (!selected && data.assessments.length > 0) {
      setSelected((data.assessments[0] as Assessment).id);
    }
  }

  async function doLogin() {
    if (!password.trim()) { toast.error("Zəhmət olmasa parolu daxil edin."); return; }
    setLoggingIn(true);
    try {
      const res = await login({ data: { password } });
      if (!res.ok) { toast.error("Parol yanlışdır."); return; }
      await refresh(password);
      setAuthed(true);
    } catch {
      toast.error("Giriş zamanı xəta baş verdi.");
    } finally {
      setLoggingIn(false);
    }
  }

  const selectedAssessment = assessments.find((a) => a.id === selected) || null;
  const aQuestions = useMemo(() => questions.filter((q) => q.assessment_id === selected), [questions, selected]);
  const aParticipants = useMemo(() => participants.filter((p) => p.assessment_id === selected), [participants, selected]);
  const aKeys = useMemo(() => accessKeys.filter((k) => k.assessment_id === selected), [accessKeys, selected]);
  const aResults = useMemo(() => results.filter((r) => r.assessment_id === selected), [results, selected]);
  const aErrors = useMemo(() => procErrors.filter((e) => e.assessment_id === selected), [procErrors, selected]);

  async function handleCreateAssessment() {
    if (!aName.trim()) { toast.error("Assessment adını daxil edin."); return; }
    try {
      const res = await addAssessment({
        data: {
          password, name: aName.trim(), question_count: parseInt(aCount, 10) || 20,
          order_mode: aOrder, login_mode: aLogin,
          seat_min: parseInt(aSeatMin, 10) || 1, seat_max: parseInt(aSeatMax, 10) || 100,
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
    if (!selected) { toast.error("Əvvəlcə assessment seçin və ya yaradın."); return; }
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    const isDocx = file.name.toLowerCase().endsWith(".docx") || file.type.includes("officedocument.wordprocessingml");
    if (!isPdf && !isDocx) { toast.error("PDF və ya Word (.docx) faylı seçin."); return; }
    setUploading(true);
    try {
      let res;
      if (isPdf) {
        setUploadStatus("PDF səhifələri oxunur…");
        const images = await pdfToImages(file, { maxPages: 60 });
        if (images.length === 0) { toast.error("PDF-dən səhifə oxunmadı."); return; }
        setUploadStatus(`${images.length} səhifə AI ilə təhlil olunur…`);
        res = await runExtract({ data: { password, assessment_id: selected, images, source_file: file.name, replace: true } });
      } else {
        setUploadStatus("Word mətni oxunur…");
        const text = await docxToText(file);
        if (!text.trim()) { toast.error("Word faylından mətn oxunmadı."); return; }
        setUploadStatus("Mətn AI ilə təhlil olunur…");
        res = await runExtract({ data: { password, assessment_id: selected, text, source_file: file.name, replace: true } });
      }
      if (res.errors > 0) toast.warning(`${res.count} sual yaradıldı, ${res.errors} xəta qeydə alındı.`);
      else toast.success(`${res.count} sual yaradıldı!`);
      await refresh(password);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("RATE_LIMIT")) toast.error("AI çox sorğu aldı. Bir az sonra cəhd edin.");
      else if (msg.includes("CREDITS_EXHAUSTED")) toast.error("AI kreditləri bitib. Workspace-ə kredit əlavə edin.");
      else toast.error(msg || "Emal zamanı xəta baş verdi.");
    } finally {
      setUploading(false);
      setUploadStatus("");
    }
  }

  if (!authed) {
    return (
      <main className="relative flex min-h-screen items-center justify-center bg-background px-4">
        <div className="pointer-events-none absolute inset-0 opacity-90" style={{ background: "var(--gradient-hero)" }} />
        <div className="pointer-events-none absolute inset-0 bg-background/75 backdrop-blur-3xl" />
        <div className="relative z-10 w-full max-w-sm rounded-3xl border border-border bg-card p-8" style={{ boxShadow: "var(--shadow-card)" }}>
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <ShieldCheck className="h-7 w-7" />
          </div>
          <h1 className="mt-5 text-center text-2xl font-bold text-foreground">Admin girişi</h1>
          <p className="mt-1 text-center text-sm text-muted-foreground">Assessment idarə etmək üçün parolu daxil edin.</p>
          <div className="mt-6 space-y-4">
            <Input type="password" placeholder="Admin parolu" value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && doLogin()} className="h-12 rounded-xl" />
            <Button onClick={doLogin} disabled={loggingIn} className="h-12 w-full rounded-xl text-base font-semibold">
              {loggingIn ? <Loader2 className="h-5 w-5 animate-spin" /> : "Daxil ol"}
            </Button>
          </div>
          <div className="mt-6 text-center">
            <Link to="/" className="text-sm font-medium text-muted-foreground hover:text-primary">← Quiz səhifəsinə qayıt</Link>
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
            <p className="text-sm text-muted-foreground">Assessmentlər, suallar, açarlar, iştirakçılar.</p>
          </div>
          <Link to="/"><Button variant="outline" className="rounded-xl"><ArrowLeft className="mr-1 h-4 w-4" />Quiz</Button></Link>
        </div>

        {assessments.length > 0 && (
          <div className="mb-6 flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground">Assessment:</span>
            {assessments.map((a) => (
              <button key={a.id} onClick={() => setSelected(a.id)}
                className={cn("rounded-full border px-3 py-1.5 text-sm font-medium transition-all",
                  selected === a.id ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground hover:border-primary/40")}>
                {a.name}{!a.is_open && " (bağlı)"}
              </button>
            ))}
          </div>
        )}

        <Tabs defaultValue="assessments">
          <TabsList className="mb-6 grid w-full grid-cols-3 rounded-xl sm:grid-cols-7">
            <TabsTrigger value="assessments" className="rounded-lg"><FolderPlus className="mr-1 h-4 w-4" /> Paketlər</TabsTrigger>
            <TabsTrigger value="upload" className="rounded-lg"><Upload className="mr-1 h-4 w-4" /> Suallar</TabsTrigger>
            <TabsTrigger value="keys" className="rounded-lg"><KeyRound className="mr-1 h-4 w-4" /> Açarlar</TabsTrigger>
            <TabsTrigger value="participants" className="rounded-lg"><Users className="mr-1 h-4 w-4" /> İştirakçılar</TabsTrigger>
            <TabsTrigger value="messages" className="rounded-lg"><MessageSquare className="mr-1 h-4 w-4" /> Mesaj</TabsTrigger>
            <TabsTrigger value="errors" className="rounded-lg"><AlertTriangle className="mr-1 h-4 w-4" /> Xətalar</TabsTrigger>
            <TabsTrigger value="results" className="rounded-lg"><BarChart3 className="mr-1 h-4 w-4" /> Nəticələr</TabsTrigger>
          </TabsList>

          {/* ===== Assessments ===== */}
          <TabsContent value="assessments">
            <div className="mb-5 rounded-3xl border border-border bg-card p-6" style={{ boxShadow: "var(--shadow-soft)" }}>
              <h3 className="mb-4 text-base font-semibold text-foreground">Yeni assessment</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Ad</Label>
                  <Input placeholder="Məs. karyerasuallar" value={aName} onChange={(e) => setAName(e.target.value)} className="h-11 rounded-xl" />
                </div>
                <div className="space-y-1.5">
                  <Label>Standart sual sayı</Label>
                  <Input type="number" min={1} value={aCount} onChange={(e) => setACount(e.target.value)} className="h-11 rounded-xl" />
                </div>
                <div className="space-y-1.5">
                  <Label>Standart sıra</Label>
                  <select value={aOrder} onChange={(e) => setAOrder(e.target.value as "random" | "sequential")}
                    className="h-11 w-full rounded-xl border border-border bg-card px-3 text-sm">
                    <option value="random">Qarışıq</option>
                    <option value="sequential">Ardıcıl</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label>Giriş modeli</Label>
                  <select value={aLogin} onChange={(e) => setALogin(e.target.value as "seat" | "key" | "both")}
                    className="h-11 w-full rounded-xl border border-border bg-card px-3 text-sm">
                    <option value="seat">Sıra nömrəsi</option>
                    <option value="key">Giriş açarı</option>
                    <option value="both">Sıra + Açar</option>
                  </select>
                </div>
                {(aLogin === "seat" || aLogin === "both") && (
                  <>
                    <div className="space-y-1.5">
                      <Label>Sıra aralığı (min)</Label>
                      <Input type="number" min={1} value={aSeatMin} onChange={(e) => setASeatMin(e.target.value)} className="h-11 rounded-xl" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Sıra aralığı (max)</Label>
                      <Input type="number" min={1} value={aSeatMax} onChange={(e) => setASeatMax(e.target.value)} className="h-11 rounded-xl" />
                    </div>
                  </>
                )}
              </div>
              <Button onClick={handleCreateAssessment} className="mt-4 h-11 rounded-xl"><Plus className="mr-1 h-4 w-4" /> Yarat</Button>
            </div>

            <div className="space-y-3">
              {assessments.length === 0 ? (
                <Empty icon={<FolderPlus />} text="Hələ assessment yoxdur." />
              ) : (
                assessments.map((a) => (
                  <AssessmentRow key={a.id} a={a}
                    qCount={questions.filter((q) => q.assessment_id === a.id).length}
                    onSave={async (patch) => { await editAssessment({ data: { password, id: a.id, ...patch } }); await refresh(password); toast.success("Yeniləndi."); }}
                    onToggle={async () => { await editAssessment({ data: { password, id: a.id, is_open: !a.is_open } }); await refresh(password); }}
                    onDelete={async () => {
                      if (!confirm(`"${a.name}" silinsin? Bütün məlumatları silinəcək.`)) return;
                      await removeAssessment({ data: { password, id: a.id } });
                      if (selected === a.id) setSelected("");
                      await refresh(password);
                      toast.success("Silindi.");
                    }} />
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
                <div className="rounded-3xl border border-border bg-card p-6" style={{ boxShadow: "var(--shadow-soft)" }}>
                  <label className={cn("flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border p-8 text-center transition-colors hover:border-primary/50 hover:bg-secondary/40", uploading && "pointer-events-none opacity-70")}>
                    <input type="file" accept="application/pdf,.docx" className="hidden" onChange={onFile} disabled={uploading} />
                    {uploading ? <Loader2 className="h-10 w-10 animate-spin text-primary" /> : (
                      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Sparkles className="h-7 w-7" /></div>
                    )}
                    <p className="mt-4 text-base font-semibold text-foreground">
                      {uploading ? uploadStatus : `"${selectedAssessment.name}" üçün PDF və ya Word yüklə`}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">Mətnli/skan PDF və ya .docx. Yeni fayl köhnə sualları əvəz edir.</p>
                  </label>
                </div>

                <QuestionsEditor assessmentId={selected} questions={aQuestions} password={password}
                  onSave={storeQuestion} onDelete={removeQuestion} onClear={wipeQuestions} refresh={() => refresh(password)} />
              </div>
            )}
          </TabsContent>

          {/* ===== Access keys ===== */}
          <TabsContent value="keys">
            {!selectedAssessment ? (
              <Empty icon={<KeyRound />} text="Əvvəlcə assessment seçin." />
            ) : (
              <AccessKeysManager assessmentId={selected} keys={aKeys} password={password}
                onGenerate={addKeys} onBlock={blockKey} onReset={resetKey} onDelete={removeKey} refresh={() => refresh(password)} />
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
                  <ParticipantRow key={p.id} p={p}
                    onBlock={async () => { await blockParticipant({ data: { password, id: p.id, blocked: true } }); await refresh(password); toast.success("Bloklandı."); }}
                    onUnblock={async (resume) => { await blockParticipant({ data: { password, id: p.id, blocked: false, resume } }); await refresh(password); toast.success(resume ? "Blok açıldı (davam edir)." : "Blok açıldı (sıfırlandı)."); }}
                    onReset={async (newSeat) => { await doReset({ data: { password, id: p.id, new_seat: newSeat } }); await refresh(password); toast.success("Cihaz sıfırlandı."); }}
                    onDelete={async () => { await removeParticipant({ data: { password, id: p.id } }); await refresh(password); }} />
                ))}
              </div>
            )}
          </TabsContent>

          {/* ===== Messages ===== */}
          <TabsContent value="messages">
            {!selectedAssessment ? (
              <Empty icon={<MessageSquare />} text="Əvvəlcə assessment seçin." />
            ) : (
              <MessageSender assessment={selectedAssessment} participants={aParticipants} password={password} onSend={postMessage} />
            )}
          </TabsContent>

          {/* ===== Processing errors ===== */}
          <TabsContent value="errors">
            {!selectedAssessment ? (
              <Empty icon={<AlertTriangle />} text="Əvvəlcə assessment seçin." />
            ) : (
              <ErrorsPanel errors={aErrors} questions={aQuestions} assessmentName={selectedAssessment.name}
                password={password} onSave={storeQuestion} onResolve={resolveErr} onDelete={removeErr} refresh={() => refresh(password)} />
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
                    <Button variant="outline" onClick={async () => { await wipeResults({ data: { password, assessment_id: selected } }); await refresh(password); toast.success("Nəticələr silindi."); }}
                      className="rounded-xl text-destructive hover:text-destructive">
                      <Trash2 className="mr-1.5 h-4 w-4" /> Nəticələri sil
                    </Button>
                  </div>
                )}
                {aResults.length === 0 ? (
                  <Empty icon={<BarChart3 />} text="Hələ nəticə yoxdur." />
                ) : (
                  <div className="space-y-3">
                    {aResults.map((r) => <ResultRow key={r.id} r={r} />)}
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

function AssessmentRow({ a, qCount, onSave, onToggle, onDelete }: {
  a: Assessment; qCount: number;
  onSave: (patch: Partial<Pick<Assessment, "question_count" | "order_mode" | "login_mode" | "seat_min" | "seat_max" | "resume_after_unblock">>) => void;
  onToggle: () => void; onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(String(a.question_count));
  const [login, setLogin] = useState(a.login_mode);
  const [smin, setSmin] = useState(String(a.seat_min));
  const [smax, setSmax] = useState(String(a.seat_max));
  const [resume, setResume] = useState(a.resume_after_unblock);
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-semibold text-foreground">{a.name}</p>
          <p className="text-sm text-muted-foreground">
            {qCount} sual · {a.login_mode === "seat" ? "Sıra" : a.login_mode === "key" ? "Açar" : "Sıra+Açar"} ·{" "}
            {a.login_mode !== "key" && `${a.seat_min}–${a.seat_max} · `}{a.is_open ? "Açıq" : "Bağlı"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setOpen((o) => !o)} className="rounded-lg">Tənzimlə</Button>
          <Button size="sm" variant="outline" onClick={onToggle} className="rounded-lg">{a.is_open ? "Bağla" : "Aç"}</Button>
          <Button size="sm" variant="outline" onClick={onDelete} className="rounded-lg text-destructive hover:text-destructive"><Trash2 className="h-4 w-4" /></Button>
        </div>
      </div>
      {open && (
        <div className="mt-4 grid gap-3 border-t border-border pt-4 sm:grid-cols-2">
          <div className="space-y-1"><Label>Standart sual sayı</Label>
            <Input type="number" min={1} value={count} onChange={(e) => setCount(e.target.value)} className="h-10 rounded-lg" /></div>
          <div className="space-y-1"><Label>Giriş modeli</Label>
            <select value={login} onChange={(e) => setLogin(e.target.value as Assessment["login_mode"])} className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm">
              <option value="seat">Sıra nömrəsi</option><option value="key">Giriş açarı</option><option value="both">Sıra + Açar</option>
            </select></div>
          <div className="space-y-1"><Label>Sıra min</Label>
            <Input type="number" min={1} value={smin} onChange={(e) => setSmin(e.target.value)} className="h-10 rounded-lg" /></div>
          <div className="space-y-1"><Label>Sıra max</Label>
            <Input type="number" min={1} value={smax} onChange={(e) => setSmax(e.target.value)} className="h-10 rounded-lg" /></div>
          <label className="flex items-center gap-2 text-sm text-foreground sm:col-span-2">
            <input type="checkbox" checked={resume} onChange={(e) => setResume(e.target.checked)} className="h-4 w-4" />
            Blokdan çıxarılan istifadəçi standart olaraq qaldığı yerdən davam etsin
          </label>
          <Button onClick={() => onSave({ question_count: parseInt(count, 10) || a.question_count, login_mode: login, seat_min: parseInt(smin, 10) || 1, seat_max: parseInt(smax, 10) || 100, resume_after_unblock: resume })}
            className="h-10 rounded-lg sm:col-span-2">Saxla</Button>
        </div>
      )}
    </div>
  );
}

function QuestionsEditor({ assessmentId, questions, password, onSave, onDelete, onClear, refresh }: {
  assessmentId: string; questions: AdminQuestion[]; password: string;
  onSave: ReturnType<typeof useServerFn>; onDelete: ReturnType<typeof useServerFn>;
  onClear: ReturnType<typeof useServerFn>; refresh: () => Promise<void>;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return questions;
    return questions.filter((x) =>
      x.prompt.toLowerCase().includes(q) ||
      String(x.pdf_number ?? "").includes(q) ||
      (`#${x.pdf_number}`).includes(q),
    );
  }, [questions, query]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-foreground">{questions.length} sual</p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setAdding(true)} className="rounded-lg"><Plus className="mr-1 h-4 w-4" /> Sual əlavə et</Button>
          {questions.length > 0 && (
            <Button size="sm" variant="outline" onClick={async () => { if (!confirm("Bütün suallar silinsin?")) return; await onClear({ data: { password, assessment_id: assessmentId } }); await refresh(); toast.success("Suallar silindi."); }}
              className="rounded-lg text-destructive hover:text-destructive"><Trash2 className="mr-1 h-4 w-4" /> Hamısını sil</Button>
          )}
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Axtar: mətn və ya PDF nömrəsi (məs. 87)" className="h-10 rounded-lg pl-9" />
      </div>

      {adding && (
        <QuestionForm onCancel={() => setAdding(false)}
          onSubmit={async (vals) => { await onSave({ data: { password, assessment_id: assessmentId, ...vals } }); setAdding(false); await refresh(); toast.success("Sual əlavə edildi."); }} />
      )}

      {filtered.map((q, idx) =>
        editing === q.id ? (
          <QuestionForm key={q.id} initial={q} onCancel={() => setEditing(null)}
            onSubmit={async (vals) => { await onSave({ data: { password, id: q.id, assessment_id: assessmentId, ...vals } }); setEditing(null); await refresh(); toast.success("Yadda saxlanıldı."); }} />
        ) : (
          <div key={q.id} className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-start justify-between gap-3">
              <p className="font-medium text-foreground">
                {idx + 1}. {q.pdf_number != null && <span className="mr-1 rounded bg-secondary px-1.5 py-0.5 text-xs font-semibold text-muted-foreground">PDF #{q.pdf_number}</span>}{q.prompt}
              </p>
              <div className="flex shrink-0 gap-1">
                <Button size="icon" variant="ghost" onClick={() => setEditing(q.id)}><Pencil className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" onClick={async () => { await onDelete({ data: { password, id: q.id } }); await refresh(); }} className="text-destructive hover:text-destructive"><Trash2 className="h-4 w-4" /></Button>
              </div>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {q.options.map((o, i) => (
                <div key={i} className={cn("rounded-lg border px-3 py-2 text-sm", i === q.correct_index ? "border-success/40 bg-success/10 font-medium text-success" : "border-border text-muted-foreground")}>
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

function QuestionForm({ initial, onSubmit, onCancel }: {
  initial?: AdminQuestion;
  onSubmit: (vals: { prompt: string; options: string[]; correct_index: number; pdf_number: number | null }) => Promise<void>;
  onCancel: () => void;
}) {
  const [prompt, setPrompt] = useState(initial?.prompt ?? "");
  const [options, setOptions] = useState<string[]>(initial?.options ?? ["", ""]);
  const [correct, setCorrect] = useState(initial?.correct_index ?? 0);
  const [pdfNum, setPdfNum] = useState(initial?.pdf_number != null ? String(initial.pdf_number) : "");
  const [saving, setSaving] = useState(false);

  async function submit() {
    const clean = options.map((o) => o.trim()).filter(Boolean);
    if (!prompt.trim()) return toast.error("Sual mətnini daxil edin.");
    if (clean.length < 2) return toast.error("Ən azı 2 variant lazımdır.");
    setSaving(true);
    try {
      await onSubmit({ prompt: prompt.trim(), options: clean, correct_index: Math.min(correct, clean.length - 1), pdf_number: pdfNum.trim() ? parseInt(pdfNum, 10) : null });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Xəta.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl border border-primary/40 bg-card p-5">
      <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <div>
          <Label className="mb-1.5 block">Sual</Label>
          <Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} className="rounded-xl" rows={2} />
        </div>
        <div className="w-28">
          <Label className="mb-1.5 block">PDF №</Label>
          <Input type="number" value={pdfNum} onChange={(e) => setPdfNum(e.target.value)} className="h-10 rounded-lg" placeholder="—" />
        </div>
      </div>
      <Label className="mb-1.5 block">Variantlar (düzgün cavabı seçin)</Label>
      <div className="space-y-2">
        {options.map((o, i) => (
          <div key={i} className="flex items-center gap-2">
            <button type="button" onClick={() => setCorrect(i)}
              className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border text-sm font-semibold", correct === i ? "border-success bg-success/10 text-success" : "border-border text-muted-foreground")}>
              {correct === i ? <Check className="h-4 w-4" /> : String.fromCharCode(65 + i)}
            </button>
            <Input value={o} onChange={(e) => setOptions((prev) => prev.map((x, idx) => (idx === i ? e.target.value : x)))} className="h-9 rounded-lg" placeholder={`Variant ${String.fromCharCode(65 + i)}`} />
            {options.length > 2 && (
              <Button size="icon" variant="ghost" onClick={() => { setOptions((prev) => prev.filter((_, idx) => idx !== i)); if (correct >= i && correct > 0) setCorrect((c) => c - 1); }}><X className="h-4 w-4" /></Button>
            )}
          </div>
        ))}
      </div>
      {options.length < 8 && (
        <Button size="sm" variant="ghost" onClick={() => setOptions((prev) => [...prev, ""])} className="mt-2"><Plus className="mr-1 h-4 w-4" /> Variant əlavə et</Button>
      )}
      <div className="mt-4 flex gap-2">
        <Button onClick={submit} disabled={saving} className="rounded-xl">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Yadda saxla"}</Button>
        <Button variant="outline" onClick={onCancel} className="rounded-xl">Ləğv et</Button>
      </div>
    </div>
  );
}

function AccessKeysManager({ assessmentId, keys, password, onGenerate, onBlock, onReset, onDelete, refresh }: {
  assessmentId: string; keys: AccessKey[]; password: string;
  onGenerate: ReturnType<typeof useServerFn>; onBlock: ReturnType<typeof useServerFn>;
  onReset: ReturnType<typeof useServerFn>; onDelete: ReturnType<typeof useServerFn>; refresh: () => Promise<void>;
}) {
  const [count, setCount] = useState("10");
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);

  async function generate() {
    setBusy(true);
    try {
      await onGenerate({ data: { password, assessment_id: assessmentId, count: parseInt(count, 10) || 1 } });
      await refresh(); toast.success("Açarlar yaradıldı.");
    } catch (err) { toast.error(err instanceof Error ? err.message : "Xəta."); } finally { setBusy(false); }
  }
  async function addCustom() {
    const list = custom.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
    if (list.length === 0) return toast.error("Açar daxil edin.");
    setBusy(true);
    try {
      await onGenerate({ data: { password, assessment_id: assessmentId, keys: list } });
      setCustom(""); await refresh(); toast.success("Açarlar əlavə edildi.");
    } catch (err) { toast.error(err instanceof Error ? err.message : "Xəta."); } finally { setBusy(false); }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-3xl border border-border bg-card p-6" style={{ boxShadow: "var(--shadow-soft)" }}>
        <h3 className="mb-4 text-base font-semibold text-foreground">Giriş açarları yarat</h3>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5"><Label>Avtomatik say</Label>
            <Input type="number" min={1} value={count} onChange={(e) => setCount(e.target.value)} className="h-11 w-28 rounded-xl" /></div>
          <Button onClick={generate} disabled={busy} className="h-11 rounded-xl">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Yarat"}</Button>
        </div>
        <div className="mt-4 space-y-1.5">
          <Label>Və ya xüsusi açarlar (vergül və ya sətirlə ayır)</Label>
          <Textarea value={custom} onChange={(e) => setCustom(e.target.value)} rows={2} className="rounded-xl" placeholder="QUIZ1234, USER2025, TESTA01" />
          <Button onClick={addCustom} disabled={busy} variant="outline" className="mt-2 h-10 rounded-xl"><Plus className="mr-1 h-4 w-4" /> Əlavə et</Button>
        </div>
      </div>

      {keys.length === 0 ? (
        <Empty icon={<KeyRound />} text="Hələ açar yoxdur." />
      ) : (
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">{keys.length} açar</p>
          {keys.map((k) => (
            <div key={k.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4">
              <div className="flex items-center gap-3">
                <code className="rounded-lg bg-secondary px-3 py-1.5 text-sm font-bold text-foreground">{k.key_code}</code>
                <button onClick={() => { navigator.clipboard?.writeText(k.key_code); toast.success("Kopyalandı."); }} className="text-muted-foreground hover:text-primary"><Copy className="h-4 w-4" /></button>
                <span className="text-xs text-muted-foreground">{k.blocked ? "Bloklanıb" : k.device_id ? "Cihaza bağlı" : "Boş"}</span>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={async () => { await onReset({ data: { password, id: k.id } }); await refresh(); toast.success("Cihaz sıfırlandı."); }} className="rounded-lg"><RotateCcw className="mr-1 h-4 w-4" /> Reset</Button>
                <Button size="sm" variant="outline" onClick={async () => { await onBlock({ data: { password, id: k.id, blocked: !k.blocked } }); await refresh(); }} className="rounded-lg">
                  {k.blocked ? <><Unlock className="mr-1 h-4 w-4" /> Aç</> : <><Lock className="mr-1 h-4 w-4" /> Blokla</>}
                </Button>
                <Button size="icon" variant="ghost" onClick={async () => { await onDelete({ data: { password, id: k.id } }); await refresh(); }} className="text-destructive hover:text-destructive"><Trash2 className="h-4 w-4" /></Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ParticipantRow({ p, onBlock, onUnblock, onReset, onDelete }: {
  p: Participant; onBlock: () => void; onUnblock: (resume: boolean) => void; onReset: (newSeat?: number) => void; onDelete: () => void;
}) {
  const [seat, setSeat] = useState(String(p.seat_number));
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center gap-3">
        <div className={cn("flex h-11 w-11 items-center justify-center rounded-xl text-lg font-bold", p.blocked ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary")}>{p.seat_number}</div>
        <div>
          <p className="font-semibold text-foreground">Sıra #{p.seat_number}</p>
          <p className="text-xs text-muted-foreground">{p.blocked ? "Bloklanıb" : p.device_id ? "Cihaza bağlı" : "Boş cihaz"}{p.access_key ? ` · ${p.access_key}` : ""}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Input type="number" min={1} value={seat} onChange={(e) => setSeat(e.target.value)} className="h-9 w-20 rounded-lg" />
        <Button size="sm" variant="outline" onClick={() => onReset(parseInt(seat, 10) || p.seat_number)} className="rounded-lg"><RotateCcw className="mr-1 h-4 w-4" /> Cihaz reset</Button>
        {p.blocked ? (
          <>
            <Button size="sm" variant="outline" onClick={() => onUnblock(true)} className="rounded-lg"><Unlock className="mr-1 h-4 w-4" /> Aç (davam)</Button>
            <Button size="sm" variant="outline" onClick={() => onUnblock(false)} className="rounded-lg">Aç (sıfırla)</Button>
          </>
        ) : (
          <Button size="sm" variant="outline" onClick={onBlock} className="rounded-lg"><Lock className="mr-1 h-4 w-4" /> Blokla</Button>
        )}
        <Button size="icon" variant="ghost" onClick={onDelete} className="text-destructive hover:text-destructive"><Trash2 className="h-4 w-4" /></Button>
      </div>
    </div>
  );
}

function MessageSender({ assessment, participants, password, onSend }: {
  assessment: Assessment; participants: Participant[]; password: string; onSend: ReturnType<typeof useServerFn>;
}) {
  const [body, setBody] = useState("");
  const [kind, setKind] = useState<"info" | "warning">("info");
  const [target, setTarget] = useState<string>("all");
  const [sending, setSending] = useState(false);

  async function send() {
    if (!body.trim()) return toast.error("Mesaj mətnini daxil edin.");
    setSending(true);
    try {
      await onSend({ data: { password, assessment_id: assessment.id, seat_number: target === "all" ? null : parseInt(target, 10), body: body.trim(), kind } });
      setBody(""); toast.success("Mesaj göndərildi.");
    } catch (err) { toast.error(err instanceof Error ? err.message : "Xəta."); } finally { setSending(false); }
  }

  return (
    <div className="rounded-3xl border border-border bg-card p-6" style={{ boxShadow: "var(--shadow-soft)" }}>
      <h3 className="mb-4 text-base font-semibold text-foreground">"{assessment.name}" üçün anlıq ismarıc</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5"><Label>Hədəf</Label>
          <select value={target} onChange={(e) => setTarget(e.target.value)} className="h-11 w-full rounded-xl border border-border bg-card px-3 text-sm">
            <option value="all">Hamıya</option>
            {participants.map((p) => <option key={p.id} value={String(p.seat_number)}>Sıra #{p.seat_number}</option>)}
          </select></div>
        <div className="space-y-1.5"><Label>Tip</Label>
          <select value={kind} onChange={(e) => setKind(e.target.value as "info" | "warning")} className="h-11 w-full rounded-xl border border-border bg-card px-3 text-sm">
            <option value="info">Məlumat</option><option value="warning">Xəbərdarlıq</option>
          </select></div>
      </div>
      <div className="mt-3 space-y-1.5"><Label>Mesaj</Label>
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} className="rounded-xl" placeholder="İstifadəçilərə göndəriləcək mesaj…" /></div>
      <Button onClick={send} disabled={sending} className="mt-4 h-11 rounded-xl">{sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Send className="mr-1.5 h-4 w-4" /> Göndər</>}</Button>
    </div>
  );
}

function ErrorsPanel({ errors, questions, assessmentName, password, onSave, onResolve, onDelete, refresh }: {
  errors: ProcessingError[]; questions: AdminQuestion[]; assessmentName: string; password: string;
  onSave: ReturnType<typeof useServerFn>; onResolve: ReturnType<typeof useServerFn>; onDelete: ReturnType<typeof useServerFn>; refresh: () => Promise<void>;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  if (errors.length === 0) return <Empty icon={<AlertTriangle />} text="Emal xətası yoxdur. 🎉" />;
  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-muted-foreground">{errors.length} qeyd</p>
      {errors.map((e) => {
        const linked = e.question_id ? questions.find((q) => q.id === e.question_id) ||
          questions.find((q) => q.pdf_number != null && q.pdf_number === e.question_number) : questions.find((q) => q.pdf_number != null && q.pdf_number === e.question_number);
        return (
          <div key={e.id} className="rounded-2xl border border-border bg-card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn("rounded-md px-2 py-0.5 text-xs font-semibold", e.status === "resolved" ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive")}>
                    {e.status === "resolved" ? "Həll edildi" : "Gözləyir"}
                  </span>
                  {e.question_number != null && <span className="rounded-md bg-secondary px-2 py-0.5 text-xs font-semibold text-muted-foreground">PDF #{e.question_number}</span>}
                </div>
                <p className="mt-2 font-medium text-foreground">{e.reason}</p>
                <p className="mt-1 text-sm text-muted-foreground">{assessmentName}{e.file_name ? ` · ${e.file_name}` : ""} · {new Date(e.created_at).toLocaleString("az-AZ")}</p>
                {e.raw_excerpt && <p className="mt-1 text-xs italic text-muted-foreground">“{e.raw_excerpt}”</p>}
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                {linked && <Button size="sm" variant="outline" onClick={() => setEditing(editing === e.id ? null : e.id)} className="rounded-lg"><Pencil className="mr-1 h-4 w-4" /> Sualı düzəlt</Button>}
                <Button size="sm" variant="outline" onClick={async () => { await onResolve({ data: { password, id: e.id, status: e.status === "resolved" ? "pending" : "resolved" } }); await refresh(); }} className="rounded-lg">
                  {e.status === "resolved" ? "Yenidən aç" : <><Check className="mr-1 h-4 w-4" /> Bağla</>}
                </Button>
                <Button size="icon" variant="ghost" onClick={async () => { await onDelete({ data: { password, id: e.id } }); await refresh(); }} className="text-destructive hover:text-destructive"><Trash2 className="h-4 w-4" /></Button>
              </div>
            </div>
            {editing === e.id && linked && (
              <div className="mt-4">
                <QuestionForm initial={linked} onCancel={() => setEditing(null)}
                  onSubmit={async (vals) => { await onSave({ data: { password, id: linked.id, assessment_id: linked.assessment_id, ...vals } }); setEditing(null); await refresh(); toast.success("Sual düzəldildi."); }} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

type ResultDetailRow = { prompt: string; pdf_number: number | null; options: string[]; chosen: number | null; correct: number };

function ResultRow({ r }: { r: AdminResult }) {
  const [open, setOpen] = useState(false);
  const details = Array.isArray(r.details) ? (r.details as ResultDetailRow[]) : null;
  const pct = Math.round((r.score / Math.max(r.total, 1)) * 100);
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-lg font-bold text-primary">{r.seat_number || "—"}</div>
          <div>
            <p className="font-semibold text-foreground">{r.score}/{r.total} · {pct}%</p>
            <p className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString("az-AZ")}</p>
          </div>
        </div>
        {details && <Button size="sm" variant="outline" onClick={() => setOpen((o) => !o)} className="rounded-lg">{open ? "Gizlət" : "Hesabat"}</Button>}
      </div>
      {open && details && (
        <div className="mt-4 space-y-2 border-t border-border pt-4">
          {details.map((d, i) => {
            const ok = d.chosen === d.correct;
            return (
              <div key={i} className="rounded-lg border border-border p-3 text-sm">
                <p className="font-medium text-foreground">{i + 1}. {d.pdf_number != null && <span className="mr-1 text-xs text-muted-foreground">PDF #{d.pdf_number}</span>}{d.prompt}</p>
                <p className={cn("mt-1", ok ? "text-success" : "text-destructive")}>
                  {ok ? "Doğru" : "Səhv"} — Sizin: {d.chosen != null ? `${String.fromCharCode(65 + d.chosen)}. ${d.options[d.chosen] ?? "?"}` : "—"} · Doğru: {String.fromCharCode(65 + d.correct)}. {d.options[d.correct] ?? "?"}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Empty({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-border bg-card/50 py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary text-muted-foreground">{icon}</div>
      <p className="mt-3 text-sm text-muted-foreground">{text}</p>
    </div>
  );
}