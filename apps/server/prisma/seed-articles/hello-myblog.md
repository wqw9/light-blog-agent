---
title: 欢迎来到拾页书阁
date: 2025-01-01
tags: [随笔, 公告]
summary: 一个像书一样的个人博客——Markdown 写作、代码高亮、书页阅读。这篇示例展示了它的一切。
---

你好，这里是**拾页书阁**。

这是一个把博客做成"书"的地方：每一篇 Markdown 都是一本书，按章节翻页阅读；代码块自带语法高亮；把 `.md` 文件拖进书架，就能立刻出版。

## 写作，然后出版

传统博客的流程是"写 → 排版 → 发布"。拾页书阁把流程压缩成一步：

1. 用任何编辑器写好 Markdown
2. 打开书架页，把文件拖进去
3. 完成——文章自动解析标题、标签、摘要，按章节装订成书

> 上传即发布，就是这么简单。

## 关于这篇示例

这篇文章本身就是用 `---` 分章符切成的三个章节，你正在读的是第一章。看完后试试键盘方向键 `←` `→` 翻章、`T` 打开目录、`F` 进入沉浸模式。

---

# 代码高亮演示

本站使用 highlight.js 做代码高亮，支持 190+ 种语言，配色会随书页主题（米黄 / 纸白 / 护眼绿 / 夜间）自动切换。

## TypeScript

```ts
export interface Chapter {
  index: number;
  title: string;
  contentMd: string;
  wordCount: number;
}

export function splitChapters(source: string): Chapter[] {
  const parts = source.split(/^\s*---+\s*$/m);
  return parts.map((contentMd, i) => ({
    index: i + 1,
    title: `第 ${i + 1} 章`,
    contentMd,
    wordCount: contentMd.length,
  }));
}
```

## Rust

```rust
fn main() {
    let shelf: Vec<&str> = vec!["随笔", "技术", "阅读"];
    for book in shelf.iter() {
        println!("书架上有一本「{}」", book);
    }
}
```

## Python

```python
def reading_minutes(word_count: int) -> int:
    """每 400 字约 1 分钟阅读时长"""
    return max(1, round(word_count / 400))
```

---

# 上传与书页

## 支持的文件类型

| 类型 | 处理方式 | 状态 |
|------|----------|------|
| `.md` / `.markdown` / `.txt` | 解析 frontmatter，自动分章发布 | ✅ Phase 1 |
| `.png` / `.jpg` / `.webp` / `.gif` | 存入图库，返回直链 | ✅ Phase 1 |
| `.pdf` / `.docx` | 落盘存档，文本提取与知识库索引 | ⏳ Phase 4 |

## 书页阅读

- [x] 纸张质感布局（米黄 / 纸白 / 护眼绿 / 夜间）
- [x] 章节目录抽屉与上一章 / 下一章
- [x] 阅读进度条与断点续读
- [x] 字号调节与沉浸模式
- [ ] 动态小人（Phase 3）
- [ ] LLM 知识问答（Phase 4）
