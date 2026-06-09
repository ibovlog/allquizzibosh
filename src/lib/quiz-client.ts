import { supabase } from "@/integrations/supabase/client";

export type QuizQuestion = {
  id: string;
  prompt: string;
  options: string[];
  correct_index: number;
  position: number;
  pdf_number: number | null;
};

export async function fetchQuestions(assessmentId: string): Promise<QuizQuestion[]> {
  const { data, error } = await supabase
    .from("questions")
    .select("id, prompt, options, correct_index, position, pdf_number")
    .eq("assessment_id", assessmentId)
    .order("position", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((q) => ({
    ...q,
    options: Array.isArray(q.options) ? (q.options as string[]) : [],
    pdf_number: q.pdf_number ?? null,
  }));
}

export type ResultDetail = {
  prompt: string;
  pdf_number: number | null;
  options: string[];
  chosen: number | null;
  correct: number;
};

export async function submitResult(input: {
  assessment_id: string;
  seat_number: number;
  score: number;
  total: number;
  details?: ResultDetail[];
}): Promise<void> {
  const { error } = await supabase.from("quiz_results").insert(input);
  if (error) throw error;
}

// Extract plain text from a .docx file in the browser using mammoth.
export async function docxToText(file: File): Promise<string> {
  const mammoth = await import("mammoth/mammoth.browser");
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value ?? "";
}

// Stable per-device identifier kept in localStorage.
export function getDeviceId(): string {
  const KEY = "quizDeviceId";
  let id = localStorage.getItem(KEY);
  if (!id) {
    id =
      (crypto.randomUUID?.() ?? `dev-${Date.now()}-${Math.random().toString(36).slice(2)}`) +
      "-" +
      Math.random().toString(36).slice(2, 8);
    localStorage.setItem(KEY, id);
  }
  return id;
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}