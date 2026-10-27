import fsPromises from "node:fs/promises";
import Path from "node:path";

import { callModel } from '../request/index.ts';
import type { Message, Tool } from '../request/Type.ts';
import { API_KEY, Finish_reasonMap, traceFile } from '../request/Config.ts'

const MAX_ROUND = Number(process.env.MAX_ROUND ?? 10) || 10;
const MAX_FILE_CHARS = 20000;
// const resumePath = Path.resolve("resume.example.md");
const resumePath = Path.resolve("data/resume.md");


if (!API_KEY) {
    console.error(`
        ❌ 没读到 DEEPSEEK_API_KEY。\n
        正确跑法：npm run day1\n
        或者：   node --env-file=.env day1/agent.ts\n
        （直接 node day1/agent.ts 不会加载 .env）
    `);
    process.exit(1);
}



const Messages: Message[] = [
    {
        role: 'system',
        content: '你是一个严谨的求职助手。需要查看文件内容时必须调用工具，禁止凭空猜测文件里写了什么。给结论时必须引用原文片段作为证据。如果拿不到文件内容，就直说拿不到，不要编造。',
    },
    {
        role: 'user',
        content: `读取 ${resumePath}，告诉我这份简历最大的三个问题。每条结论都必须引用简历原文。`,
    }
];

const Tools: Tool[] = [
    {
        type: 'function',
        function: {
            name: 'read_file',
            description: '读取本地文本文件的完整内容，用于查看简历、JD 等文件。只接受绝对路径，不接受相对路径。只能读文本文件，不要用它读图片或二进制文件。',
            // description: '读文件',
            parameters: {
                type: 'object',
                properties: {
                    path: {
                        type: "string",
                        description:
                        "文件的绝对路径，例如 D:/AI/demo/job-agent/data/resume.md（Windows 路径请用正斜杠）",
                    },
                },
                required: ["path"],
            },
        }
    },
];

const runTool: (name: string, args: string) => Promise<string> = async (toolName, toolArgs) => {
    if (toolName !== "read_file") {
        return `Error: 没有名为 "${toolName}" 的工具。当前唯一可用工具是 read_file。`;
    }

    let args: { path?: string };
    try {
        args = JSON.parse(toolArgs || "{}");
    } catch {
        return `Error: 参数不是合法 JSON。收到的是：${toolArgs}。请重新调用，只传 {"path": "<绝对路径>"}。`;
    }

    const p = args?.path;
    if (typeof p !== "string" || p.trim() === "") {
        return `Error: 缺少 path 参数。必须传 {"path": "<文件的绝对路径>"}。`;
    }

    try {
        const text = await fsPromises.readFile(p, "utf8");
        const bad = text.match(/\uFFFD/g)?.length ?? 0;
        if (text.includes("\u0000") || bad > text.length * 0.01) {
        return `Error: ${p} 看起来是二进制文件（docx/pdf/图片），read_file 只能读纯文本。` +
                `不要猜测它的内容，直接说明你读不了。`;
        }
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

let tokensIn = 0;
let tokensOut = 0;
let finished = false;

for(let round = 0; round < MAX_ROUND; round++) {
    const { msg, usage, finish_reason } = await callModel({
        messages: Messages,
        tools: Tools,
        round,
    })

    if (!msg) {
        throw new Error('本次返回内容为空');
    }

    // 统计本次消耗
    tokensIn += usage.prompt_tokens ?? 0;
    tokensOut += usage.completion_tokens ?? 0;
    
    // 继续的话需要将上下文全部传入，这是协议要求
    Messages.push(msg);

    // 注意：没有工具调用时 tool_calls 是 null，必须用可选链
    const calls: any[] = msg.tool_calls ?? [];

    if (!calls.length) {
        if (finish_reason === Finish_reasonMap.LENGTH) {
            console.error("⚠️ 输出被 max_tokens 截断");
        }
        if (finish_reason === Finish_reasonMap.CONTENTFILTER) {
            console.error("⚠️ 被内容过滤中断");
        }
        console.log("\n===== 最终回答 =====\n");
        console.log(msg.content ?? "(空)");
        console.log(
        `\n----- round=${round} finish=${finish_reason} tokens: in=${tokensIn} out=${tokensOut} -----`
        );
        finished = true;
        break;
    }

    for(const call of calls) {
        const toolRes = await runTool(call.function.name, call.function.arguments)
        const preview = toolRes.length > 60 ? toolRes.slice(0, 60) + "…" : toolRes;
        console.log(`[round ${round}] → ${call.function.name}(${call.function.arguments})`);
        console.log(`[round ${round}] ← ${JSON.stringify(preview)}`);

        // 工具结果用 role:"tool" 回填，tool_call_id 必须与调用一一对应
        Messages.push({ role: "tool", tool_call_id: call.id, content: toolRes });
    }
}

if (!finished) {
  console.error(
    `\n⚠️ 达到 ${MAX_ROUND} 轮上限仍未给出最终回答。` +
      `\n   常见原因：工具一直报错、路径不对、或模型在反复读同一个文件。` +
      `\n   去看 ${traceFile}，每一轮的完整请求和响应都在里面。`
  );
  process.exitCode = 2;
}
