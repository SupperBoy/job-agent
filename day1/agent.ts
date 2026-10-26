// day1/agent.ts
// Day 1 完整版：一个能跑的 agent loop。零依赖。
//
// 跑法（Node 22.18+ 可以直接跑 .ts，不需要 tsx / ts-node）：
//   npm run day1
//   或：node --env-file=.env day1/agent.ts
//   或指定任务：node --env-file=.env day1/agent.ts "读 D:/xxx/resume.md 告诉我它最大的问题"
//
// 只有五块：tools → runTool → callModel → trace → 主循环

import { readFile, appendFile } from "node:fs/promises";
import path from "node:path";

// ============ 0. 环境检查 ============
const BASE: string = process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com";
const KEY: string | undefined = process.env.DEEPSEEK_API_KEY;
const MODEL: string = process.env.DEEPSEEK_MODEL ?? "deepseek-flash";

if (!KEY) {
  console.error(
    "❌ 没读到 DEEPSEEK_API_KEY。\n" +
      "   正确跑法：npm run day1\n" +
      "   或者：   node --env-file=.env day1/agent.ts\n" +
      "   （直接 node day1/agent.ts 不会加载 .env）"
  );
  process.exit(1);
}

const MAX_ROUNDS = 8;
const MAX_FILE_CHARS = 20000;
const TRACE_FILE = path.resolve("day1/trace.jsonl");

// ============ 1. 工具定义 ============
// description 不是注释，它是 prompt 的一部分。
type ToolDef = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

const tools: ToolDef[] = [
  {
    type: "function",
    function: {
      name: "read_file",
      description:
        "读取本地文本文件的完整内容，用于查看简历、JD 等文件。只接受绝对路径，不接受相对路径。" +
        "只能读文本文件，不要用它读图片或二进制文件。",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description:
              "文件的绝对路径，例如 D:/AI/demo/job-agent/resume.example.md（Windows 路径请用正斜杠）",
          },
        },
        required: ["path"],
      },
    },
  },
];

// ============ 2. 工具执行 ============
// 铁律：永远 return 字符串，永远不 throw。错误信息是给模型看的提示。
async function runTool(name: string, rawArgs: string): Promise<string> {
  if (name !== "read_file") {
    return `Error: 没有名为 "${name}" 的工具。当前唯一可用工具是 read_file。`;
  }

  let args: { path?: string };
  try {
    args = JSON.parse(rawArgs || "{}");
  } catch {
    return `Error: 参数不是合法 JSON。收到的是：${rawArgs}。请重新调用，只传 {"path": "<绝对路径>"}。`;
  }

  const p = args?.path;
  if (typeof p !== "string" || p.trim() === "") {
    return `Error: 缺少 path 参数。必须传 {"path": "<文件的绝对路径>"}。`;
  }

  try {
    const text = await readFile(p, "utf8");
    if (text.length > MAX_FILE_CHARS) {
      return (
        text.slice(0, MAX_FILE_CHARS) +
        `\n\n...[内容已截断：原文 ${text.length} 字符，只返回前 ${MAX_FILE_CHARS} 字符]`
      );
    }
    return text;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code ?? "UNKNOWN";
    if (code === "ENOENT") return `Error: 文件不存在：${p}。请检查路径拼写，必须是绝对路径。`;
    if (code === "EACCES") return `Error: 没有权限读取：${p}`;
    if (code === "EISDIR") return `Error: ${p} 是一个目录，不是文件。`;
    return `Error: 读取失败（${code}）：${(err as Error)?.message ?? String(err)}`;
  }
}

// ============ 3. 一次模型调用 ============
type ChatMessage = Record<string, unknown>;

type ModelReply = {
  msg: Record<string, any>;
  usage: Record<string, number>;
  finish: string;
};

async function callModel(messages: ChatMessage[], round: number): Promise<ModelReply> {
  const body = {
    model: MODEL,
    messages,
    tools,
    thinking: { type: "disabled" }, // 第一天先关掉思考模式
  };

  const t0 = Date.now();
  const res = await fetch(`${BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${KEY}`,
    },
    body: JSON.stringify(body),
  });

  const raw = await res.text();
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}\n${raw}`);
  }

  const data = JSON.parse(raw);
  const msg = data.choices[0].message;
  const usage = data.usage ?? {};

  await trace({
    round,
    ms: Date.now() - t0,
    request: body,
    finish_reason: data.choices[0].finish_reason,
    usage,
    tool_calls: msg.tool_calls ?? null,
  });

  return { msg, usage, finish: data.choices[0].finish_reason };
}

// ============ 4. trace ============
async function trace(record: Record<string, unknown>): Promise<void> {
  const line = JSON.stringify({ ts: new Date().toISOString(), ...record });
  await appendFile(TRACE_FILE, line + "\n", "utf8");
}

// ============ 5. 主循环 ============
const cliTask = process.argv.slice(2).join(" ").trim();
const resumePath = path.resolve("resume.example.md");
const task =
  cliTask || `读取 ${resumePath}，告诉我这份简历最大的三个问题。每条结论都必须引用简历原文。`;

console.error(`模型: ${MODEL}`);
console.error(`任务: ${task}`);
console.error(`trace: ${TRACE_FILE}\n`);

const messages: ChatMessage[] = [
  {
    role: "system",
    content:
      "你是一个严谨的求职助手。需要查看文件内容时必须调用工具，禁止凭空猜测文件里写了什么。" +
      "给结论时必须引用原文片段作为证据。如果拿不到文件内容，就直说拿不到，不要编造。",
  },
  { role: "user", content: task },
];

let tokensIn = 0;
let tokensOut = 0;
let finished = false;

for (let round = 1; round <= MAX_ROUNDS; round++) {
  const { msg, usage, finish } = await callModel(messages, round);
  tokensIn += usage.prompt_tokens ?? 0;
  tokensOut += usage.completion_tokens ?? 0;

  // 整条 assistant 消息原样放回历史（含 tool_calls），这是协议要求
  messages.push(msg);

  // 注意：没有工具调用时 tool_calls 是 null，必须用可选链
  const calls: any[] = msg.tool_calls ?? [];

  if (calls.length === 0) {
    console.log("\n===== 最终回答 =====\n");
    console.log(msg.content ?? "(空)");
    console.log(
      `\n----- round=${round} finish=${finish} tokens: in=${tokensIn} out=${tokensOut} -----`
    );
    finished = true;
    break;
  }

  for (const call of calls) {
    const result = await runTool(call.function.name, call.function.arguments);
    const preview = result.length > 60 ? result.slice(0, 60) + "…" : result;
    console.error(`[round ${round}] → ${call.function.name}(${call.function.arguments})`);
    console.error(`[round ${round}] ← ${JSON.stringify(preview)}`);

    // 工具结果用 role:"tool" 回填，tool_call_id 必须与调用一一对应
    messages.push({ role: "tool", tool_call_id: call.id, content: result });
  }
}

if (!finished) {
  console.error(
    `\n⚠️ 达到 ${MAX_ROUNDS} 轮上限仍未给出最终回答。` +
      `\n   常见原因：工具一直报错、路径不对、或模型在反复读同一个文件。` +
      `\n   去看 ${TRACE_FILE}，每一轮的完整请求和响应都在里面。`
  );
  process.exitCode = 2;
}
