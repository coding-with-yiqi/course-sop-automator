/**
 * 把 instructionRichText 的受限 HTML 转成带换行的纯文本,供不支持 HTML 的
 * 同步目标(语雀 markdown / Notion paragraph)使用。
 *
 * 关键:列表项 <li>、段落 <p>、<br> 必须落成换行,否则 `AB` 会挤成一行
 * (放开 <ul><li> 排版后尤其明显)。<li> 前补「· 」让条目可辨。
 */
export function richTextToPlain(html: string): string {
  return html
    .replace(/<li[^>]*>/gi, '\n· ')
    .replace(/<\/(p|ul|ol|div)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
