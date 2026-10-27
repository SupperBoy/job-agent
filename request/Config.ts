import Path from "node:path";

export const UrlDomain: string = process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com";
export const API_Path: string = '/chat/completions';
export const API_KEY: string = process.env.DEEPSEEK_API_KEY || '';
export const MODEL: string = process.env.DEEPSEEK_MODEL || "deepseek-flash";
export const traceFile: string = process.env.TRACE_FILE ?? Path.resolve('day1/traceFile.json');
export const Finish_reasonMap = {
    STOP: 'stop',
    TOOLCALLS: 'tool_calls',
    LENGTH: 'length',
    CONTENTFILTER: 'content_filter',
} as const;