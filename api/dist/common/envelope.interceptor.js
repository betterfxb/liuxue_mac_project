"use strict";
/**
 * 统一响应封装拦截器。
 *
 * 契约「通用响应」：`{ code, message, data, trace_id }`
 * 所有成功响应经此包装；错误响应由 AllExceptionsFilter 处理。
 */
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EnvelopeInterceptor = void 0;
exports.envelope = envelope;
const common_1 = require("@nestjs/common");
const operators_1 = require("rxjs/operators");
/** 允许处理器直接返回「已封装」结果（跳过二次包装） */
function envelope(data, traceId = '', message = 'ok', code = 0) {
    return { code, message, data, trace_id: traceId };
}
let EnvelopeInterceptor = class EnvelopeInterceptor {
    intercept(context, next) {
        const req = context.switchToHttp().getRequest();
        const traceId = req.traceId || '';
        return next.handle().pipe((0, operators_1.map)((data) => {
            // 已封装（含 code 字段）则原样透传
            if (data && typeof data === 'object' && typeof data.code === 'number' && 'trace_id' in data) {
                return data;
            }
            return envelope(data ?? null, traceId);
        }));
    }
};
exports.EnvelopeInterceptor = EnvelopeInterceptor;
exports.EnvelopeInterceptor = EnvelopeInterceptor = __decorate([
    (0, common_1.Injectable)()
], EnvelopeInterceptor);
//# sourceMappingURL=envelope.interceptor.js.map