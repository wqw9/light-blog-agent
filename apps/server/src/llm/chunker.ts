/**
 * 知识分块与检索（RAG-lite，无外部向量依赖）：
 * - 分块：按空行切段，短段合并，单块上限 maxChars
 * - 检索：查询与块做 token 重叠打分（中文二元组 + 英文单词），取 topK
 * 个人博客语料规模下效果足够，且零新增原生依赖。
 */
export function splitIntoChunks(contentMarkdown: string, maxChars = 1200): string[] {
  const paragraphs = contentMarkdown
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current = '';
  for (const p of paragraphs) {
    const merged = current ? `${current}\n\n${p}` : p;
    if (current && merged.length > maxChars) {
      chunks.push(current);
      current = p.length > maxChars ? p.slice(0, maxChars) : p;
    } else {
      current = merged;
    }
  }
  if (current) chunks.push(current);
  return chunks.filter((c) => c.length >= 20);
}

function addToken(map: Map<string, number>, token: string): void {
  map.set(token, (map.get(token) ?? 0) + 1);
}

export function tokenize(text: string): Map<string, number> {
  const lower = text.toLowerCase();
  const tokens = new Map<string, number>();
  const cjk = lower.replace(/[^\u4e00-\u9fff]/g, '');
  for (let i = 0; i < cjk.length - 1; i++) addToken(tokens, cjk.slice(i, i + 2));
  for (const w of lower.match(/[a-z0-9_]{2,}/g) ?? []) addToken(tokens, w);
  return tokens;
}

export interface ScoredChunk {
  chunkId: number;
  articleId: number;
  content: string;
  score: number;
}

export function scoreChunks(queryTokens: Map<string, number>, chunks: { id: number; articleId: number; content: string }[]): ScoredChunk[] {
  return chunks
    .map((c) => {
      const t = tokenize(c.content);
      let score = 0;
      for (const [token, qn] of queryTokens) {
        const cn = t.get(token) ?? 0;
        if (cn > 0) score += Math.min(qn, cn);
      }
      return { chunkId: c.id, articleId: c.articleId, content: c.content, score };
    })
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score);
}
