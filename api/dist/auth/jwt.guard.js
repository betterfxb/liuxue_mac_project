"use strict";
/**
 * 鉴权守卫与当前用户装饰器。
 *
 * 凭证来源（契约 §1 约定）：
 *   * 控制台：`Authorization: Bearer <JWT>`
 *   * 插件：  `X-Ext-Token: <JWT>`
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.CurrentUser = exports.JwtAuthGuard = void 0;
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
const biz_error_1 = require("../common/biz-error");
const database_service_1 = require("../db/database.service");
let JwtAuthGuard = class JwtAuthGuard {
    jwt;
    db;
    constructor(jwt, db) {
        this.jwt = jwt;
        this.db = db;
    }
    canActivate(context) {
        const req = context.switchToHttp().getRequest();
        const auth = req.header?.('authorization') || '';
        const ext = req.header?.('x-ext-token') || '';
        let token = '';
        if (auth.toLowerCase().startsWith('bearer '))
            token = auth.slice(7).trim();
        else if (ext)
            token = ext.trim();
        if (!token)
            throw biz_error_1.BizError.unauthenticated('缺少访问凭证');
        try {
            const payload = this.jwt.verify(token);
            const user = this.db.get('SELECT id, email, role FROM users WHERE id = ?', payload.sub);
            if (!user)
                throw biz_error_1.BizError.unauthenticated('用户不存在');
            req.user = {
                userId: user.id,
                email: user.email,
                role: user.role || 'user',
            };
            return true;
        }
        catch {
            throw biz_error_1.BizError.unauthenticated('凭证无效或已过期');
        }
    }
};
exports.JwtAuthGuard = JwtAuthGuard;
exports.JwtAuthGuard = JwtAuthGuard = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [jwt_1.JwtService, database_service_1.DatabaseService])
], JwtAuthGuard);
/** 取当前登录用户 */
exports.CurrentUser = (0, common_1.createParamDecorator)((_data, ctx) => {
    return ctx.switchToHttp().getRequest().user;
});
//# sourceMappingURL=jwt.guard.js.map