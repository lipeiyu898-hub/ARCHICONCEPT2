import { config } from "./config.js";

function extractJson(text) {
  if (!text) throw new Error("EMPTY_LLM_RESPONSE");
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fenced ? fenced[1] : text;
  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(raw.slice(start, end + 1));
    throw new Error("LLM_JSON_PARSE_FAILED");
  }
}

export async function callDeepSeekJson({ system, user, temperature = 0.25 }) {
  if (!config.deepseekApiKey) {
    const err = new Error("MISSING_DEEPSEEK_API_KEY");
    err.status = 500;
    throw err;
  }

  const response = await fetch(`${config.deepseekBaseUrl.replace(/\/$/, "")}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.deepseekApiKey}`
    },
    body: JSON.stringify({
      model: config.deepseekModel,
      temperature,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `${system}\n\n只返回一个合法 JSON 对象，不要 Markdown，不要解释。`
        },
        { role: "user", content: user }
      ]
    })
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(body?.error?.message || `DEEPSEEK_REQUEST_FAILED_${response.status}`);
    err.status = response.status === 401 ? 401 : 502;
    err.code = response.status === 401 ? "DEEPSEEK_AUTH_FAILED" : "DEEPSEEK_REQUEST_FAILED";
    throw err;
  }

  return extractJson(body?.choices?.[0]?.message?.content || "");
}

export async function callDeepSeekText({
  system,
  messages = [],
  temperature = 0.35
}) {
  if (!config.deepseekApiKey) {
    const err = new Error("MISSING_DEEPSEEK_API_KEY");
    err.status = 500;
    throw err;
  }

  const safeMessages = Array.isArray(messages)
    ? messages
        .filter(
          (item) =>
            item &&
            ["user", "assistant"].includes(item.role) &&
            typeof item.content === "string" &&
            item.content.trim()
        )
        .slice(-10)
        .map((item) => ({
          role: item.role,
          content: item.content.slice(0, 3000)
        }))
    : [];

  const response = await fetch(`${config.deepseekBaseUrl.replace(/\/$/, "")}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.deepseekApiKey}`
    },
    body: JSON.stringify({
      model: config.deepseekModel,
      temperature,
      messages: [
        {
          role: "system",
          content: system
        },
        ...safeMessages
      ]
    })
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(body?.error?.message || `DEEPSEEK_REQUEST_FAILED_${response.status}`);
    err.status = response.status === 401 ? 401 : 502;
    err.code = response.status === 401 ? "DEEPSEEK_AUTH_FAILED" : "DEEPSEEK_REQUEST_FAILED";
    throw err;
  }

  return String(body?.choices?.[0]?.message?.content || "").trim();
}
