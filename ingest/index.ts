// ingest/index.ts
// 确定性摄取层：把 .docx 这类二进制文档转成 agent 能读的 markdown。
//
// 这里刻意【不】把它注册成工具给模型调用 —— 转换是纯机械工作，不需要模型做任何判断。
// 谁该读哪个文件，是 agent 的事；文件怎么变成文本，是管道的事。

import fsPromises from "node:fs/promises";
import path from "node:path";
import mammoth from "mammoth";
import TurndownService from "turndown";
import gfmPlugin from "turndown-plugin-gfm";

// turndown-plugin-gfm 是 CJS，具名解构在 ESM 下不稳，走默认导入再取
const { gfm } = gfmPlugin as any;

export type IngestResult = {
  source: string;
  dest: string;
  chars: number;
  warnings: string[];
};

async function docxToMarkdown(file: string): Promise<{ md: string; warnings: string[] }> {
  const { value: html, messages } = await mammoth.convertToHtml({ path: file });

  const td = new TurndownService({
    headingStyle: "atx",
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
  });
  td.use(gfm); // 表格必须靠这个插件，简历里的表格否则会被压成一行

  const md = td
    .turndown(html)
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const warnings = (messages ?? []).map((m: any) => m.message ?? String(m));
  return { md, warnings };
}

export async function ingest(file: string, outDir = "data"): Promise<IngestResult> {
  const source = path.resolve(file);
  const base = path.basename(source, path.extname(source));
  const dest = path.resolve(outDir, `${base}.md`);

  const stat = await fsPromises.stat(source).catch(() => null);
  if (!stat) {
    throw new Error(`找不到文件：${source}`);
  }

  const ext = path.extname(source).toLowerCase();
  let md = "";
  let warnings: string[] = [];

  if (ext === ".docx") {
    ({ md, warnings } = await docxToMarkdown(source));
  } else if (ext === ".md" || ext === ".txt") {
    md = await fsPromises.readFile(source, "utf8");
  } else {
    throw new Error(`不支持的格式：${ext}。目前支持 .docx / .md / .txt`);
  }

  // 转换失败最常见的样子不是报错，是「出来一坨空字符串」，所以必须显式检查
  if (md.trim().length === 0) {
    throw new Error(`转换结果为空：${source}（可能不是真正的 docx，或内容全在图片里）`);
  }
  if (md.length < 200) {
    warnings.push(`结果只有 ${md.length} 字符，可能转换不完整或原文过短`);
  }

  await fsPromises.mkdir(path.dirname(dest), { recursive: true });
  const banner = `<!-- 自动生成，勿手改。来源：${path.basename(source)} -->\n\n`;
  await fsPromises.writeFile(dest, banner + md + "\n", "utf8");

  return { source, dest, chars: md.length, warnings };
}
