// Day 1 接线自检：只验证「一条请求能不能通」，不含任何 agent 逻辑。
// 跑法：node --env-file=.env day1/ping.mjs
const KEY = process.env.DEEPSEEK_API_KEY;
const BASE = process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com";

if (!KEY) {
  console.error("❌ 没读到 DEEPSEEK_API_KEY。用 `node --env-file=.env day1/ping.mjs` 跑，别直接 node。");
  process.exit(1);
}

const t0 = Date.now();
const res = await fetch(`${BASE}/chat/completions`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${KEY}`,
  },
  body: JSON.stringify({
    model: "deepseek-flash",
    messages: [
      { role: "system", content: "只回答一个数字，不要解释。" },
      { role: "user", content: "1+1 等于几？" },
    ],
    thinking: { type: "disabled" }, // 第一天先关掉思考，减少变量
    max_tokens: 100,
    stream: false,
  }),
});

const raw = await res.text();
if (!res.ok) {
  console.error(`❌ HTTP ${res.status}\n${raw}`);
  process.exit(1);
}

const data = JSON.parse(raw);
console.log("✅ 通了");
console.log("回答:", data.choices[0].message.content);
console.log("finish_reason:", data.choices[0].finish_reason);
console.log("usage:", data.usage);
console.log("耗时:", Date.now() - t0, "ms");
