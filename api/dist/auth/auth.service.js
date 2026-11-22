"use strict";
/**
 * 鉴权服务：注册 / 登录 / 刷新 / 登出（契约 §1）。
 *
 * - 密码用 bcrypt 哈希存储；
 * - access_token 2h，refresh_token 30d；
 * - refresh 采用轮换策略（旧 token 立即吊销），防重放。
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
exports.AuthService = exports.ACCESS_TTL_SEC = void 0;
exports.isEmail = isEmail;
exports.isAdminEmail = isAdminEmail;
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
const bcryptjs_1 = require("bcryptjs");
const node_crypto_1 = require("node:crypto");
const biz_error_1 = require("../common/biz-error");
const database_service_1 = require("../db/database.service");
exports.ACCESS_TTL_SEC = 7200;
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;
function nowIso() {
    return new Date().toISOString();
}
function isEmail(v) {
    return typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}
/**
 * 管理员白名单判定（纯函数，便于测试）。
 *
 * 管理员不做「注册后自助升级」——那等于把权限交给任意注册者。
 * ADMIN_EMAILS only reserves identities; it never proves mailbox ownership.
 * Public registration cannot create administrators. Operators grant roles locally.
 */
function isAdminEmail(email, raw = process.env.ADMIN_EMAILS) {
    if (typeof email !== 'string' || !raw)
        return false;
    const target = email.trim().toLowerCase();
    if (!target)
        return false;
    // 分隔符必须覆盖顿号「、」——界面与配置示例习惯用顿号，
    // 漏掉会让整串被当成一个地址而匹配不上（本项目已因此踩过一次：订阅关键词拆分）
    return String(raw)
        .split(/[,，、\s]+/)
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean)
        .includes(target);
}
let AuthService = class AuthService {
    db;
    jwt;
    constructor(db, jwt) {
        this.db = db;
        this.jwt = jwt;
    }
    issue(user) {
        const payload = { sub: user.id, email: user.email, role: user.role };
        const accessToken = this.jwt.sign(payload, { expiresIn: exports.ACCESS_TTL_SEC });
        const refreshToken = (0, node_crypto_1.randomBytes)(32).toString('hex');
        this.db.run(`INSERT INTO refresh_tokens(token, user_id, expires_at, revoked, created_at)
       VALUES (?, ?, ?, 0, ?)`, refreshToken, user.id, new Date(Date.now() + REFRESH_TTL_MS).toISOString(), nowIso());
        return {
            access_token: accessToken,
            refresh_token: refreshToken,
            expires_in: exports.ACCESS_TTL_SEC,
            token_type: 'Bearer',
        };
    }
    register(email, password, nickname = '') {
        if (!isEmail(email))
            throw biz_error_1.BizError.invalid('邮箱格式不正确');
        if (isAdminEmail(email))
            throw biz_error_1.BizError.forbidden('此邮箱已保留，请联系管理员开户');
        if (typeof password !== 'string' || password.length < 6) {
            throw biz_error_1.BizError.invalid('密码至少 6 位');
        }
        if (this.db.get('SELECT id FROM users WHERE email = ?', email)) {
            throw biz_error_1.BizError.invalid('该邮箱已注册');
        }
        const now = nowIso();
        const role = 'user';
        const res = this.db.run(`INSERT INTO users(email, password_hash, nickname, role, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`, email, (0, bcryptjs_1.hashSync)(password, 10), nickname || email.split('@')[0], role, now, now);
        const user = this.db.get('SELECT * FROM users WHERE id = ?', Number(res.lastInsertRowid));
        this.db.run(`INSERT INTO profiles(user_id, data, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(user_id) DO NOTHING`, user.id, JSON.stringify({}), now);
        return { user_id: user.id, email: user.email, ...this.issue(user) };
    }
    login(email, password) {
        if (!isEmail(email) || typeof password !== 'string') {
            throw biz_error_1.BizError.invalid('邮箱或密码格式不正确');
        }
        const user = this.db.get('SELECT * FROM users WHERE email = ?', email);
        if (!user || !(0, bcryptjs_1.compareSync)(password, user.password_hash)) {
            throw biz_error_1.BizError.unauthenticated('邮箱或密码错误');
        }
        return { user_id: user.id, email: user.email, ...this.issue(user) };
    }
    refresh(refreshToken) {
        if (typeof refreshToken !== 'string' || !refreshToken) {
            throw biz_error_1.BizError.invalid('缺少 refresh_token');
        }
        return this.db.tx(() => {
            const row = this.db.get('SELECT user_id, expires_at, revoked FROM refresh_tokens WHERE token = ?', refreshToken);
            if (!row || row.revoked)
                throw biz_error_1.BizError.unauthenticated('refresh_token 无效');
            const expires = Date.parse(row.expires_at);
            if (!Number.isFinite(expires) || expires <= Date.now())
                throw biz_error_1.BizError.unauthenticated('refresh_token 已过期');
            const user = this.db.get('SELECT * FROM users WHERE id = ?', row.user_id);
            if (!user)
                throw biz_error_1.BizError.unauthenticated('用户不存在');
            const consumed = this.db.run('UPDATE refresh_tokens SET revoked = 1 WHERE token = ? AND revoked = 0', refreshToken);
            if (Number(consumed.changes) !== 1)
                throw biz_error_1.BizError.unauthenticated('refresh_token 无效');
            // Consuming the old token and issuing its successor commit together, including signing failures.
            return { user_id: user.id, email: user.email, ...this.issue(user) };
        }, true);
    }
    logout(refreshToken) {
        if (typeof refreshToken === 'string' && refreshToken) {
            this.db.run('UPDATE refresh_tokens SET revoked = 1 WHERE token = ?', refreshToken);
        }
        return { ok: true };
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [database_service_1.DatabaseService,
        jwt_1.JwtService])
], AuthService);
//# sourceMappingURL=auth.service.js.map