"use strict";
/**
 * 分页与排序参数解析（契约 §9 约定 1、2）。
 *   分页：page（从 1 起）+ size（默认 20，最大 200）
 *   排序：sort=field:asc|desc，多字段逗号分隔
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_PAGE_SIZE = exports.MAX_PAGE_SIZE = void 0;
exports.parsePagination = parsePagination;
exports.parseSort = parseSort;
exports.pageResult = pageResult;
exports.MAX_PAGE_SIZE = 200;
exports.DEFAULT_PAGE_SIZE = 20;
function parsePagination(query) {
    let page = Number.parseInt(String(query.page ?? '1'), 10);
    let size = Number.parseInt(String(query.size ?? exports.DEFAULT_PAGE_SIZE), 10);
    if (!Number.isFinite(page) || page < 1)
        page = 1;
    if (!Number.isFinite(size) || size < 1)
        size = exports.DEFAULT_PAGE_SIZE;
    if (size > exports.MAX_PAGE_SIZE)
        size = exports.MAX_PAGE_SIZE;
    return { page, size, offset: (page - 1) * size };
}
/**
 * 解析排序表达式，并限制在白名单内（防注入）。
 * 非法取值回退到 fallback。
 */
function parseSort(raw, allowed, fallback) {
    if (!raw || typeof raw !== 'string')
        return [fallback];
    const out = [];
    for (const part of raw.split(',')) {
        const [field, dirRaw] = part.split(':').map((s) => s.trim());
        if (!field || !allowed.includes(field))
            continue;
        const direction = String(dirRaw || 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc';
        out.push({ field, direction });
    }
    return out.length ? out : [fallback];
}
/** 构造统一分页响应体 */
function pageResult(items, total, p) {
    return {
        total,
        page: p.page,
        size: p.size,
        items,
    };
}
//# sourceMappingURL=pagination.js.map