export type Message = Record<string, any>;

export interface Tool {
    type: string;
    function: Record<string, any>;
}

export interface ModelReply {
  msg: Record<string, any>;
  usage: Record<string, number>;
  finish_reason: string;
};

export interface InitFetchConfigRes {
    url: string;
    method: string;
    headers: {
        'Content-Type': string;
        Authorization: string;
        [key: string]: string;
    };
    body: string;
};

export interface ChatUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  prompt_cache_hit_tokens?: number;
  prompt_cache_miss_tokens?: number;
}

export interface ToolCall {
    id: string;
    type: 'function',
    function: {
        name: string;
        arguments: string;
    }
}

export interface ChatMessage {
    role: "system" | "user" | "assistant" | "tool";
    content: string | null;
    tool_calls?: ToolCall[];
    tool_call_id?: string;
}

export interface ChatResponse {
  id: string;
  choices: { index: number; message: ChatMessage; finish_reason: string }[];
  usage?: ChatUsage;          // ← 可选，逼你处理缺失
}