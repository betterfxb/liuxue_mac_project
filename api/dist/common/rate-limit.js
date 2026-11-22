"use strict";
/**
 * 接口限流（契约 §9.6：响应头返回 `X-RateLimit-Limit / -Remaining / -Reset`）。
 *
 * 设计要点：
 *   * **滑动窗口**：记录窗口内的命中时刻；与固定窗口相比不会在边界处放行 2 倍流量
 *   * **内存天然有界**：达到上限后不再记录新命中，故每个 key 最多保存 `limit` 个时间戳
 *   * **时钟可注入**：`now()` 可替换，便于对窗口边界与恢复时机做精确断言（与 schedule.ts 同风格）
 *   * **规则按最长路径前缀匹配**：越具体的路由优先级越高（`/api/v1/auth/login` 优于 `/`）
 *   * **键维度**：`byUser` 规则在已登录时按 userId 计数，否则按 IP
 *   * 超限抛 `BizError.rateLimited`（429），由异常过滤器转成契约响应
 *
 * 已知边界：**单实例内存态**。多实例部署需换成集中计数（Redis），
 * 与调度器（`FOR UPDATE SKIP LOCKED`）同样的多实例约束。
 */
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var RateLimitService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RateLimitInterceptor = exports.RateLimitService = exports.SlidingWindowLimiter = exports.RATE_LIMIT_SKIP_PREFIXES = void 0;
exports.defaultRateLimitRules = defaultRateLimitRules;
exports.matchRateLimitRule = matchRateLimitRule;
exports.isRateLimitExempt = isRateLimitExempt;
exports.clientIp = clientIp;
const common_1 = require("@nestjs/common");
const rxjs_1 = require("rxjs");
const biz_error_1 = require("./biz-error");
const MINUTE = 60_000;
/** 不参与限流的路径前缀（健康检查、元信息、静态资源） */
exports.RATE_LIMIT_SKIP_PREFIXES = ['/health', '/api/v1/meta/'];
/**
 * 默认规则（从具体到宽泛）。
 * 认证类最严格——防暴力破解；管理与调度类影响全量用户，按用户计数且限额偏低。
 */
function defaultRateLimitRules() {
    const defaultLimit = clampInt(process.env.RATE_LIMIT_DEFAULT_LIMIT, 300, 1, 100_000);
    return [
        { name: 'auth', prefix: '/api/v1/auth/', windowMs: MINUTE, limit: 10 },
        { name: 'admin', prefix: '/api/v1/admin/', windowMs: MINUTE, limit: 60, byUser: true },
        { name: 'scheduler', prefix: '/api/v1/scheduler/', windowMs: MINUTE, limit: 30, byUser: true },
        { name: 'resume-parse', prefix: '/api/v1/resumes/parse', windowMs: MINUTE, limit: 20, byUser: true },
        { name: 'match', prefix: '/api/v1/match/', windowMs: MINUTE, limit: 60, byUser: true },
        { name: 'default', prefix: '/', windowMs: MINUTE, limit: defaultLimit },
    ];
}
/** 按最长前缀匹配规则（纯函数） */
function matchRateLimitRule(pathname, rules) {
    let best = null;
    for (const r of rules) {
        if (!pathname.startsWith(r.prefix))
            continue;
        if (!best || r.prefix.length > best.prefix.length)
            best = r;
    }
    return best;
}
/** 是否豁免限流（纯函数） */
function isRateLimitExempt(pathname, skips = exports.RATE_LIMIT_SKIP_PREFIXES) {
    return skips.some((p) => pathname.startsWith(p));
}
/**
 * 滑动窗口限流器。
 *
 * 被拒绝的命中**不写入**窗口——否则持续请求会不断把窗口向后推，
 * 导致客户端永远等不到恢复（"惩罚性延长"）。
 */
class SlidingWindowLimiter {
    buckets = new Map();
    now;
    maxKeys;
    maxWindowMs;
    constructor(opts = {}) {
        this.now = opts.now || (() => Date.now());
        this.maxKeys = opts.maxKeys ?? 10_000;
        this.maxWindowMs = opts.maxWindowMs ?? 60 * MINUTE;
    }
    /** 记录一次命中并判定是否放行 */
    hit(key, rule, at = this.now()) {
        const windowStart = at - rule.windowMs;
        const prev = this.buckets.get(key) || [];
        const hits = prev.filter((t) => t > windowStart);
        if (hits.length >= rule.limit) {
            // 已达上限：不写入本次命中，返回最早一次命中过期后的重置时刻
            const resetAt = hits[0] + rule.windowMs;
            this.buckets.set(key, hits);
            return {
                allowed: false,
                limit: rule.limit,
                remaining: 0,
                resetAt,
                retryAfter: Math.max(1, Math.ceil((resetAt - at) / 1000)),
            };
        }
        hits.push(at);
        this.buckets.set(key, hits);
        if (this.buckets.size > this.maxKeys)
            this.prune(at);
        return {
            allowed: true,
            limit: rule.limit,
            remaining: rule.limit - hits.length,
            resetAt: hits[0] + rule.windowMs,
            retryAfter: 0,
        };
    }
    /** 清理已彻底过期的 key，避免无上限增长 */
    prune(at = this.now()) {
        let removed = 0;
        for (const [key, hits] of this.buckets) {
            if (hits.length === 0 || hits[hits.length - 1] <= at - this.maxWindowMs) {
                this.buckets.delete(key);
                removed += 1;
            }
        }
        return removed;
    }
    reset() {
        this.buckets.clear();
    }
    /** 当前追踪的 key 数（测试与运维观测用） */
    get size() {
        return this.buckets.size;
    }
}
exports.SlidingWindowLimiter = SlidingWindowLimiter;
/** 取客户端 IP：优先反向代理头，回退连接地址 */
function clientIp(req) {
    const xf = String(req?.header?.('x-forwarded-for') || req?.headers?.['x-forwarded-for'] || '');
    if (xf)
        return xf.split(',')[0].trim();
    return String(req?.ip || req?.socket?.remoteAddress || 'unknown');
}
/**
 * 限流服务：持有窗口状态，支持运行时重新配置（测试与运维可动态调整）。
 */
let RateLimitService = RateLimitService_1 = class RateLimitService {
    limiter = new SlidingWindowLimiter();
    rules = defaultRateLimitRules();
    skip = exports.RATE_LIMIT_SKIP_PREFIXES;
    enabled = process.env.RATE_LIMIT_ENABLED !== '0';
    configure(cfg = {}) {
        if (cfg.rules)
            this.rules = cfg.rules;
        if (cfg.skip)
            this.skip = cfg.skip;
        if (cfg.enabled !== undefined)
            this.enabled = cfg.enabled;
        this.limiter.reset();
    }
    get isEnabled() {
        return this.enabled;
    }
    /** 匹配命中的规则；不限流时返回 null（未启用 / 豁免 / 无规则） */
    matchRule(pathname) {
        if (!this.enabled)
            return null;
        if (isRateLimitExempt(pathname, this.skip))
            return null;
        return matchRateLimitRule(pathname, this.rules);
    }
    /**
     * 判定一次请求；返回 null 表示不限流。
     * 计数键 = 身份 + 规则名，保证不同规则各自独立计数。
     */
    check(req, pathname, at) {
        const rule = this.matchRule(pathname);
        if (!rule)
            return null;
        const identity = RateLimitService_1.identityOf(req, rule);
        const verdict = this.limiter.hit(`${identity}:${rule.name}`, rule, at);
        return { verdict, rule };
    }
    /** 计数身份：已登录且规则要求时按用户，否则按 IP */
    static identityOf(req, rule) {
        const user = req?.user;
        if (rule.byUser && user && user.userId !== undefined)
            return `u:${user.userId}`;
        return `ip:${clientIp(req)}`;
    }
};
exports.RateLimitService = RateLimitService;
exports.RateLimitService = RateLimitService = RateLimitService_1 = __decorate([
    (0, common_1.Injectable)()
], RateLimitService);
/**
 * 全局限流拦截器。
 *
 * 注册为 `APP_INTERCEPTOR` 且**放在最前**：被限流的请求不应再消耗幂等记录或执行业务逻辑。
 * 响应始终写入 `X-RateLimit-Limit / -Remaining / -Reset`，超限额外写 `Retry-After`。
 */
let RateLimitInterceptor = class RateLimitInterceptor {
    service;
    constructor(service) {
        this.service = service;
    }
    intercept(context, next) {
        const http = context.switchToHttp();
        const req = http.getRequest();
        const res = http.getResponse();
        const pathname = String(req?.originalUrl || req?.url || '').split('?')[0];
        const result = this.service.check(req, pathname);
        if (!result)
            return next.handle();
        this.writeHeaders(res, result.verdict);
        if (!result.verdict.allowed) {
            const sec = Math.round(result.rule.windowMs / 1000);
            return (0, rxjs_1.throwError)(() => biz_error_1.BizError.rateLimited(`请求过于频繁（${result.rule.name}：${result.verdict.limit} 次 / ${sec} 秒），请稍后再试`));
        }
        return next.handle();
    }
    writeHeaders(res, v) {
        if (!res?.setHeader)
            return;
        res.setHeader('X-RateLimit-Limit', String(v.limit));
        res.setHeader('X-RateLimit-Remaining', String(v.remaining));
        res.setHeader('X-RateLimit-Reset', String(Math.ceil(v.resetAt / 1000)));
        if (!v.allowed) {
            res.setHeader('Retry-After', String(v.retryAfter));
        }
    }
};
exports.RateLimitInterceptor = RateLimitInterceptor;
exports.RateLimitInterceptor = RateLimitInterceptor = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [RateLimitService])
], RateLimitInterceptor);
function clampInt(raw, fallback, min, max) {
    const n = Number(raw);
    if (!Number.isFinite(n))
        return fallback;
    return Math.min(max, Math.max(min, Math.trunc(n)));
}
//# sourceMappingURL=rate-limit.js.map