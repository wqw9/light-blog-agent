/**
 * gray-matter 官方未发布 @types 包，这里按使用面做最小声明。
 */
declare module 'gray-matter' {
  interface GrayMatterData {
    [key: string]: unknown;
    title?: string;
    summary?: string;
    tags?: string[];
    cover?: string;
    category?: string;
    date?: string;
    draft?: boolean;
  }

  interface GrayMatterResult {
    data: GrayMatterData;
    content: string;
    excerpt?: string;
    isEmpty: boolean;
  }

  function matter(input: string | Buffer, options?: unknown): GrayMatterResult;

  export default matter;
}
