// 上线前全量自动化回归测试
// 用法：
//   node scripts/prelaunch-test.mjs                          # 公开接口 + 管理接口(需口令)
//   $env:MYBLOG_ADMIN_PASSWORD='口令'; node scripts/prelaunch-test.mjs
//   $env:RISKY='1' ...                                       # 额外执行限流/爆破类测试（仅隔离实例！会锁 IP）
//   $env:BASE_URL='http://127.0.0.1:3001/api' ...            # 指定目标
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:3000/api';
const ADMIN = (process.env.MYBLOG_ADMIN_PASSWORD ?? '').trim();
const RISKY = process.env.RISKY === '1';
const SITE = BASE.replace(/\/api$/, '');

let pass = 0;
let fail = 0;
let skip = 0;
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

function skipCheck(name) {
  results.push(`⏭ ${name}（未提供管理口令，跳过）`);
  skip += 1;
}

async function getJson(path, headers = {}) {
  const res = await fetch(`${BASE}${path}`, { headers });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status} ${text.slice(0, 120)}`);
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function postJson(path, body, headers = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status} ${text.slice(0, 120)}`);
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function expectStatus(method, path, expect, headers = {}, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  if (res.status !== expect) {
    const t = await res.text().catch(() => '');
    throw new Error(`期望 ${expect} 实际 ${res.status} ${t.slice(0, 100)}`);
  }
}

// ============ 一、公开站点配置 ============
await check('站点配置 GET /api/site（含背景图字段）', async () => {
  const site = await getJson('/site');
  if (!site.name) throw new Error('缺少 name');
  if (!('backgroundImage' in site)) throw new Error('缺少 backgroundImage 字段');
});

await check('关于我 GET /api/site/about（含渲染 HTML）', async () => {
  const about = await getJson('/site/about');
  if (typeof about.contentHtml !== 'string') throw new Error('缺少 contentHtml');
});

await check('小人配置 GET /api/site/mascot', async () => {
  const m = await getJson('/site/mascot');
  if (typeof m.enabled !== 'boolean') throw new Error('缺少 enabled');
});

// ============ 二、文章与阅读 ============
await check('文章列表 GET /api/articles', async () => {
  const list = await getJson('/articles?pageSize=50');
  if (!Array.isArray(list.items)) throw new Error('items 不是数组');
});

await check('书籍搜索 q=欢迎', async () => {
  const list = await getJson('/articles?q=' + encodeURIComponent('欢迎'));
  if (list.total < 1) throw new Error('无搜索结果');
});

await check('标签筛选 tag=随笔', async () => {
  const list = await getJson('/articles?tag=' + encodeURIComponent('随笔'));
  if (!Array.isArray(list.items)) throw new Error('items 不是数组');
});

await check('未授权 status=all 被拒(401)', async () => {
  await expectStatus('GET', '/articles?status=all', 401);
});

await check('文章详情+章节渲染（高亮 language- 类）', async () => {
  const list = await getJson('/articles?pageSize=50');
  const target = list.items.find((i) => i.title.includes('欢迎')) ?? list.items[0];
  if (!target) throw new Error('无文章');
  const detail = await getJson('/articles/' + encodeURIComponent(target.slug));
  if (!Array.isArray(detail.chapters)) throw new Error('无章节列表');
  let hit = false;
  for (const c of detail.chapters) {
    const ch = await getJson(`/articles/${target.id}/chapters/${c.index}`);
    if (ch.html.includes('hljs') && ch.html.includes('language-')) hit = true;
  }
  if (!hit) throw new Error('章节无高亮类');
});

await check('阅读计数 view + 阅读时长 read-report', async () => {
  const list = await getJson('/articles?pageSize=1');
  const a = list.items[0];
  await expectStatus('POST', `/articles/${a.id}/view`, 201);
  await expectStatus('POST', `/articles/${a.id}/read-report`, 201, {}, { seconds: 5 });
});

await check('阅读时长超限参数被拒(400)', async () => {
  const list = await getJson('/articles?pageSize=1');
  const a = list.items[0];
  await expectStatus('POST', `/articles/${a.id}/read-report`, 400, {}, { seconds: 99999 });
});

// ============ 三、书注（公开书写） ============
let annoId = null;
await check('书注公开写入(201)', async () => {
  const list = await getJson('/articles?pageSize=1');
  const a = list.items[0];
  const anno = await postJson(`/articles/${a.id}/annotations`, {
    quoteText: '上线前测试引文',
    note: 'prelaunch-test 自动写入',
    author: 'QA',
    chapterIndex: 1,
  });
  if (!anno.id) throw new Error('未返回书注 id');
  annoId = anno.id;
});

await check('书注公开读取', async () => {
  const list = await getJson('/articles?pageSize=1');
  const a = list.items[0];
  const annos = await getJson(`/articles/${a.id}/annotations`);
  if (!annos.some((x) => x.id === annoId)) throw new Error('读不到刚写的书注');
});

await check('未授权删除书注被拒', async () => {
  await expectStatus('DELETE', `/annotations/${annoId}`, 401);
});

// ============ 四、静态资源 ============
await check('Live2D 本地模型可加载', async () => {
  const res = await fetch(`${SITE}/uploads/models/runtime/mao_pro.model3.json`, { method: 'HEAD' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
});

await check('上传原始文件静态直链被拒(404)', async () => {
  const res = await fetch(`${SITE}/uploads/files/anything.md`);
  if (res.status === 200) throw new Error('竟然 200');
});

await check('上传目录路径穿越被拒', async () => {
  const res = await fetch(`${SITE}/uploads/img/..%2f..%2fconfig%2fadmin.json`);
  if (res.status === 200) throw new Error('穿越成功');
});

// ============ 五、安全基线 ============
await check('安全响应头', async () => {
  const res = await fetch(`${BASE}/articles`);
  if (res.headers.get('x-content-type-options') !== 'nosniff') throw new Error('缺 nosniff');
  if (res.headers.get('x-frame-options') !== 'SAMEORIGIN') throw new Error('缺 SAMEORIGIN');
  if (res.headers.get('x-powered-by')) throw new Error('泄露 X-Powered-By');
});

await check('CORS 拒绝恶意源预检', async () => {
  const res = await fetch(`${BASE}/articles`, {
    method: 'OPTIONS',
    headers: {
      Origin: 'http://evil.example.com',
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'x-admin-token',
    },
  });
  if (res.headers.get('access-control-allow-origin')) throw new Error('恶意源被放行');
});

await check('会话/用量/上传记录未授权 401', async () => {
  await expectStatus('GET', '/chat/sessions', 401);
  await expectStatus('GET', '/llm/usage', 401);
  await expectStatus('GET', '/uploads', 401);
});

// ============ 六、管理接口（需口令） ============
if (ADMIN) {
  const H = { 'x-admin-token': ADMIN };

  await check('上传记录列表（口令）', async () => {
    const up = await getJson('/uploads', H);
    if (!Array.isArray(up.items)) throw new Error('items 不是数组');
  });

  await check('LLM 配置脱敏读取（口令）', async () => {
    const cfg = await getJson('/llm/config', H);
    if (!Array.isArray(cfg.providers)) throw new Error('providers 缺失');
    const raw = JSON.stringify(cfg);
    if (/sk-[a-zA-Z0-9]{8}/i.test(raw)) throw new Error('疑似泄露密钥');
  });

  await check('Skill 库含 book-finder（口令）', async () => {
    const skills = await getJson('/llm/skills', H);
    if (!skills.find((s) => s.name === 'book-finder')) throw new Error('缺 book-finder');
  });

  await check('站点背景保存与还原（口令）', async () => {
    const res = await fetch(`${BASE}/site`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...H },
      body: JSON.stringify({ backgroundImage: '/uploads/img/bg-test.png' }),
    });
    if (!res.ok) throw new Error(`保存失败 HTTP ${res.status}`);
    const site = await getJson('/site');
    if (site.backgroundImage !== '/uploads/img/bg-test.png') throw new Error('未生效');
    await fetch(`${BASE}/site`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...H },
      body: JSON.stringify({ backgroundImage: '' }),
    });
  });

  await check('LLM baseUrl 校验（内网 http 拒绝）', async () => {
    const res = await fetch(`${BASE}/llm/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...H },
      body: JSON.stringify({
        enabled: false,
        activeProvider: 'deepseek',
        dailyTokenLimit: 0,
        costLimitUsd: 0,
        providers: [{ name: 'deepseek', baseUrl: 'http://192.168.1.1:9999/v1', model: 'x' }],
      }),
    });
    if (res.status !== 400) throw new Error(`期望 400 实际 ${res.status}`);
  });

  // 私密/草稿可见性闭环
  let privId = null;
  let draftId = null;
  await check('创建私密与草稿文章（口令）', async () => {
    const priv = await postJson('/articles', { title: 'QA私密', contentMarkdown: '---\nprivate: true\n---\n# P\nQA-PRIVATE-TOP', }, H);
    privId = priv.id;
    const draft = await postJson('/articles', { title: 'QA草稿', contentMarkdown: '---\ndraft: true\n---\n# D\nQA-DRAFT-TOP', }, H);
    draftId = draft.id;
    if (!privId || !draftId) throw new Error('创建失败');
  });

  await check('私密/草稿对公开访问隐藏(404)', async () => {
    await expectStatus('GET', `/articles/${privId}/chapters/1`, 404);
    await expectStatus('GET', `/articles/${draftId}/chapters/1`, 404);
  });

  await check('私密/草稿搜索不泄漏', async () => {
    const r = await getJson('/articles?q=QA-PRIVATE-TOP');
    if (r.total !== 0) throw new Error('搜索泄漏私密内容');
  });

  await check('排行不含私密标题', async () => {
    const top = await getJson('/stats/top?limit=50');
    if (top.some((t) => t.title === 'QA私密')) throw new Error('排行泄漏');
  });

  await check('管理员可读私密/草稿(200)', async () => {
    await expectStatus('GET', `/articles/${privId}/chapters/1`, 200, H);
    await expectStatus('GET', `/articles/${draftId}/chapters/1`, 200, H);
  });

  await check('管理员删除测试书注', async () => {
    await expectStatus('DELETE', `/annotations/${annoId}`, 200, H);
  });

  await check('文章更新+撤销(Ctrl+Z)', async () => {
    const res = await fetch(`${BASE}/articles/${draftId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...H },
      body: JSON.stringify({ title: 'QA草稿-改' }),
    });
    if (!res.ok) throw new Error(`更新失败 HTTP ${res.status}`);
    await expectStatus('POST', `/articles/${draftId}/undo`, 201, H);
  });

  await check('标签颜色校验', async () => {
    const bad = await fetch(`${BASE}/tags`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...H },
      body: JSON.stringify({ name: 'QA-坏色', color: 'red;bad' }),
    });
    if (bad.status !== 400) throw new Error(`期望 400 实际 ${bad.status}`);
  });

  await check('清理测试文章', async () => {
    for (const id of [privId, draftId]) {
      if (id == null) continue;
      await fetch(`${BASE}/articles/${id}`, { method: 'DELETE', headers: H });
    }
  });

  await check('上传 md 自动出版+受控下载（口令）', async () => {
    const form = new FormData();
    form.append('files', new Blob(['---\n---\n# QA上传\nQA-UPLOAD-TOP'], { type: 'text/markdown' }), 'qa-upload.md');
    const res = await fetch(`${BASE}/upload`, { method: 'POST', headers: H, body: form });
    if (!res.ok) throw new Error(`上传失败 HTTP ${res.status}`);
    const data = await res.json();
    const r = data.results?.[0];
    if (!r?.ok || !r.article) throw new Error('未自动出版');
    const ups = await getJson('/uploads', H);
    const rec = ups.items.find((u) => u.article?.id === r.article.id);
    if (!rec) throw new Error('找不到上传记录');
    const name = rec.storedPath.split('/').pop();
    const dl = await fetch(`${BASE}/uploads/files/${encodeURIComponent(name)}`, { headers: H });
    if (!dl.ok) throw new Error(`受控下载失败 HTTP ${dl.status}`);
    const dl2 = await fetch(`${BASE}/uploads/files/${encodeURIComponent(name)}`);
    if (dl2.ok) throw new Error('未授权下载竟然成功');
    await fetch(`${BASE}/articles/${r.article.id}`, { method: 'DELETE', headers: H }); // 级联清理文件
  });

  if (RISKY) {
    await check('口令爆破第 6 次被锁(429)', async () => {
      for (let i = 0; i < 5; i++) await expectStatus('POST', '/articles', 401, { 'x-admin-token': 'bad' + i }, { title: 'x', contentMarkdown: 'y' });
      await expectStatus('POST', '/articles', 429, { 'x-admin-token': 'bad9' }, { title: 'x', contentMarkdown: 'y' });
      // 正确口令立即解限
      await expectStatus('POST', '/articles', 201, H, { title: 'QA解锁', contentMarkdown: 'z' });
      const list = await getJson('/articles?status=all', H);
      const t = list.items.find((i) => i.title === 'QA解锁');
      if (t) await fetch(`${BASE}/articles/${t.id}`, { method: 'DELETE', headers: H });
    });

    await check('聊天限流第 21 次拒绝(400)', async () => {
      for (let i = 0; i < 20; i++) {
        await fetch(`${BASE}/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] }),
        });
      }
      await expectStatus('POST', '/chat', 400, {}, { messages: [{ role: 'user', content: 'hi' }] });
    });
  }
} else {
  skipCheck('管理接口全套（上传记录/LLM/Skill/背景/私密草稿闭环/书注删除/标签/撤销/上传出版）');
  skipCheck('限流爆破测试（需隔离实例：设置 RISKY=1）');
}

console.log('\n' + results.join('\n'));
console.log(`\n通过 ${pass} · 失败 ${fail} · 跳过 ${skip}`);
process.exit(fail === 0 ? 0 : 1);
