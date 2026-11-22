"use strict";
/**
 * 业务错误码（对齐 docs/02-详细设计/03-接口契约.md §8）。
 * code 非 0 表示业务错误。
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.BizError = exports.ErrorCode = void 0;
exports.httpStatusToCode = httpStatusToCode;
exports.ErrorCode = {
    OK: 0,
    /** 参数校验失败 */
    INVALID_PARAM: 1001,
    /** 未认证 / token 失效 */
    UNAUTHENTICATED: 1002,
    /** 无权限 */
    FORBIDDEN: 1003,
    /** 资源不存在 */
    NOT_FOUND: 2001,
    /** 人机验证阻断 */
    CAPTCHA_BLOCKED: 3001,
    /** 平台适配规则缺失 */
    ADAPTER_MISSING: 3002,
    /** 采集源限流 */
    SOURCE_RATE_LIMITED: 4001,
    /** 采集源失效 */
    SOURCE_FAILED: 4002,
    /** 接口限流（请求过于频繁） */
    RATE_LIMITED: 4003,
    /** LLM 调用失败 */
    LLM_FAILED: 5001,
    /** 内部错误 */
    INTERNAL: 5000,
    /** 触发合规硬约束 */
    COMPLIANCE_BLOCKED: 9001,
};
/** HTTP 状态码 → 业务错误码 */
function httpStatusToCode(status) {
    switch (status) {
        case 400:
        case 422:
            return exports.ErrorCode.INVALID_PARAM;
        case 401:
            return exports.ErrorCode.UNAUTHENTICATED;
        case 403:
            return exports.ErrorCode.FORBIDDEN;
        case 404:
            return exports.ErrorCode.NOT_FOUND;
        default:
            return exports.ErrorCode.INTERNAL;
    }
}
/** 业务错误：由异常过滤器统一转成契约响应 */
class BizError extends Error {
    code;
    httpStatus;
    constructor(code, message, httpStatus = 400) {
        super(message);
        this.code = code;
        this.httpStatus = httpStatus;
        this.name = 'BizError';
    }
    static invalid(message = '参数校验失败') {
        return new BizError(exports.ErrorCode.INVALID_PARAM, message, 400);
    }
    static unauthenticated(message = '未认证或登录已失效') {
        return new BizError(exports.ErrorCode.UNAUTHENTICATED, message, 401);
    }
    static forbidden(message = '无权限') {
        return new BizError(exports.ErrorCode.FORBIDDEN, message, 403);
    }
    static notFound(message = '资源不存在') {
        return new BizError(exports.ErrorCode.NOT_FOUND, message, 404);
    }
    static compliance(message = '触发合规硬约束') {
        return new BizError(exports.ErrorCode.COMPLIANCE_BLOCKED, message, 403);
    }
    /** 请求过于频繁：HTTP 429，由限流拦截器抛出，响应须带 X-RateLimit-* 头 */
    static rateLimited(message = '请求过于频繁，请稍后再试') {
        return new BizError(exports.ErrorCode.RATE_LIMITED, message, 429);
    }
}
exports.BizError = BizError;
//# sourceMappingURL=biz-error.js.map