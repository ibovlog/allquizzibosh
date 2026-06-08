// Server-only helper to call Lovable AI Gateway (chat completions).
const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content:
    | string
    | Array<
        | { type: "text"; text: string }
        | { type: "image_url"; image_url: { url: string } }
      >;
};

export async function callGateway(opts: {
  model: string;
  messages: ChatMessage[];
  jsonMode?: boolean;
}): Promise<string> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("Missing LOVABLE_API_KEY");

  const res = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: opts.model,
      messages: opts.messages,
      ...(opts.jsonMode ? { response_format: { type: "json_object" } } : {}),
    }),
  });

  if (res.status === 429) {
    throw new Error("RATE_LIMIT");
  }
  if (res.status === 402) {
    throw new Error("CREDITS_EXHAUSTED");
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`AI gateway error ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return data.choices?.[0]?.message?.content ?? "";
}