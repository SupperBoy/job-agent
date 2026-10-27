import fsPromises from "node:fs/promises";
import type { Message, Tool, ModelReply, InitFetchConfigRes } from './Type.ts';
import { UrlDomain, API_Path, API_KEY, MODEL, traceFile, ChatResponse } from './Config.ts'




export const InitFetchConfig: (arg: {
    method?: string;
    headers?: Record<string, string>;
    body: Record<string, any>;
}) => InitFetchConfigRes = ({ method, headers, body }) => {
    return {
        url: `${UrlDomain}${API_Path}`,
        method: method ?? 'POST',
        headers: {
            "Content-Type": 'application/json',
            Authorization: `Bearer ${API_KEY}`,
            ...headers,
        },
        body: JSON.stringify({
            model: MODEL,
            thinking: { type: "disabled" }, // 第一天先关掉思考模式
            ...body,
        }),
    }
}

export const callModel: (P: {
    messages: Message[];
    tools?: Tool[];
    round: number;
}) => Promise<ModelReply> = async ({ messages, tools = [], round}) => {
    const { url, ...config } = InitFetchConfig({
        body: {
            messages,
            tools,
        }
    });

    const st: number = Date.now();

    const res = await fetch(url, config);

    
    const raw = await res.text();
    const et: number = Date.now();

    const data: ChatResponse = JSON.parse(raw);
    const msg = data?.choices[0]?.message;
    const usage = data.usage;
    const finish_reason = data?.choices?.[0].finish_reason;
    const ms: number = et - st;
    
    console.log(`[callModel End] MS  is: ${ms} , finish_reason is: ${finish_reason}`);

    await trace({
        round,
        ts: new Date().toISOString(),
        ms,
        url,
        msg,
        requestBody: JSON.parse(config.body),
        finish_reason,
        usage,
    })

    if (!res.ok) {
        throw new Error(`HTTP ${res.status}\n${raw}`);
    }

    return {
        msg,
        usage,
        finish_reason
    }
}

export const trace: (record: Record<string, any>) => Promise<void> = async (record) => {
    const text = JSON.stringify({
        ts: new Date().toISOString(),
        ...record,
    })

    await fsPromises.appendFile(traceFile, text + '\n', 'utf8');
}