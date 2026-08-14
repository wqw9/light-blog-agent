// 管理功能全链路测试：编码识别 / 管理口令 / 文章更新 / 上传记录 / 级联删除
// 用法: node scripts/verify-admin.mjs <admin-token>   （需服务运行于 127.0.0.1:3000）
import { readFileSync, writeFileSync } from 'node:fs';

const TOKEN = process.argv[2] ?? '';
const BASE = 'http://127.0.0.1:3000';
let failures = 0;

function check(name, cond, extra = '') {
  if (cond) {
    console.log(`  [OK] ${name}`);
  } else {
    failures++;
    console.error(`  [FAIL] ${name} ${extra}`);
  }
}

async function api(path, init = {}) {
  const headers = { ...(init.headers ?? {}) };
  if (TOKEN) headers['x-admin-token'] = TOKEN;
  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  const text = await res.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    /* ignore */
  }
  return { status: res.status, body };
}

async function upload(name, content, type) {
  const form = new FormData();
  form.append('files', new File([content], name, { type }));
  const headers = {};
  if (TOKEN) headers['x-admin-token'] = TOKEN;
  const res = await fetch(`${BASE}/api/upload`, { method: 'POST', body: form, headers });
  return (await res.json()).results[0];
}

// GBK 字节：中文测试 = D6D0 CEC4 B2E2 CAD4；正文 = D5FD CEC4
const gbk = (arr) => Buffer.from(arr);
const gbkContent = Buffer.concat([
  Buffer.from('---\ntitle: ', 'ascii'),
  gbk([0xd6, 0xd0, 0xce, 0xc4, 0xb2, 0xe2, 0xca, 0xd4]), // 中文测试
  Buffer.from('\n---\n\n', 'ascii'),
  gbk([0xd5, 0xfd, 0xce, 0xc4, 0xd6, 0xd0, 0xce, 0xc4, 0xb2, 0xe2, 0xca, 0xd4]), // 正文中文测试
  Buffer.from('\n', 'ascii'),
]);

const utf8Md = '---\ntitle: 编码测试\nsummary: UTF-8 上传\n---\n\n第一段正文。\n';

console.log('[1] 管理口令守卫');
{
  const res = await fetch(`${BASE}/api/uploads/999999`, { method: 'DELETE' }); // 无 token
  check('无口令 DELETE 返回 401', res.status === 401, `got ${res.status}`);
}

console.log('[2] UTF-8 文件名与内容');
const r1 = await upload('编码测试.md', utf8Md, 'text/markdown');
check('UTF-8 上传 ok', Boolean(r1?.ok), JSON.stringify(r1));
check('中文文件名无乱码', r1?.filename === '编码测试.md', `got ${r1?.filename}`);
check('frontmatter 标题正确', r1?.article?.title === '编码测试', `got ${r1?.article?.title}`);
const art1Id = r1?.article?.id;

console.log('[3] GBK 编码自动识别');
const r2 = await upload('GBK测试.txt', gbkContent, 'text/plain');
check('GBK 上传 ok', Boolean(r2?.ok), JSON.stringify(r2));
check('GBK 文件名无乱码', r2?.filename === 'GBK测试.txt', `got ${r2?.filename}`);
check('GBK 标题解码正确', r2?.article?.title === '中文测试', `got ${r2?.article?.title}`);
const art2Id = r2?.article?.id;
{
  const ch = await api(`/api/articles/${art2Id}/chapters/1`);
  check('GBK 正文解码正确', (ch.body?.html ?? '').includes('正文中文测试'), `html=${(ch.body?.html ?? '').slice(0, 80)}`);
}

console.log('[4] 文章更新 + 自动重新分章 + 草稿过滤');
{
  const payload = {
    title: 'verify-put-title',
    tags: ['测试', '管理'],
    status: 'DRAFT',
    contentMarkdown: '---\ntitle: verify-put-title\n---\n\nchapter one body.\n\n---\n\nchapter two body.\n',
  };
  const res = await api(`/api/articles/${art1Id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  check('PUT 返回成功', res.status === 200, `got ${res.status} ${JSON.stringify(res.body)}`);
  check('标题已更新', res.body?.title === 'verify-put-title', `got ${res.body?.title}`);
  check('自动重新分章为 2 章', res.body?.chapters?.length === 2, `chapters=${res.body?.chapters?.length}`);
  check('标签已替换', Array.isArray(res.body?.tags) && res.body.tags.includes('测试'), `tags=${res.body?.tags}`);
  check('状态切换为草稿', res.body?.status === 'DRAFT', `status=${res.body?.status}`);

  const pub = await api('/api/articles');
  check('草稿不出现在公开列表', !(pub.body?.items ?? []).some((a) => a.id === art1Id));
  await api(`/api/articles/${art1Id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'PUBLISHED' }),
  });
}

console.log('[4.5] 撤销 (undo) - 更新回滚（多步）');
{
  const un1 = await api(`/api/articles/${art1Id}/undo`, { method: 'POST' });
  check('第一次撤销成功', un1.status === 200 || un1.status === 201, JSON.stringify(un1.body));
  check(
    '第一次撤销回到上次操作前（verify-put-title/DRAFT/2章）',
    un1.body?.title === 'verify-put-title' && un1.body?.status === 'DRAFT' && un1.body?.chapters?.length === 2,
    JSON.stringify(un1.body),
  );
  const un2 = await api(`/api/articles/${art1Id}/undo`, { method: 'POST' });
  check(
    '第二次撤销回到最初版本（编码测试/PUBLISHED/1章）',
    un2.body?.title === '编码测试' && un2.body?.status === 'PUBLISHED' && un2.body?.chapters?.length === 1,
    JSON.stringify(un2.body),
  );
  const un3 = await api(`/api/articles/${art1Id}/undo`, { method: 'POST' });
  check('无更多版本时返回 404', un3.status === 404, `got ${un3.status}`);
}

console.log('[5] 上传记录列表 / 重新解析 / 级联删除');
{
  const list = await api('/api/uploads?pageSize=50');
  check('上传记录可列出', list.status === 200 && list.body?.total >= 2, `total=${list.body?.total}`);
  const rec = list.body?.items?.find((u) => u.article?.id === art2Id);
  check('记录关联文章', Boolean(rec), 'record not found');
  if (rec) {
    const re = await api(`/api/uploads/${rec.id}/reparse`, { method: 'POST' });
    check('重新解析成功', re.body?.ok === true && re.body?.article, JSON.stringify(re.body));
    const newArtId = re.body?.article?.id;
    check('旧文章已被新文章替换', newArtId !== art2Id, `new=${newArtId} old=${art2Id}`);

    const list2 = await api('/api/uploads?pageSize=50');
    const rec2 = list2.body?.items?.find((u) => u.id === rec.id);
    check('记录指向新文章', rec2?.article?.id === newArtId, `got ${rec2?.article?.id}`);

    const del = await api(`/api/articles/${newArtId}`, { method: 'DELETE' });
    check('删除文章成功', del.status === 200, JSON.stringify(del.body));
    const list3 = await api('/api/uploads?pageSize=50');
    check('来源文件记录已级联删除', !(list3.body?.items ?? []).some((u) => u.id === rec.id));
  }
}

console.log('[5.5] 撤销 (undo) - 删除重建');
{
  const del = await api(`/api/articles/${art1Id}`, { method: 'DELETE' });
  check('删除成功', del.status === 200, JSON.stringify(del.body));
  const un = await api(`/api/articles/${art1Id}/undo`, { method: 'POST' });
  check('删除后撤销重建文章', (un.status === 200 || un.status === 201) && un.body?.id === art1Id, JSON.stringify(un.body));
  check('重建后标题正确', un.body?.title === '编码测试', `got ${un.body?.title}`);
  check('重建后章节完整', un.body?.chapters?.length === 1, `chapters=${un.body?.chapters?.length}`);
  const again = await api(`/api/articles/${art1Id}`, { method: 'DELETE' });
  check('再次删除成功', again.status === 200);
}

console.log('[6] 登录限流');
{
  let got429 = false;
  for (let i = 1; i <= 7; i++) {
    const res = await fetch(`${BASE}/api/articles/999999`, {
      method: 'DELETE',
      headers: { 'x-admin-token': 'wrong-pass' },
    });
    if (res.status === 429) {
      got429 = true;
      console.log(`  第 ${i} 次错误口令触发 429`);
      break;
    }
    if (res.status !== 401) {
      check(`第 ${i} 次错误口令应返回 401`, false, `got ${res.status}`);
      break;
    }
  }
  check('连续错误口令后触发 429 限流', got429);
  const list = await api('/api/uploads?pageSize=1');
  check('正确口令不受限流影响', list.status === 200, `got ${list.status}`);
}

console.log('[6.5] 关于我内容编辑（Markdown 渲染 + 配置回写）');
{
  const rawRes = await api('/api/site/about/raw');
  check('读取关于我原文', rawRes.status === 200 && typeof rawRes.body?.content === 'string', `got ${rawRes.status}`);
  let backup = null;
  try {
    backup = JSON.parse(JSON.stringify(rawRes.body));
    const putRes = await api('/api/site/about', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...backup, content: '## 验证标题\n\n**加粗**内容测试。' }),
    });
    check('保存关于我成功', putRes.status === 200, JSON.stringify(putRes.body));
    check('返回渲染后的 HTML（含 <strong>）', (putRes.body?.contentHtml ?? '').includes('<strong>'), putRes.body?.contentHtml);
    const getRes = await api('/api/site/about');
    check('公开接口渲染结果正确', (getRes.body?.contentHtml ?? '').includes('加粗'), getRes.body?.contentHtml);
  } finally {
    if (backup) {
      await api('/api/site/about', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(backup),
      }).catch(() => {});
      console.log('  about config restored');
    }
  }
}

// LLM 已启用时跳过"禁用回退"断言（避免消耗真实 API 额度）
const llmStatusRes = await api('/api/llm/status');
const llmReady = llmStatusRes.body?.enabled === true && llmStatusRes.body?.configured === true;

console.log('[6.6] LLM 接口（未启用时的回退行为）');
{
  const st = await api('/api/llm/status');
  check('LLM 状态接口可访问', st.status === 200 && typeof st.body?.enabled === 'boolean', `got ${st.status}`);
  const re = await api('/api/llm/reindex', { method: 'POST' });
  check('重建知识索引成功（无需 LLM）', re.status === 200 || re.status === 201, JSON.stringify(re.body));
  if (!llmReady) {
    const org = await api(`/api/llm/organize/${art1Id}`, { method: 'POST' });
    check('未启用 LLM 时整理返回 400', org.status === 400, `got ${org.status}`);
  } else {
    console.log('  LLM 已启用：跳过整理回退断言');
  }
}

console.log('[6.7] LLM 配置管理（多供应商 + apiKey 自动加密）');
{
  const llmPath = 'D:/code.game/MyBlog/config/llm.json';
  const backup = readFileSync(llmPath, 'utf-8');
  try {
    const cfg = await api('/api/llm/config');
    check('读取 LLM 配置成功', cfg.status === 200 && Array.isArray(cfg.body?.providers), `got ${cfg.status}`);
    const target = cfg.body?.providers?.[0] ?? { name: 'deepseek', baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat' };
    const put = await api('/api/llm/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        enabled: true,
        activeProvider: target.name,
        providers: [{ name: target.name, baseUrl: target.baseUrl, model: target.model, apiKey: 'verify-test-key' }],
      }),
    });
    check('保存 LLM 配置成功', put.status === 200 && put.body?.providers?.[0]?.apiKeyConfigured === true, JSON.stringify(put.body));
    const fileAfter = readFileSync(llmPath, 'utf-8');
    check(
      'apiKey 已加密（文件中无明文）',
      !fileAfter.includes('verify-test-key') && fileAfter.includes('apiKeyEnc'),
      fileAfter.slice(0, 120),
    );
  } finally {
    writeFileSync(llmPath, backup, 'utf-8');
    console.log('  llm config restored');
  }
}

console.log('[6.8] Skill 提示词与转换接口（类型守卫 + 回写）');
{
  const pro = await api('/api/llm/prompts');
  check('读取 Skill 提示词', pro.status === 200 && typeof pro.body?.chat === 'string' && typeof pro.body?.organize === 'string');
  const backup = pro.body;
  try {
    const put = await api('/api/llm/prompts', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...backup, image: '测试图片整理提示词' }),
    });
    check('保存 Skill 提示词', put.status === 200 && put.body?.image === '测试图片整理提示词', JSON.stringify(put.body));
  } finally {
    await api('/api/llm/prompts', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(backup),
    }).catch(() => {});
    console.log('  prompts restored');
  }
  // 类型守卫：非图片/非文档调用转换接口返回 400
  const artList = await api('/api/articles?status=all&pageSize=50');
  const someArt = artList.body?.items?.[0];
  if (someArt) {
    const imgBad = await api(`/api/llm/image-to-md/${someArt.id}`, { method: 'POST' });
    check('图片转换接口对非上传记录返回 4xx', imgBad.status >= 400 && imgBad.status < 500, `got ${imgBad.status}`);
    const docBad = await api(`/api/llm/doc-to-md/${someArt.id}`, { method: 'POST' });
    check('文档转换接口对非上传记录返回 4xx', docBad.status >= 400 && docBad.status < 500, `got ${docBad.status}`);
  }
}

console.log('[6.9] Skill 库（自主增删改 / 内置保护 / 生成与运行回退）');
{
  const list = await api('/api/llm/skills');
  check('列出 Skill（含内置）', list.status === 200 && Array.isArray(list.body) && list.body.length >= 3, `got ${list.status}`);
  const builtin = list.body?.find((s) => s.name === 'chat-assistant');
  check('内置 Skill 标记正确', builtin?.builtin === true);

  // 创建自定义 Skill
  const put = await api('/api/llm/skills/verify-test-skill', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: '你是测试 Skill，输出摘要。', description: '验证用' }),
  });
  check('创建自定义 Skill', put.status === 200 && put.body?.name === 'verify-test-skill', JSON.stringify(put.body));
  const list2 = await api('/api/llm/skills');
  const created = list2.body?.find((s) => s.name === 'verify-test-skill');
  check('新 Skill 出现在列表（非内置）', created && created.builtin === false && created.description === '验证用');

  // 内置不可删除
  const delBuiltin = await api('/api/llm/skills/chat-assistant', { method: 'DELETE' });
  check('内置 Skill 不可删除（400）', delBuiltin.status === 400, `got ${delBuiltin.status}`);

  // 生成/运行 Skill 需要 LLM → 未启用时 400；已启用时跳过（避免消耗额度）
  if (!llmReady) {
    const gen = await api('/api/llm/skills/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'gen-test', description: '测试生成' }),
    });
    check('未启用 LLM 时生成 Skill 返回 400', gen.status === 400, `got ${gen.status}`);

    const artList = await api('/api/articles?status=all&pageSize=50');
    const someId = artList.body?.items?.[0]?.id;
    if (someId) {
      const run = await api('/api/llm/skills/verify-test-skill/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ articleId: someId }),
      });
      check('未启用 LLM 时运行 Skill 返回 400', run.status === 400, `got ${run.status}`);
    }
  } else {
    console.log('  LLM 已启用：跳过生成/运行回退断言');
  }

  // 删除自定义 Skill
  const del = await api('/api/llm/skills/verify-test-skill', { method: 'DELETE' });
  check('删除自定义 Skill', del.status === 200, JSON.stringify(del.body));
  const list3 = await api('/api/llm/skills');
  check('删除后列表不再包含', !(list3.body ?? []).some((s) => s.name === 'verify-test-skill'));
}

console.log('[7] 清理剩余测试数据');
{
  const list = await api('/api/articles?status=all&pageSize=50');
  for (const a of list.body?.items ?? []) {
    if (a.slug.startsWith('编码测试') || a.slug.startsWith('中文测试') || a.slug.startsWith('verify-put')) {
      await api(`/api/articles/${a.id}`, { method: 'DELETE' });
    }
  }
  const ups = await api('/api/uploads?pageSize=100');
  for (const u of ups.body?.items ?? []) {
    if (u.filename.startsWith('编码测试') || u.filename.startsWith('GBK测试')) {
      await api(`/api/uploads/${u.id}`, { method: 'DELETE' });
    }
  }
  console.log('  cleanup done');
}

if (failures > 0) {
  console.error(`VERIFY-ADMIN-FAILED (${failures})`);
  process.exit(1);
}
console.log('VERIFY-ADMIN-PASS');
