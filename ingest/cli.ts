// ingest/cli.ts
// 用法：npm run ingest
//      npm run ingest -- xxx.docx
import { ingest } from "./index.ts";

const target = process.argv[2] ?? "resume.docx";

try {
  const r = await ingest(target);
  console.log(`✅ ${r.source}`);
  console.log(`   → ${r.dest}`);
  console.log(`   ${r.chars} 字符`);
  if (r.warnings.length) {
    console.log(`\n⚠️ ${r.warnings.length} 条转换警告：`);
    for (const w of r.warnings) console.log("   -", w);
  }
} catch (e) {
  console.error(`❌ ${(e as Error).message}`);
  process.exitCode = 1;
}
