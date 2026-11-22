"use strict";
/**
 * trace_id 中间件：为每个请求分配链路 ID。
 * 优先复用上游传入的 X-Trace-Id，便于跨服务串联（网关 → intelligence → crawler）。
 */
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TraceMiddleware = void 0;
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
let TraceMiddleware = class TraceMiddleware {
    use(req, res, next) {
        const incoming = req.header('x-trace-id');
        const traceId = incoming && incoming.length <= 64 ? incoming : (0, node_crypto_1.randomBytes)(8).toString('hex');
        req.traceId = traceId;
        res.setHeader('X-Trace-Id', traceId);
        next();
    }
};
exports.TraceMiddleware = TraceMiddleware;
exports.TraceMiddleware = TraceMiddleware = __decorate([
    (0, common_1.Injectable)()
], TraceMiddleware);
//# sourceMappingURL=trace.middleware.js.map