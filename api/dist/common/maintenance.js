"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MaintenanceController = exports.MaintenanceInterceptor = void 0;
const common_1 = require("@nestjs/common");
const rxjs_1 = require("rxjs");
const database_service_1 = require("../db/database.service");
const jwt_guard_1 = require("../auth/jwt.guard");
const biz_error_1 = require("./biz-error");
let MaintenanceInterceptor = class MaintenanceInterceptor {
    db;
    constructor(db) {
        this.db = db;
    }
    intercept(context, next) {
        const req = context.switchToHttp().getRequest(), route = String(req.path || req.url || '').split('?')[0].replace(/\/+$/, '');
        if (route === '/health' || /^\/api\/v1\/maintenance(?:\/(pause|resume))?$/.test(route))
            return next.handle();
        // An independent subscription remains alive until the controller's promise settles;
        // client disconnect/unsubscribe cannot falsely release a still-running operation.
        return (0, rxjs_1.from)(this.db.maintenanceOperation('http', () => (0, rxjs_1.lastValueFrom)(next.handle(), { defaultValue: undefined })));
    }
};
exports.MaintenanceInterceptor = MaintenanceInterceptor;
exports.MaintenanceInterceptor = MaintenanceInterceptor = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [database_service_1.DatabaseService])
], MaintenanceInterceptor);
let MaintenanceController = class MaintenanceController {
    db;
    constructor(db) {
        this.db = db;
    }
    admin(user) { if (user.role !== 'admin')
        throw biz_error_1.BizError.forbidden('需要管理员权限'); }
    // The control version covers mode/generation, not changing operation statistics.
    result(res, value) { res.setHeader('Cache-Control', 'private, no-store'); return value; }
    status(user, res) { this.admin(user); return this.result(res, this.db.maintenanceStatus()); }
    change(user, action, expected, res) { this.admin(user); return this.result(res, this.db.maintenanceChange(action, expected)); }
};
exports.MaintenanceController = MaintenanceController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, jwt_guard_1.CurrentUser)()),
    __param(1, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], MaintenanceController.prototype, "status", null);
__decorate([
    (0, common_1.Post)(':action'),
    __param(0, (0, jwt_guard_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('action')),
    __param(2, (0, common_1.Headers)('if-match')),
    __param(3, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, Object]),
    __metadata("design:returntype", void 0)
], MaintenanceController.prototype, "change", null);
exports.MaintenanceController = MaintenanceController = __decorate([
    (0, common_1.Controller)('api/v1/maintenance'),
    (0, common_1.UseGuards)(jwt_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [database_service_1.DatabaseService])
], MaintenanceController);
//# sourceMappingURL=maintenance.js.map