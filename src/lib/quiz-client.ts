import { supabase } from "@/integrations/supabase/client";

export type QuizQuestion = {
  id: string;
  prompt: string;
  options: string[];
  correct_index: number;
  position: number;
};

export async function fetchQuestions(): Promise<QuizQuestion[]> {
  const { data, error } = await supabase
    .from("questions")
    .select("id, prompt, options, correct_index, position")
    .order("position", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((q) => ({
    ...q,
    options: Array.isArray(q.options) ? (q.options as string[]) : [],
  }));
}

export async function countQuestions(): Promise<number> {
  const { count, error } = await supabase
    .from("questions")
    .select("id", { count: "exact", head: true });
  if (error) throw error;
  return count ?? 0;
}

export async function submitResult(input: {
  seat_number: number;
  score: number;
  total: number;
}): Promise<void> {
  const { error } = await supabase.from("quiz_results").insert(input);
  if (error) throw error;
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}