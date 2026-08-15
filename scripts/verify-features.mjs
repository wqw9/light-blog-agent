// 功能验收脚本：node scripts/verify-features.mjs
// 前置：已执行 db:push 且后端(:3000)运行新代码。
// 可选环境变量 MYBLOG_ADMIN_PASSWORD：用于删除书注的鉴权测试（不设置则跳过删除项）。
// 说明：书注测试会在公开文章上写一条再删除，自动清理；LLM 相关项在未配置 API Key 时自动跳过。

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:3000';
const ADMIN = (process.env.MYBLOG_ADMIN_PASSWORD ?? '').trim();

let pass = 0;
let fail = 0;
const results = [];

async function check(name, fn) {
  try {
    await fn();
    results.push(`✅ ${name}`);
    pass += 1;
  } catch (err) {
    results.push(`❌ ${name}: ${err instanceof Error ? err.message : String(err)}`);
    fail += 1;
  }
}

async function getJson(path, headers = {}) {
  const res = await fetch(`${BASE}${path}`, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// 1. Live2D 模型可访问
await check('Live2D 本地模型可加载', async () => {
  const res = await fetch(`${BASE}/uploads/models/runtime/mao_pro.model3.json`, { method: 'HEAD' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
});

// 2. 书籍搜索（书架 q 参数）
await check('书籍搜索（q 参数）', async () => {
  const data = await getJson('/api/articles?q=欢迎');
  if (!Array.isArray(data.items) || data.total < 1) throw new Error('未命中搜索结果');
});

// 3. 语法高亮（含 language-* 类）
await check('语法高亮输出', async () => {
  const ch = await getJson('/api/articles/141/chapters/1');
  if (typeof ch.html !== 'string' || !ch.html.includes('hljs') || !ch.html.includes('language-')) {
    throw new Error('章节 HTML 未包含高亮类');
  }
});

// 4. 书籍搜索 Skill（内置且可在聊天接口引用）
await check('书籍搜索 Skill 已注册', async () => {
  const skills = await getJson('/api/llm/skills', ADMIN ? { 'x-admin-token': ADMIN } : {});
  const hit = skills.find((s) => s.name === 'book-finder');
  if (!hit) throw new Error('未找到 book-finder');
});

// 5. 句子书注：公开书写 + 读取 + 管理员删除
await check('句子书注（写/读/删）', async () => {
  const list = await getJson('/api/articles?pageSize=1');
  const target = list.items[0];
  if (!target) throw new Error('没有可用文章');
  const created = await fetch(`${BASE}/api/articles/${target.id}/annotations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ quoteText: '验收书注引文', note: 'verify-features 自动验收', author: 'verify', chapterIndex: 1 }),
  });
  if (created.status !== 201) throw new Error(`创建书注 HTTP ${created.status}`);
  const anno = await created.json();
  const got = await getJson(`/api/articles/${target.id}/annotations`);
  if (!got.some((a) => a.id === anno.id)) throw new Error('读取不到刚创建的书注');
  if (ADMIN) {
    const del = await fetch(`${BASE}/api/annotations/${anno.id}`, {
      method: 'DELETE',
      headers: { 'x-admin-token': ADMIN },
    });
    if (!del.ok) throw new Error(`删除书注 HTTP ${del.status}`);
    const after = await getJson(`/api/articles/${target.id}/annotations`);
    if (after.some((a) => a.id === anno.id)) throw new Error('书注未被删除');
  }
});

// 6. 未授权删除书注应被拒绝（安全项）
await check('书注删除需口令', async () => {
  const del = await fetch(`${BASE}/api/annotations/1`, { method: 'DELETE' });
  if (del.status === 200 || del.status === 201) throw new Error('未授权删除竟然成功');
});

console.log(results.join('\n'));
console.log(`\n通过 ${pass} / ${pass + fail}`);
process.exit(fail === 0 ? 0 : 1);
