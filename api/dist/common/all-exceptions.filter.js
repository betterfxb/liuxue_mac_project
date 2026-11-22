"use strict";
/**
 * 全局异常过滤器：把任何异常转成契约「通用响应」。
 * 保证前端只需处理一种响应结构。
 */
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AllExceptionsFilter = void 0;
const common_1 = require("@nestjs/common");
const biz_error_1 = require("./biz-error");
const { MaintenanceError } = require('../../scripts/lib/maintenance-state.cjs');
let AllExceptionsFilter = class AllExceptionsFilter {
    logger = new common_1.Logger('Exception');
    catch(exception, host) {
        const ctx = host.switchToHttp();
        const res = ctx.getResponse();
        const req = ctx.getRequest();
        const traceId = req?.traceId || '';
        let httpStatus = 500;
        let code = biz_error_1.ErrorCode.INTERNAL;
        let message = '服务器内部错误';
        if (exception instanceof MaintenanceError) {
            httpStatus = exception.httpStatus;
            code = 9002;
            message = exception.message;
            res.setHeader('Cache-Control', 'private, no-store');
        }
        else if (exception instanceof biz_error_1.BizError) {
            httpStatus = exception.httpStatus;
            code = exception.code;
            message = exception.message;
        }
        else if (exception instanceof common_1.HttpException) {
            httpStatus = exception.getStatus();
            code = (0, biz_error_1.httpStatusToCode)(httpStatus);
            const body = exception.getResponse();
            if (typeof body === 'string') {
                message = body;
            }
            else if (body && typeof body === 'object') {
                const m = body.message;
                message = Array.isArray(m) ? m.join('; ') : m || exception.message;
            }
            // 契约未定义的状态码归入内部错误，但保留原始 HTTP 语义
            if (code === biz_error_1.ErrorCode.INTERNAL && httpStatus < 500) {
                code = biz_error_1.ErrorCode.INVALID_PARAM;
            }
        }
        else {
            const err = exception;
            this.logger.error(`未捕获异常: ${err?.message}`, err?.stack);
            message = '服务器内部错误';
        }
        res.status(httpStatus).json({
            code,
            message,
            data: null,
            trace_id: traceId,
        });
    }
};
exports.AllExceptionsFilter = AllExceptionsFilter;
exports.AllExceptionsFilter = AllExceptionsFilter = __decorate([
    (0, common_1.Catch)()
], AllExceptionsFilter);
//# sourceMappingURL=all-exceptions.filter.js.map