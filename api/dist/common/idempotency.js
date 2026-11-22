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
Object.defineProperty(exports, "__esModule", { value: true });
exports.IdempotencyInterceptor = exports.IdempotencyService = void 0;
exports.canonicalJson = canonicalJson;
/** Authenticated POST idempotency: actor + route + key, bound to exact JSON input.
 * Old unscoped rows remain on disk but are never read. Auth tokens are never cached.
 */
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
const rxjs_1 = require("rxjs");
const database_service_1 = require("../db/database.service");
const biz_error_1 = require("./biz-error");
const TTL_MS = 24 * 60 * 60 * 1000;
function canonicalJson(value) {
    if (value === undefined)
        return 'null';
    if (value === null || typeof value !== 'object')
        return JSON.stringify(value);
    if (Array.isArray(value))
        return `[${value.map(canonicalJson).join(',')}]`;
    return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(',')}}`;
}
const digest = (value) => (0, node_crypto_1.createHash)('sha256').update(value).digest('hex');
const conflict = (message) => new biz_error_1.BizError(biz_error_1.ErrorCode.INVALID_PARAM, message, 409);
let IdempotencyService = class IdempotencyService {
    db;
    constructor(db) {
        this.db = db;
    }
    claim(key, fingerprint) {
        return this.db.tx(() => {
            let row = this.db.get('SELECT * FROM idempotency_requests WHERE key = ?', key);
            // Never steal unfinished work: a crashed/cancelled request may have committed side effects.
            if (row && row.response !== null && Date.now() - Date.parse(row.created_at) > TTL_MS) {
                this.db.run('DELETE FROM idempotency_requests WHERE key = ?', key);
                row = undefined;
            }
            if (row) {
                if (row.fingerprint !== fingerprint)
                    throw conflict('同一幂等键不能用于不同请求内容');
                if (row.response === null)
                    throw conflict('同一幂等请求正在处理或结果待核实，请稍后重试');
                return { cached: true, payload: JSON.parse(row.response) };
            }
            const owner = (0, node_crypto_1.randomUUID)();
            this.db.run('INSERT INTO idempotency_requests(key, fingerprint, owner, response, created_at) VALUES (?, ?, ?, NULL, ?)', key, fingerprint, owner, new Date().toISOString());
            return { cached: false, owner };
        }, true);
    }
    complete(key, owner, payload) {
        this.db.run('UPDATE idempotency_requests SET response = ? WHERE key = ? AND owner = ? AND response IS NULL', JSON.stringify(payload ?? null), key, owner);
    }
    fail(key, owner) {
        this.db.run('DELETE FROM idempotency_requests WHERE key = ? AND owner = ? AND response IS NULL', key, owner);
    }
};
exports.IdempotencyService = IdempotencyService;
exports.IdempotencyService = IdempotencyService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [database_service_1.DatabaseService])
], IdempotencyService);
let IdempotencyInterceptor = class IdempotencyInterceptor {
    idem;
    constructor(idem) {
        this.idem = idem;
    }
    intercept(context, next) {
        const req = context.switchToHttp().getRequest();
        const route = String(req.originalUrl || req.url || '').split('?')[0];
        // Credential endpoints must always authenticate afresh, and must never cache tokens.
        if (req.method !== 'POST' || !req.user?.userId || (route.startsWith('/api/v1/auth/') || route.startsWith('/api/v1/maintenance')))
            return next.handle();
        const rawKey = req.header?.('idempotency-key');
        if (!rawKey)
            return next.handle();
        if (typeof rawKey !== 'string' || !/^[\x21-\x7e]{1,200}$/.test(rawKey))
            throw biz_error_1.BizError.invalid('Idempotency-Key 非法');
        const key = digest(canonicalJson([String(req.user.userId), req.method, route, rawKey]));
        const fingerprint = digest(canonicalJson({ query: req.query || {}, body: req.body ?? null }));
        return (0, rxjs_1.defer)(() => {
            const reservation = this.idem.claim(key, fingerprint);
            if (reservation.cached)
                return (0, rxjs_1.of)(reservation.payload);
            let succeeded = false;
            return next.handle().pipe((0, rxjs_1.tap)(data => {
                succeeded = true;
                this.idem.complete(key, reservation.owner, data);
            }), (0, rxjs_1.catchError)(error => {
                // Cache persistence failure after business success is uncertain: keep the claim closed.
                const safeToRetry = error instanceof biz_error_1.BizError && [400, 401, 403, 404, 422].includes(error.httpStatus);
                if (!succeeded && safeToRetry)
                    this.idem.fail(key, reservation.owner);
                return (0, rxjs_1.throwError)(() => error);
            }));
        });
    }
};
exports.IdempotencyInterceptor = IdempotencyInterceptor;
exports.IdempotencyInterceptor = IdempotencyInterceptor = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [IdempotencyService])
], IdempotencyInterceptor);
//# sourceMappingURL=idempotency.js.map