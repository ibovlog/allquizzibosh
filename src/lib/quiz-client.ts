import { supabase } from "@/integrations/supabase/client";

export type QuizQuestion = {
  id: string;
  prompt: string;
  options: string[];
  correct_index: number;
  position: number;
};

export async function fetchQuestions(assessmentId: string): Promise<QuizQuestion[]> {
  const { data, error } = await supabase
    .from("questions")
    .select("id, prompt, options, correct_index, position")
    .eq("assessment_id", assessmentId)
    .order("position", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((q) => ({
    ...q,
    options: Array.isArray(q.options) ? (q.options as string[]) : [],
  }));
}

export async function submitResult(input: {
  assessment_id: string;
  seat_number: number;
  score: number;
  total: number;
}): Promise<void> {
  const { error } = await supabase.from("quiz_results").insert(input);
  if (error) throw error;
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