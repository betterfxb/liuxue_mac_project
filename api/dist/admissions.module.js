"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdmissionsModule = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const applications_module_1 = require("./applications/applications.module");
const auth_module_1 = require("./auth/auth.module");
const database_module_1 = require("./db/database.module");
const all_exceptions_filter_1 = require("./common/all-exceptions.filter");
const envelope_interceptor_1 = require("./common/envelope.interceptor");
const rate_limit_1 = require("./common/rate-limit");
const idempotency_1 = require("./common/idempotency");
const maintenance_1 = require("./common/maintenance");
const trace_middleware_1 = require("./common/trace.middleware");
let AdmissionsModule = class AdmissionsModule {
    configure(consumer) { consumer.apply(trace_middleware_1.TraceMiddleware).forRoutes({ path: '{*splat}', method: common_1.RequestMethod.ALL }); }
};
exports.AdmissionsModule = AdmissionsModule;
exports.AdmissionsModule = AdmissionsModule = __decorate([
    (0, common_1.Module)({ imports: [database_module_1.DatabaseModule, auth_module_1.AuthModule, applications_module_1.ApplicationsModule], providers: [
            rate_limit_1.RateLimitService, idempotency_1.IdempotencyService,
            { provide: core_1.APP_INTERCEPTOR, useClass: maintenance_1.MaintenanceInterceptor },
            { provide: core_1.APP_INTERCEPTOR, useClass: rate_limit_1.RateLimitInterceptor },
            { provide: core_1.APP_INTERCEPTOR, useClass: envelope_interceptor_1.EnvelopeInterceptor },
            { provide: core_1.APP_INTERCEPTOR, useClass: idempotency_1.IdempotencyInterceptor },
            { provide: core_1.APP_FILTER, useClass: all_exceptions_filter_1.AllExceptionsFilter },
        ] })
], AdmissionsModule);
//# sourceMappingURL=admissions.module.js.map