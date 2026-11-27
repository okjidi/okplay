// 笔记安全渲染：沿用旧客户端先转义再格式化的实现。
(function(){
"use strict";
/**
 * 课堂笔记渲染。
 *
 * 安全要求（PRD §14 NFR-SEC-007）：课堂笔记按**不可信内容**处理。
 * 所以这里的原则是 —— **先转义，再套格式**，绝不把原始 HTML 直接注入 DOM。
 *
 * 为什么是自己写而不是引第三方 Markdown 库：
 *   这套只需要 7 种语法（标题、列表、引用、行内代码、代码块、粗体、表格），
 *   自绘的转义顺序是显式可读的。引库反而要额外审查它自己的 XSS 面。
 *   将来语法需求变复杂，再换成成熟的库 + DOMPurify。
 *
 * 生成的结果只应通过 dangerouslySetInnerHTML 使用，且**只能**是本函数的输出。
 */
function escapeHtml(text) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
/** 行内格式。输入必须是已转义的文本。 */
function inline(text) {
    return text
        .replace(/`([^`]+)`/g, (_match, code) => `<code>${code}</code>`)
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}
/**
 * 表格的「分隔行」：`| --- | :--: |` 这一类。
 * 它必须含至少一个 `-`，否则纯 `|` 的行会被误判成表格。
 */
function isTableDelimiter(line) {
    return line.includes('|') && line.includes('-') && /^[|\s:-]+$/.test(line);
}
/** 拆一行表格为单元格。行首行尾的 `|` 可有可无。输入必须是已转义的文本。 */
function splitRow(line) {
    return line
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .split('|')
        .map((cell) => cell.trim());
}
function renderNotes(markdown) {
    const lines = escapeHtml(markdown).split('\n');
    const out = [];
    let inList = false;
    let inCode = false;
    const closeList = () => {
        if (inList) {
            out.push('</ul>');
            inList = false;
        }
    };
    // 用下标循环而不是 for...of —— 表格分支要吃掉后续多行，得能推进游标。
    for (let index = 0; index < lines.length; index += 1) {
        const raw = lines[index] ?? '';
        if (raw.trim().startsWith('```')) {
            closeList();
            if (inCode) {
                out.push('</code></pre>');
                inCode = false;
            }
            else {
                out.push('<pre><code>');
                inCode = true;
            }
            continue;
        }
        if (inCode) {
            out.push(raw);
            continue;
        }
        const line = raw.trim();
        if (!line) {
            closeList();
            continue;
        }
        // 表格：本行有 `|`，且下一行是分隔行。两者都满足才当表格，
        // 否则正文里随便一个竖线（比如 `A | B`）会被误吞。
        const next = lines[index + 1];
        if (line.includes('|') && next !== undefined && isTableDelimiter(next.trim())) {
            closeList();
            out.push('<table><thead><tr>');
            for (const cell of splitRow(line))
                out.push(`<th>${inline(cell)}</th>`);
            out.push('</tr></thead><tbody>');
            index += 2; // 跳过表头行与分隔行
            while (index < lines.length) {
                const rowRaw = lines[index] ?? '';
                const row = rowRaw.trim();
                if (!row || !row.includes('|'))
                    break;
                out.push('<tr>');
                for (const cell of splitRow(row))
                    out.push(`<td>${inline(cell)}</td>`);
                out.push('</tr>');
                index += 1;
            }
            out.push('</tbody></table>');
            index -= 1; // 抵消 for 自增，回到最后一行正文
            continue;
        }
        const heading = /^(#{2,3})\s+(.*)$/.exec(line);
        if (heading && heading[1] && heading[2] !== undefined) {
            closeList();
            const tag = heading[1].length === 2 ? 'h2' : 'h3';
            out.push(`<${tag}>${inline(heading[2])}</${tag}>`);
            continue;
        }
        const quote = /^&gt;\s?(.*)$/.exec(line);
        if (quote && quote[1] !== undefined) {
            closeList();
            out.push(`<blockquote>${inline(quote[1])}</blockquote>`);
            continue;
        }
        const bullet = /^[-*]\s+(.*)$/.exec(line);
        const numbered = /^\d+\.\s+(.*)$/.exec(line);
        const item = bullet?.[1] ?? numbered?.[1];
        if (item !== undefined) {
            if (!inList) {
                out.push('<ul>');
                inList = true;
            }
            out.push(`<li>${inline(item)}</li>`);
            continue;
        }
        closeList();
        out.push(`<p>${inline(line)}</p>`);
    }
    closeList();
    if (inCode)
        out.push('</code></pre>');
    return out.join('\n');
}

window.renderNotes=renderNotes;
})();
