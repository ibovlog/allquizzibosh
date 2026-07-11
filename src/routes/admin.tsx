import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import {
  ShieldCheck, Upload, Loader2, FileText, Trash2, ArrowLeft, BarChart3, Sparkles,
  FolderPlus, Users, MessageSquare, Plus, Pencil, Lock, Unlock, RotateCcw, Send,
  Check, X, KeyRound, AlertTriangle, Search, Copy, Flag,
  Crown, LayoutDashboard, GraduationCap, Settings, LogIn, UserPlus,
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
  resolveProcessingError, deleteProcessingError, resolveProblemReport, deleteProblemReport,
  enterCourse, getSuperData, createCourseWithAdmin, updateCourse, deleteCourse,
  updateCourseAdmin, deleteCourseAdmin,
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
  seat_min: number; seat_max: number; resume_after_unblock: boolean;
  shuffle_options: boolean; max_attempts: number; allow_range: boolean; created_at: string;
};
type AdminResult = {
  id: string; assessment_id: string | null; seat_number: number; score: number;
  total: number; details: unknown; attempt_number: number; started_at: string | null;
  blank_count: number | null; access_key: string | null; created_at: string;
};
type AdminQuestion = {
  id: string; assessment_id: string; prompt: string; options: string[];
  correct_index: number; position: number; pdf_number: number | null; source_file: string | null;
};
type Participant = {
  id: string; assessment_id: string; seat_number: number; access_key: string | null;
  device_id: string | null; blocked: boolean; completed: boolean; attempt_count: number; created_at: string;
};
type AccessKey = {
  id: string; assessment_id: string; key_code: string; device_id: string | null;
  blocked: boolean; completed: boolean; attempt_count: number; created_at: string;
};
type ProcessingError = {
  id: string; assessment_id: string | null; file_name: string | null;
  question_number: number | null; reason: string; raw_excerpt: string | null;
  question_id: string | null; status: string; created_at: string;
};
type ProblemReport = {
  id: string; assessment_id: string; question_id: string | null; pdf_number: number | null;
  question_text: string | null; seat_number: number | null; access_key: string | null;
  reason: string; status: string; created_at: string;
};
type SuperCourse = {
  id: string; name: string; slug: string; is_active: boolean;
  logo_url: string | null; primary_color: string | null;
  login_title: string | null; login_subtitle: string | null; created_at: string;
};
type SuperAdminRow = {
  id: string; course_id: string; username: string; is_active: boolean;
  created_at: string; last_login_at: string | null;
};
type SuperData = {
  courses: SuperCourse[];
  admins: SuperAdminRow[];
  statsByCourse: Record<string, { assessments: number; users: number }>;
  totals: { courses: number; admins: number; assessments: number; users: number; activeUsers: number };
};

function AdminPage() {
  const login = useServerFn(adminLogin);
  const fetchData = useServerFn(getAdminData);
  const runExtract = useServerFn(extractQuiz);
  const wipeQuestions = useServerFn(clearQuestions);
  const wipeResults = useServerFn(clearResults);
  const addAssessment = useServerFn(createAssessment);
  const editAssessment = useServerFn(updateAssessment);
  const doEnterCourse = useServerFn(enterCourse);
  const fetchSuper = useServerFn(getSuperData);
  const addCourseWithAdmin = useServerFn(createCourseWithAdmin);
  const editCourse = useServerFn(updateCourse);
  const removeCourse = useServerFn(deleteCourse);
  const editCourseAdmin = useServerFn(updateCourseAdmin);
  const removeCourseAdmin = useServerFn(deleteCourseAdmin);
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
  const resolveReport = useServerFn(resolveProblemReport);
  const removeReport = useServerFn(deleteProblemReport);

  const [token, setToken] = useState("");
  const [userInput, setUserInput] = useState("");
  const [pwInput, setPwInput] = useState("");
  const [role, setRole] = useState<"super" | "course" | null>(null);
  const [courseName, setCourseName] = useState<string | null>(null);
  const [superToken, setSuperToken] = useState("");
  const [superMode, setSuperMode] = useState(false);
  const [superData, setSuperData] = useState<SuperData | null>(null);
  const [authed, setAuthed] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [results, setResults] = useState<AdminResult[]>([]);
  const [questions, setQuestions] = useState<AdminQuestion[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [accessKeys, setAccessKeys] = useState<AccessKey[]>([]);
  const [procErrors, setProcErrors] = useState<ProcessingError[]>([]);
  const [problemReports, setProblemReports] = useState<ProblemReport[]>([]);
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
  const [aShuffleOpt, setAShuffleOpt] = useState(true);
  const [aMaxAttempts, setAMaxAttempts] = useState("0");
  const [aAllowRange, setAAllowRange] = useState(true);

  async function refresh(pw: string) {
    const data = await fetchData({ data: { token: pw } });
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
    setProblemReports((data.problemReports ?? []) as ProblemReport[]);
    if (!selected && data.assessments.length > 0) {
      setSelected((data.assessments[0] as Assessment).id);
    }
  }

  async function doLogin() {
    if (!pwInput.trim()) { toast.error("Zəhmət olmasa şifrəni daxil edin."); return; }
    setLoggingIn(true);
    try {
      const res = await login({ data: { username: userInput.trim(), password: pwInput } });
      if (!res.ok || !res.token) { toast.error(("reason" in res && res.reason) || "İstifadəçi adı və ya şifrə yanlışdır."); return; }
      setToken(res.token);
      setRole(res.role);
      setCourseName(res.courseName ?? null);
      if (res.role === "super") {
        setSuperToken(res.token);
        const sd = await fetchSuper({ data: { token: res.token } });
        setSuperData(sd as SuperData);
        setSuperMode(true);
      } else {
        await refresh(res.token);
        setAuthed(true);
      }
    } catch {
      toast.error("Giriş zamanı xəta baş verdi.");
    } finally {
      setLoggingIn(false);
    }
  }

  async function refreshSuper() {
    try {
      const sd = await fetchSuper({ data: { token: superToken } });
      setSuperData(sd as SuperData);
    } catch {
      toast.error("Məlumatlar yenilənmədi.");
    }
  }

  async function enterCoursePanel(courseId: string) {
    try {
      const res = await doEnterCourse({ data: { token: superToken, course_id: courseId } });
      if (!res.ok || !res.token) { toast.error("Kursa keçmək alınmadı."); return; }
      setToken(res.token);
      setCourseName(res.courseName ?? null);
      setSelected("");
      await refresh(res.token);
      setSuperMode(false);
      setAuthed(true);
    } catch {
      toast.error("Kursa keçmək alınmadı.");
    }
  }

  function backToSuper() {
    setAuthed(false);
    setToken(superToken);
    setCourseName(null);
    setSuperMode(true);
    refreshSuper();
  }

  const selectedAssessment = assessments.find((a) => a.id === selected) || null;
  const aQuestions = useMemo(() => questions.filter((q) => q.assessment_id === selected), [questions, selected]);
  const aParticipants = useMemo(() => participants.filter((p) => p.assessment_id === selected), [participants, selected]);
  const aKeys = useMemo(() => accessKeys.filter((k) => k.assessment_id === selected), [accessKeys, selected]);
  const aResults = useMemo(() => results.filter((r) => r.assessment_id === selected), [results, selected]);
  const aErrors = useMemo(() => procErrors.filter((e) => e.assessment_id === selected), [procErrors, selected]);
  const aReports = useMemo(() => problemReports.filter((r) => r.assessment_id === selected), [problemReports, selected]);

  async function handleCreateAssessment() {
    if (!aName.trim()) { toast.error("Assessment adını daxil edin."); return; }
    try {
      const res = await addAssessment({
        data: {
          token, name: aName.trim(), question_count: parseInt(aCount, 10) || 20,
          order_mode: aOrder, login_mode: aLogin,
          seat_min: parseInt(aSeatMin, 10) || 1, seat_max: parseInt(aSeatMax, 10) || 100,
          shuffle_options: aShuffleOpt, max_attempts: parseInt(aMaxAttempts, 10) || 0,
          allow_range: aAllowRange,
        },
      });
      setAName("");
      await refresh(token);
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
        res = await runExtract({ data: { token, assessment_id: selected, images, source_file: file.name, replace: true } });
      } else {
        setUploadStatus("Word mətni oxunur…");
        const text = await docxToText(file);
        if (!text.trim()) { toast.error("Word faylından mətn oxunmadı."); return; }
        setUploadStatus("Mətn AI ilə təhlil olunur…");
        res = await runExtract({ data: { token, assessment_id: selected, text, source_file: file.name, replace: true } });
      }
      if (res.errors > 0) toast.warning(`${res.count} sual yaradıldı, ${res.errors} xəta qeydə alındı.`);
      else toast.success(`${res.count} sual yaradıldı!`);
      await refresh(token);
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

  if (superMode && superData) {
    return (
      <SuperDashboard
        token={superToken}
        data={superData}
        onRefresh={refreshSuper}
        onEnterCourse={enterCoursePanel}
        createCourseWithAdmin={addCourseWithAdmin}
        updateCourse={editCourse}
        deleteCourse={removeCourse}
        updateCourseAdmin={editCourseAdmin}
        deleteCourseAdmin={removeCourseAdmin}
      />
    );
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
          <p className="mt-1 text-center text-sm text-muted-foreground">İstifadəçi adı və şifrə ilə daxil olun (Super Admin üçün yalnız şifrə).</p>
          <div className="mt-6 space-y-4">
            <Input type="text" placeholder="İstifadəçi adı (Super Admin üçün boş)" value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && doLogin()} className="h-12 rounded-xl" />
            <Input type="password" placeholder="Şifrə" value={pwInput}
              onChange={(e) => setPwInput(e.target.value)}
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
            <h1 className="text-2xl font-bold text-foreground">Admin paneli{courseName ? ` — ${courseName}` : ""}</h1>
            <p className="text-sm text-muted-foreground">Assessmentlər, suallar, açarlar, iştirakçılar.</p>
          </div>
          <div className="flex items-center gap-2">
            {role === "super" && (
              <Button variant="outline" className="rounded-xl" onClick={backToSuper}>
                <Crown className="mr-1 h-4 w-4" />Super panel
              </Button>
            )}
            <Link to="/"><Button variant="outline" className="rounded-xl"><ArrowLeft className="mr-1 h-4 w-4" />Quiz</Button></Link>
          </div>
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
          <TabsList className="mb-6 grid w-full grid-cols-3 rounded-xl sm:grid-cols-8">
            <TabsTrigger value="assessments" className="rounded-lg"><FolderPlus className="mr-1 h-4 w-4" /> Paketlər</TabsTrigger>
            <TabsTrigger value="upload" className="rounded-lg"><Upload className="mr-1 h-4 w-4" /> Suallar</TabsTrigger>
            <TabsTrigger value="keys" className="rounded-lg"><KeyRound className="mr-1 h-4 w-4" /> Açarlar</TabsTrigger>
            <TabsTrigger value="participants" className="rounded-lg"><Users className="mr-1 h-4 w-4" /> İştirakçılar</TabsTrigger>
            <TabsTrigger value="messages" className="rounded-lg"><MessageSquare className="mr-1 h-4 w-4" /> Mesaj</TabsTrigger>
            <TabsTrigger value="problems" className="rounded-lg"><Flag className="mr-1 h-4 w-4" /> Problemlər</TabsTrigger>
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
                  <Input placeholder="Məs. quiz1234" value={aName} onChange={(e) => setAName(e.target.value)} className="h-11 rounded-xl" />
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
                <div className="space-y-1.5">
                  <Label>Cəhd limiti (0 = limitsiz)</Label>
                  <Input type="number" min={0} value={aMaxAttempts} onChange={(e) => setAMaxAttempts(e.target.value)} className="h-11 rounded-xl" />
                </div>
                <label className="flex items-center gap-2 self-end pb-2 text-sm text-foreground">
                  <input type="checkbox" checked={aShuffleOpt} onChange={(e) => setAShuffleOpt(e.target.checked)} className="h-4 w-4" />
                  Cavab variantlarını qarışdır
                </label>
                <label className="flex items-center gap-2 self-end pb-2 text-sm text-foreground">
                  <input type="checkbox" checked={aAllowRange} onChange={(e) => setAAllowRange(e.target.checked)} className="h-4 w-4" />
                  PDF sual aralığı seçməyə icazə ver
                </label>
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
                    onSave={async (patch) => { await editAssessment({ data: { token, id: a.id, ...patch } }); await refresh(token); toast.success("Yeniləndi."); }}
                    onToggle={async () => { await editAssessment({ data: { token, id: a.id, is_open: !a.is_open } }); await refresh(token); }}
                    onDelete={async () => {
                      if (!confirm(`"${a.name}" silinsin? Bütün məlumatları silinəcək.`)) return;
                      await removeAssessment({ data: { token, id: a.id } });
                      if (selected === a.id) setSelected("");
                      await refresh(token);
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

                <QuestionsEditor assessmentId={selected} questions={aQuestions} token={token}
                  onSave={storeQuestion} onDelete={removeQuestion} onClear={wipeQuestions} refresh={() => refresh(token)} />
              </div>
            )}
          </TabsContent>

          {/* ===== Access keys ===== */}
          <TabsContent value="keys">
            {!selectedAssessment ? (
              <Empty icon={<KeyRound />} text="Əvvəlcə assessment seçin." />
            ) : (
              <AccessKeysManager assessmentId={selected} keys={aKeys} token={token}
                onGenerate={addKeys} onBlock={blockKey} onReset={resetKey} onDelete={removeKey} refresh={() => refresh(token)} />
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
                    onBlock={async () => { await blockParticipant({ data: { token, id: p.id, blocked: true } }); await refresh(token); toast.success("Bloklandı."); }}
                    onUnblock={async (resume) => { await blockParticipant({ data: { token, id: p.id, blocked: false, resume } }); await refresh(token); toast.success(resume ? "Blok açıldı (davam edir)." : "Blok açıldı (sıfırlandı)."); }}
                    onReset={async (newSeat) => { await doReset({ data: { token, id: p.id, new_seat: newSeat } }); await refresh(token); toast.success("Cihaz sıfırlandı."); }}
                    onDelete={async () => { await removeParticipant({ data: { token, id: p.id } }); await refresh(token); }} />
                ))}
              </div>
            )}
          </TabsContent>

          {/* ===== Messages ===== */}
          <TabsContent value="messages">
            {!selectedAssessment ? (
              <Empty icon={<MessageSquare />} text="Əvvəlcə assessment seçin." />
            ) : (
              <MessageSender assessment={selectedAssessment} participants={aParticipants} token={token} onSend={postMessage} />
            )}
          </TabsContent>

          {/* ===== Processing errors ===== */}
          <TabsContent value="errors">
            {!selectedAssessment ? (
              <Empty icon={<AlertTriangle />} text="Əvvəlcə assessment seçin." />
            ) : (
              <ErrorsPanel errors={aErrors} questions={aQuestions} assessmentName={selectedAssessment.name}
                token={token} onSave={storeQuestion} onResolve={resolveErr} onDelete={removeErr} refresh={() => refresh(token)} />
            )}
          </TabsContent>

          {/* ===== Problem reports ===== */}
          <TabsContent value="problems">
            {!selectedAssessment ? (
              <Empty icon={<Flag />} text="Əvvəlcə assessment seçin." />
            ) : (
              <ProblemsPanel reports={aReports} questions={aQuestions} assessmentName={selectedAssessment.name}
                token={token} onSave={storeQuestion} onResolve={resolveReport} onDelete={removeReport} refresh={() => refresh(token)} />
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
                    <Button variant="outline" onClick={async () => { await wipeResults({ data: { token, assessment_id: selected } }); await refresh(token); toast.success("Nəticələr silindi."); }}
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
  onSave: (patch: Partial<Pick<Assessment, "question_count" | "order_mode" | "login_mode" | "seat_min" | "seat_max" | "resume_after_unblock" | "shuffle_options" | "max_attempts" | "allow_range">>) => void;
  onToggle: () => void; onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(String(a.question_count));
  const [login, setLogin] = useState(a.login_mode);
  const [smin, setSmin] = useState(String(a.seat_min));
  const [smax, setSmax] = useState(String(a.seat_max));
  const [resume, setResume] = useState(a.resume_after_unblock);
  const [shuffleOpt, setShuffleOpt] = useState(a.shuffle_options);
  const [maxAtt, setMaxAtt] = useState(String(a.max_attempts));
  const [allowRange, setAllowRange] = useState(a.allow_range);
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-semibold text-foreground">{a.name}</p>
          <p className="text-sm text-muted-foreground">
            {qCount} sual · {a.login_mode === "seat" ? "Sıra" : a.login_mode === "key" ? "Açar" : "Sıra+Açar"} ·{" "}
            {a.login_mode !== "key" && `${a.seat_min}–${a.seat_max} · `}
            {a.max_attempts === 0 ? "Limitsiz cəhd" : `${a.max_attempts} cəhd`} ·{" "}
            {a.shuffle_options ? "Variantlar qarışıq" : "Variantlar sabit"} · {a.is_open ? "Açıq" : "Bağlı"}
            {" "}· {a.allow_range ? "Aralıq seçimi açıq" : "Aralıq seçimi bağlı"}
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
          <div className="space-y-1"><Label>Cəhd limiti (0 = limitsiz)</Label>
            <Input type="number" min={0} value={maxAtt} onChange={(e) => setMaxAtt(e.target.value)} className="h-10 rounded-lg" /></div>
          <label className="flex items-center gap-2 text-sm text-foreground sm:col-span-2">
            <input type="checkbox" checked={shuffleOpt} onChange={(e) => setShuffleOpt(e.target.checked)} className="h-4 w-4" />
            Cavab variantlarını qarışdır
          </label>
          <label className="flex items-center gap-2 text-sm text-foreground sm:col-span-2">
            <input type="checkbox" checked={allowRange} onChange={(e) => setAllowRange(e.target.checked)} className="h-4 w-4" />
            PDF sual aralığı seçməyə icazə ver
          </label>
          <label className="flex items-center gap-2 text-sm text-foreground sm:col-span-2">
            <input type="checkbox" checked={resume} onChange={(e) => setResume(e.target.checked)} className="h-4 w-4" />
            Blokdan çıxarılan istifadəçi standart olaraq qaldığı yerdən davam etsin
          </label>
          <Button onClick={() => onSave({ question_count: parseInt(count, 10) || a.question_count, login_mode: login, seat_min: parseInt(smin, 10) || 1, seat_max: parseInt(smax, 10) || 100, resume_after_unblock: resume, shuffle_options: shuffleOpt, max_attempts: parseInt(maxAtt, 10) || 0, allow_range: allowRange })}
            className="h-10 rounded-lg sm:col-span-2">Saxla</Button>
        </div>
      )}
    </div>
  );
}

function QuestionsEditor({ assessmentId, questions, token, onSave, onDelete, onClear, refresh }: {
  assessmentId: string; questions: AdminQuestion[]; token: string;
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
            <Button size="sm" variant="outline" onClick={async () => { if (!confirm("Bütün suallar silinsin?")) return; await onClear({ data: { token, assessment_id: assessmentId } }); await refresh(); toast.success("Suallar silindi."); }}
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
          onSubmit={async (vals) => { await onSave({ data: { token, assessment_id: assessmentId, ...vals } }); setAdding(false); await refresh(); toast.success("Sual əlavə edildi."); }} />
      )}

      {filtered.map((q, idx) =>
        editing === q.id ? (
          <QuestionForm key={q.id} initial={q} onCancel={() => setEditing(null)}
            onSubmit={async (vals) => { await onSave({ data: { token, id: q.id, assessment_id: assessmentId, ...vals } }); setEditing(null); await refresh(); toast.success("Yadda saxlanıldı."); }} />
        ) : (
          <div key={q.id} className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-start justify-between gap-3">
              <p className="font-medium text-foreground">
                {idx + 1}. {q.pdf_number != null && <span className="mr-1 rounded bg-secondary px-1.5 py-0.5 text-xs font-semibold text-muted-foreground">PDF #{q.pdf_number}</span>}{q.prompt}
              </p>
              <div className="flex shrink-0 gap-1">
                <Button size="icon" variant="ghost" onClick={() => setEditing(q.id)}><Pencil className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" onClick={async () => { await onDelete({ data: { token, id: q.id } }); await refresh(); }} className="text-destructive hover:text-destructive"><Trash2 className="h-4 w-4" /></Button>
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

function AccessKeysManager({ assessmentId, keys, token, onGenerate, onBlock, onReset, onDelete, refresh }: {
  assessmentId: string; keys: AccessKey[]; token: string;
  onGenerate: ReturnType<typeof useServerFn>; onBlock: ReturnType<typeof useServerFn>;
  onReset: ReturnType<typeof useServerFn>; onDelete: ReturnType<typeof useServerFn>; refresh: () => Promise<void>;
}) {
  const [count, setCount] = useState("10");
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);

  async function generate() {
    setBusy(true);
    try {
      await onGenerate({ data: { token, assessment_id: assessmentId, count: parseInt(count, 10) || 1 } });
      await refresh(); toast.success("Açarlar yaradıldı.");
    } catch (err) { toast.error(err instanceof Error ? err.message : "Xəta."); } finally { setBusy(false); }
  }
  async function addCustom() {
    const list = custom.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
    if (list.length === 0) return toast.error("Açar daxil edin.");
    setBusy(true);
    try {
      await onGenerate({ data: { token, assessment_id: assessmentId, keys: list } });
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
                <Button size="sm" variant="outline" onClick={async () => { await onReset({ data: { token, id: k.id } }); await refresh(); toast.success("Cihaz sıfırlandı."); }} className="rounded-lg"><RotateCcw className="mr-1 h-4 w-4" /> Reset</Button>
                <Button size="sm" variant="outline" onClick={async () => { await onBlock({ data: { token, id: k.id, blocked: !k.blocked } }); await refresh(); }} className="rounded-lg">
                  {k.blocked ? <><Unlock className="mr-1 h-4 w-4" /> Aç</> : <><Lock className="mr-1 h-4 w-4" /> Blokla</>}
                </Button>
                <Button size="icon" variant="ghost" onClick={async () => { await onDelete({ data: { token, id: k.id } }); await refresh(); }} className="text-destructive hover:text-destructive"><Trash2 className="h-4 w-4" /></Button>
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
          <p className="text-xs text-muted-foreground">
            {p.blocked ? "Bloklanıb" : p.device_id ? "Cihaza bağlı" : "Boş cihaz"}
            {p.access_key ? ` · ${p.access_key}` : ""}
            {` · ${p.attempt_count} cəhd`}
            {p.completed ? " · Tamamlandı" : ""}
          </p>
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

function MessageSender({ assessment, participants, token, onSend }: {
  assessment: Assessment; participants: Participant[]; token: string; onSend: ReturnType<typeof useServerFn>;
}) {
  const [body, setBody] = useState("");
  const [kind, setKind] = useState<"info" | "warning">("info");
  const [target, setTarget] = useState<string>("all");
  const [sending, setSending] = useState(false);

  async function send() {
    if (!body.trim()) return toast.error("Mesaj mətnini daxil edin.");
    setSending(true);
    try {
      await onSend({ data: { token, assessment_id: assessment.id, seat_number: target === "all" ? null : parseInt(target, 10), body: body.trim(), kind } });
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

function ErrorsPanel({ errors, questions, assessmentName, token, onSave, onResolve, onDelete, refresh }: {
  errors: ProcessingError[]; questions: AdminQuestion[]; assessmentName: string; token: string;
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
                <Button size="sm" variant="outline" onClick={async () => { await onResolve({ data: { token, id: e.id, status: e.status === "resolved" ? "pending" : "resolved" } }); await refresh(); }} className="rounded-lg">
                  {e.status === "resolved" ? "Yenidən aç" : <><Check className="mr-1 h-4 w-4" /> Bağla</>}
                </Button>
                <Button size="icon" variant="ghost" onClick={async () => { await onDelete({ data: { token, id: e.id } }); await refresh(); }} className="text-destructive hover:text-destructive"><Trash2 className="h-4 w-4" /></Button>
              </div>
            </div>
            {editing === e.id && linked && (
              <div className="mt-4">
                <QuestionForm initial={linked} onCancel={() => setEditing(null)}
                  onSubmit={async (vals) => { await onSave({ data: { token, id: linked.id, assessment_id: linked.assessment_id, ...vals } }); setEditing(null); await refresh(); toast.success("Sual düzəldildi."); }} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

type ResultDetailRow = { prompt: string; pdf_number: number | null; options: string[]; chosen: number | null; correct: number };

function ProblemsPanel({ reports, questions, assessmentName, token, onSave, onResolve, onDelete, refresh }: {
  reports: ProblemReport[]; questions: AdminQuestion[]; assessmentName: string; token: string;
  onSave: ReturnType<typeof useServerFn>; onResolve: ReturnType<typeof useServerFn>; onDelete: ReturnType<typeof useServerFn>; refresh: () => Promise<void>;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  if (reports.length === 0) return <Empty icon={<Flag />} text="Bildirilən problem yoxdur. 🎉" />;
  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-muted-foreground">{reports.length} bildiriş</p>
      {reports.map((r) => {
        const linked = r.question_id
          ? questions.find((q) => q.id === r.question_id)
          : questions.find((q) => q.pdf_number != null && q.pdf_number === r.pdf_number);
        return (
          <div key={r.id} className="rounded-2xl border border-border bg-card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn("rounded-md px-2 py-0.5 text-xs font-semibold", r.status === "resolved" ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive")}>
                    {r.status === "resolved" ? "Bağlandı" : "Açıq"}
                  </span>
                  {r.pdf_number != null && <span className="rounded-md bg-secondary px-2 py-0.5 text-xs font-semibold text-muted-foreground">PDF #{r.pdf_number}</span>}
                  <span className="text-xs text-muted-foreground">
                    {r.seat_number != null ? `Sıra #${r.seat_number}` : r.access_key ? `Açar: ${r.access_key}` : "Naməlum"}
                  </span>
                </div>
                {r.question_text && <p className="mt-2 font-medium text-foreground">{r.question_text}</p>}
                <p className="mt-1 text-sm text-foreground">🚩 {r.reason}</p>
                <p className="mt-1 text-xs text-muted-foreground">{assessmentName} · {new Date(r.created_at).toLocaleString("az-AZ")}</p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                {linked && <Button size="sm" variant="outline" onClick={() => setEditing(editing === r.id ? null : r.id)} className="rounded-lg"><Pencil className="mr-1 h-4 w-4" /> Sualı düzəlt</Button>}
                <Button size="sm" variant="outline" onClick={async () => { await onResolve({ data: { token, id: r.id, status: r.status === "resolved" ? "pending" : "resolved" } }); await refresh(); }} className="rounded-lg">
                  {r.status === "resolved" ? "Yenidən aç" : <><Check className="mr-1 h-4 w-4" /> Təsdiqlə & bağla</>}
                </Button>
                <Button size="icon" variant="ghost" onClick={async () => { await onDelete({ data: { token, id: r.id } }); await refresh(); }} className="text-destructive hover:text-destructive" title="Rədd et"><Trash2 className="h-4 w-4" /></Button>
              </div>
            </div>
            {editing === r.id && linked && (
              <div className="mt-4">
                <QuestionForm initial={linked} onCancel={() => setEditing(null)}
                  onSubmit={async (vals) => { await onSave({ data: { token, id: linked.id, assessment_id: linked.assessment_id, ...vals } }); setEditing(null); await refresh(); toast.success("Sual düzəldildi, problem siyahıdan silindi."); }} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ResultRow({ r }: { r: AdminResult }) {
  const [open, setOpen] = useState(false);
  const details = Array.isArray(r.details) ? (r.details as ResultDetailRow[]) : null;
  const pct = Math.round((r.score / Math.max(r.total, 1)) * 100);
  const blank = r.blank_count ?? 0;
  const wrong = r.total - r.score - blank;
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-lg font-bold text-primary">{r.seat_number || (r.access_key ? "🔑" : "—")}</div>
          <div>
            <p className="font-semibold text-foreground">
              Cəhd {r.attempt_number} · {r.score}/{r.total} · {pct}%
            </p>
            <p className="text-xs text-muted-foreground">
              Düz {r.score} · Səhv {wrong} · Boş {blank}
              {r.access_key ? ` · ${r.access_key}` : ""}
            </p>
            <p className="text-xs text-muted-foreground">
              {r.started_at ? `Başlama: ${new Date(r.started_at).toLocaleString("az-AZ")} · ` : ""}
              Bitirmə: {new Date(r.created_at).toLocaleString("az-AZ")}
            </p>
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

// ===========================================================================
// SUPER ADMIN DASHBOARD
// ===========================================================================
type Callable = (args: { data: Record<string, unknown> }) => Promise<unknown>;

function fmtDate(v: string | null): string {
  if (!v) return "—";
  try {
    return new Date(v).toLocaleString("az-AZ", {
      day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
  } catch { return "—"; }
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number | string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5" style={{ boxShadow: "var(--shadow-card)" }}>
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">{icon}</div>
        <div>
          <p className="text-2xl font-bold text-foreground">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </div>
    </div>
  );
}

function SuperDashboard(props: {
  token: string;
  data: SuperData;
  onRefresh: () => Promise<void> | void;
  onEnterCourse: (courseId: string) => void;
  createCourseWithAdmin: Callable;
  updateCourse: Callable;
  deleteCourse: Callable;
  updateCourseAdmin: Callable;
  deleteCourseAdmin: Callable;
}) {
  const { token, data, onRefresh, onEnterCourse } = props;
  const courseName = (id: string) => data.courses.find((c) => c.id === id)?.name ?? "—";

  // create course-admin form
  const [cName, setCName] = useState("");
  const [cUser, setCUser] = useState("");
  const [cPass, setCPass] = useState("");
  const [cActive, setCActive] = useState(true);
  const [creating, setCreating] = useState(false);

  // edit admin
  const [editId, setEditId] = useState<string | null>(null);
  const [eUser, setEUser] = useState("");
  const [ePass, setEPass] = useState("");

  async function handleCreate() {
    if (!cName.trim() || !cUser.trim() || !cPass.trim()) {
      toast.error("Kurs adı, istifadəçi adı və şifrə tələb olunur."); return;
    }
    setCreating(true);
    try {
      await props.createCourseWithAdmin({ data: { token, course_name: cName.trim(), username: cUser.trim(), password: cPass, is_active: cActive } });
      setCName(""); setCUser(""); setCPass(""); setCActive(true);
      await onRefresh();
      toast.success("Kurs və admin yaradıldı.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Xəta baş verdi.");
    } finally { setCreating(false); }
  }

  async function toggleAdmin(id: string, is_active: boolean) {
    try {
      await props.updateCourseAdmin({ data: { token, id, is_active } });
      await onRefresh();
    } catch (err) { toast.error(err instanceof Error ? err.message : "Xəta baş verdi."); }
  }

  async function saveEdit(id: string) {
    const patch: Record<string, unknown> = { token, id };
    if (eUser.trim()) patch.username = eUser.trim();
    if (ePass.trim()) patch.password = ePass;
    if (!eUser.trim() && !ePass.trim()) { setEditId(null); return; }
    try {
      await props.updateCourseAdmin({ data: patch });
      setEditId(null); setEUser(""); setEPass("");
      await onRefresh();
      toast.success("Yeniləndi.");
    } catch (err) { toast.error(err instanceof Error ? err.message : "Xəta baş verdi."); }
  }

  async function delAdmin(id: string) {
    if (!confirm("Bu admini silmək istəyirsiniz?")) return;
    try {
      await props.deleteCourseAdmin({ data: { token, id } });
      await onRefresh();
      toast.success("Admin silindi.");
    } catch (err) { toast.error(err instanceof Error ? err.message : "Xəta baş verdi."); }
  }

  async function toggleCourse(id: string, is_active: boolean) {
    try {
      await props.updateCourse({ data: { token, id, is_active } });
      await onRefresh();
    } catch (err) { toast.error(err instanceof Error ? err.message : "Xəta baş verdi."); }
  }

  async function delCourse(id: string) {
    if (!confirm("Kurs və ona aid BÜTÜN məlumatlar (assessmentlər, suallar, nəticələr) silinəcək. Davam edilsin?")) return;
    try {
      await props.deleteCourse({ data: { token, id } });
      await onRefresh();
      toast.success("Kurs silindi.");
    } catch (err) { toast.error(err instanceof Error ? err.message : "Xəta baş verdi."); }
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Crown className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Super Admin</h1>
              <p className="text-sm text-muted-foreground">Sistem idarəetmə paneli</p>
            </div>
          </div>
          <Link to="/"><Button variant="outline" className="rounded-xl"><ArrowLeft className="mr-1 h-4 w-4" />Quiz</Button></Link>
        </div>

        <Tabs defaultValue="stats">
          <TabsList className="mb-6 flex h-auto flex-wrap gap-1">
            <TabsTrigger value="stats"><LayoutDashboard className="mr-1 h-4 w-4" />Statistika</TabsTrigger>
            <TabsTrigger value="courses"><GraduationCap className="mr-1 h-4 w-4" />Kurslar</TabsTrigger>
            <TabsTrigger value="admins"><Users className="mr-1 h-4 w-4" />Kurs Adminləri</TabsTrigger>
            <TabsTrigger value="users"><Users className="mr-1 h-4 w-4" />İstifadəçilər</TabsTrigger>
            <TabsTrigger value="reports"><BarChart3 className="mr-1 h-4 w-4" />Hesabatlar</TabsTrigger>
            <TabsTrigger value="settings"><Settings className="mr-1 h-4 w-4" />Sistem ayarları</TabsTrigger>
          </TabsList>

          {/* STATS */}
          <TabsContent value="stats" className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <StatCard icon={<GraduationCap className="h-5 w-5" />} label="Kurslar" value={data.totals.courses} />
              <StatCard icon={<Users className="h-5 w-5" />} label="Kurs adminləri" value={data.totals.admins} />
              <StatCard icon={<FileText className="h-5 w-5" />} label="Assessmentlər" value={data.totals.assessments} />
              <StatCard icon={<Users className="h-5 w-5" />} label="İstifadəçilər" value={data.totals.users} />
              <StatCard icon={<BarChart3 className="h-5 w-5" />} label="Aktiv istifadəçilər" value={data.totals.activeUsers} />
            </div>
          </TabsContent>

          {/* COURSES */}
          <TabsContent value="courses" className="space-y-3">
            {data.courses.length === 0 && <Empty icon={<GraduationCap className="h-5 w-5" />} text="Hələ kurs yoxdur. 'Kurs Adminləri' bölməsindən yeni kurs və admin yaradın." />}
            {data.courses.map((c) => {
              const st = data.statsByCourse[c.id] || { assessments: 0, users: 0 };
              return (
                <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4">
                  <div>
                    <p className="font-semibold text-foreground">{c.name}</p>
                    <p className="text-xs text-muted-foreground">{st.assessments} assessment · {st.users} istifadəçi · yaradılıb {fmtDate(c.created_at)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium", c.is_active ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive")}>
                      {c.is_active ? "Aktiv" : "Deaktiv"}
                    </span>
                    <Button size="sm" variant="outline" className="rounded-xl" onClick={() => toggleCourse(c.id, !c.is_active)}>
                      {c.is_active ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
                    </Button>
                    <Button size="sm" variant="outline" className="rounded-xl" onClick={() => onEnterCourse(c.id)}>
                      <LogIn className="mr-1 h-4 w-4" />Kursa keç
                    </Button>
                    <Button size="sm" variant="outline" className="rounded-xl text-destructive" onClick={() => delCourse(c.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </TabsContent>

          {/* ADMINS */}
          <TabsContent value="admins" className="space-y-6">
            <div className="rounded-2xl border border-border bg-card p-5" style={{ boxShadow: "var(--shadow-card)" }}>
              <h3 className="flex items-center gap-2 font-semibold text-foreground"><UserPlus className="h-4 w-4" />Yeni Kurs Admini</h3>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div>
                  <Label className="text-xs">Kurs adı</Label>
                  <Input value={cName} onChange={(e) => setCName(e.target.value)} placeholder="Məs: Riyaziyyat kursu" className="mt-1 rounded-xl" />
                </div>
                <div>
                  <Label className="text-xs">İstifadəçi adı</Label>
                  <Input value={cUser} onChange={(e) => setCUser(e.target.value)} placeholder="məs: riyaziyyat_admin" className="mt-1 rounded-xl" />
                </div>
                <div>
                  <Label className="text-xs">Şifrə</Label>
                  <Input type="text" value={cPass} onChange={(e) => setCPass(e.target.value)} placeholder="Şifrə" className="mt-1 rounded-xl" />
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2 text-sm text-foreground">
                    <input type="checkbox" checked={cActive} onChange={(e) => setCActive(e.target.checked)} className="h-4 w-4 rounded" />
                    Aktiv
                  </label>
                </div>
              </div>
              <Button onClick={handleCreate} disabled={creating} className="mt-4 rounded-xl">
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Plus className="mr-1 h-4 w-4" />Yarat</>}
              </Button>
            </div>

            {data.admins.length === 0 && <Empty icon={<Users className="h-5 w-5" />} text="Hələ kurs admini yoxdur." />}
            <div className="space-y-3">
              {data.admins.map((a) => (
                <div key={a.id} className="rounded-2xl border border-border bg-card p-4">
                  {editId === a.id ? (
                    <div className="grid gap-3 sm:grid-cols-3">
                      <Input value={eUser} onChange={(e) => setEUser(e.target.value)} placeholder="Yeni istifadəçi adı" className="rounded-xl" />
                      <Input type="text" value={ePass} onChange={(e) => setEPass(e.target.value)} placeholder="Yeni şifrə" className="rounded-xl" />
                      <div className="flex gap-2">
                        <Button size="sm" className="rounded-xl" onClick={() => saveEdit(a.id)}><Check className="h-4 w-4" /></Button>
                        <Button size="sm" variant="outline" className="rounded-xl" onClick={() => { setEditId(null); setEUser(""); setEPass(""); }}><X className="h-4 w-4" /></Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-foreground">{a.username}</p>
                        <p className="text-xs text-muted-foreground">
                          {courseName(a.course_id)} · yaradılıb {fmtDate(a.created_at)} · son giriş {fmtDate(a.last_login_at)}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium", a.is_active ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive")}>
                          {a.is_active ? "Aktiv" : "Deaktiv"}
                        </span>
                        <Button size="sm" variant="outline" className="rounded-xl" onClick={() => { setEditId(a.id); setEUser(a.username); setEPass(""); }}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="outline" className="rounded-xl" onClick={() => toggleAdmin(a.id, !a.is_active)}>
                          {a.is_active ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
                        </Button>
                        <Button size="sm" variant="outline" className="rounded-xl" onClick={() => onEnterCourse(a.course_id)}>
                          <LogIn className="mr-1 h-4 w-4" />Panel
                        </Button>
                        <Button size="sm" variant="outline" className="rounded-xl text-destructive" onClick={() => delAdmin(a.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </TabsContent>

          {/* USERS OVERVIEW */}
          <TabsContent value="users" className="space-y-3">
            <p className="text-sm text-muted-foreground">Kurslar üzrə istifadəçi sayları. Detallar üçün kursa keçin.</p>
            {data.courses.map((c) => {
              const st = data.statsByCourse[c.id] || { assessments: 0, users: 0 };
              return (
                <div key={c.id} className="flex items-center justify-between rounded-2xl border border-border bg-card p-4">
                  <div>
                    <p className="font-semibold text-foreground">{c.name}</p>
                    <p className="text-xs text-muted-foreground">{st.users} istifadəçi</p>
                  </div>
                  <Button size="sm" variant="outline" className="rounded-xl" onClick={() => onEnterCourse(c.id)}><LogIn className="mr-1 h-4 w-4" />Bax</Button>
                </div>
              );
            })}
          </TabsContent>

          {/* REPORTS OVERVIEW */}
          <TabsContent value="reports" className="space-y-3">
            <p className="text-sm text-muted-foreground">Kurslar üzrə ümumi hesabat. Ətraflı nəticə və problem hesabatları üçün kursa keçin.</p>
            {data.courses.map((c) => {
              const st = data.statsByCourse[c.id] || { assessments: 0, users: 0 };
              return (
                <div key={c.id} className="flex items-center justify-between rounded-2xl border border-border bg-card p-4">
                  <div>
                    <p className="font-semibold text-foreground">{c.name}</p>
                    <p className="text-xs text-muted-foreground">{st.assessments} assessment · {st.users} istifadəçi</p>
                  </div>
                  <Button size="sm" variant="outline" className="rounded-xl" onClick={() => onEnterCourse(c.id)}><BarChart3 className="mr-1 h-4 w-4" />Hesabatlar</Button>
                </div>
              );
            })}
          </TabsContent>

          {/* SETTINGS */}
          <TabsContent value="settings" className="space-y-4">
            <div className="rounded-2xl border border-border bg-card p-5">
              <h3 className="font-semibold text-foreground">Sistem məlumatı</h3>
              <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                <li>Cəmi kurs: <span className="font-medium text-foreground">{data.totals.courses}</span></li>
                <li>Cəmi kurs admini: <span className="font-medium text-foreground">{data.totals.admins}</span></li>
                <li>Cəmi assessment: <span className="font-medium text-foreground">{data.totals.assessments}</span></li>
                <li>Super Admin girişi: <span className="font-medium text-foreground">yalnız master şifrə ilə</span></li>
              </ul>
              <Button variant="outline" className="mt-4 rounded-xl" onClick={() => onRefresh()}>
                <RotateCcw className="mr-1 h-4 w-4" />Məlumatları yenilə
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Qeyd: Super Admin şifrəsi sistem parametrlərində (ADMIN_PASSWORD) saxlanılır və buradan dəyişdirilmir.
            </p>
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}