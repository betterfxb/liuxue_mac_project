"use strict";
/**
 * 申请管理模块（契约 §5）。
 *
 * GET   /api/v1/institutions                              院校项目列表
 * POST  /api/v1/applications                              新建申请
 * GET   /api/v1/applications                              申请列表（按状态筛选）
 * GET   /api/v1/applications/{id}                         读取单条与内容版本
 * PATCH /api/v1/applications/{id}                         更新进度
 * GET   /api/v1/applications/{id}/recommenders            推荐人列表
 * POST  /api/v1/applications/{id}/recommenders            添加推荐人
 * POST  /api/v1/applications/{id}/recommenders/{rid}/invite  记录「已邀请」
 *
 * 合规：推荐人邀请由用户在院校系统内自行完成，本服务只做**登记与状态跟踪**，不代发邀请邮件。
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
exports.RECOMMENDER_STATUS = exports.APPLICATION_STATUS = exports.ApplicationsService = void 0;
const node_crypto_1 = require("node:crypto");
const common_1 = require("@nestjs/common");
const biz_error_1 = require("../common/biz-error");
const pagination_1 = require("../common/pagination");
const database_service_1 = require("../db/database.service");
const APPLICATION_STATUS = ['draft', 'in_progress', 'submitted', 'interview', 'offer', 'rejected'];
exports.APPLICATION_STATUS = APPLICATION_STATUS;
const RECOMMENDER_STATUS = ['pending', 'invited', 'submitted'];
exports.RECOMMENDER_STATUS = RECOMMENDER_STATUS;
let ApplicationsService = class ApplicationsService {
    db;
    constructor(db) {
        this.db = db;
    }
    /** Strong representation token, scoped to every persisted field including owner and id.
     * No new columns or timestamp-only version: same-millisecond writes remain distinguishable.
     */
    versioned(row) {
        const canonical = JSON.stringify(Object.keys(row).sort().map(key => [key, row[key]]));
        const version = '"application-' + (0, node_crypto_1.createHash)('sha256').update(canonical).digest('hex') + '"';
        return { ...row, version };
    }
    checkVersion(expected, actual) {
        if (!expected)
            throw new biz_error_1.BizError(1001, '保存申请需要读取时的 If-Match 版本，请重新读取记录', 428);
        if (typeof expected !== 'string' || !/^"application-[a-f0-9]{64}"$/.test(expected))
            throw biz_error_1.BizError.invalid('If-Match 必须是读取申请返回的完整版本');
        if (expected !== actual)
            throw new biz_error_1.BizError(1001, '申请已在其他窗口更新，本窗口草稿已保留；请先核对最新记录', 412);
    }
    // ------------------------------------------------------------ 院校
    listInstitutions(query) {
        const p = (0, pagination_1.parsePagination)(query);
        const where = [];
        const params = [];
        if (query.country) {
            where.push('country = ?');
            params.push(String(query.country));
        }
        if (query.platform) {
            where.push('platform = ?');
            params.push(String(query.platform));
        }
        if (query.keyword) {
            where.push('(name LIKE ? OR program LIKE ?)');
            const kw = `%${query.keyword}%`;
            params.push(kw, kw);
        }
        const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
        const total = this.db.get(`SELECT COUNT(*) AS c FROM institutions ${clause}`, ...params).c;
        const items = this.db.all(`SELECT * FROM institutions ${clause} ORDER BY id ASC LIMIT ? OFFSET ?`, ...params, p.size, p.offset);
        return (0, pagination_1.pageResult)(items, total, p);
    }
    // ------------------------------------------------------------ 申请
    createApplication(userId, body) {
        const now = new Date().toISOString();
        let institutionName = String(body?.institution_name || '');
        let program = String(body?.program || '');
        let platform = String(body?.platform || '');
        let deadline = String(body?.deadline || '');
        // 支持按 institution_id 自动带出信息
        if (body?.institution_id) {
            const inst = this.db.get('SELECT * FROM institutions WHERE id = ?', Number(body.institution_id));
            if (!inst)
                throw biz_error_1.BizError.notFound('院校项目不存在');
            institutionName = institutionName || inst.name;
            program = program || inst.program;
            platform = platform || inst.platform;
            deadline = deadline || inst.deadline;
        }
        if (!institutionName)
            throw biz_error_1.BizError.invalid('缺少 institution_name 或 institution_id');
        const res = this.db.run(`INSERT INTO applications(user_id, institution_id, institution_name, program, platform,
        status, progress, deadline, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'draft', 0, ?, ?, ?, ?)`, userId, body?.institution_id ? Number(body.institution_id) : null, institutionName, program, platform, deadline, String(body?.notes || ''), now, now);
        return this.getApplication(userId, Number(res.lastInsertRowid));
    }
    listApplications(userId, query) {
        const p = (0, pagination_1.parsePagination)(query);
        const where = ['user_id = ?'];
        const params = [userId];
        if (query.status && query.status !== 'all') {
            where.push('status = ?');
            params.push(String(query.status));
        }
        if (query.keyword) {
            where.push('(institution_name LIKE ? OR program LIKE ?)');
            const kw = `%${query.keyword}%`;
            params.push(kw, kw);
        }
        const clause = `WHERE ${where.join(' AND ')}`;
        const total = this.db.get(`SELECT COUNT(*) AS c FROM applications ${clause}`, ...params).c;
        const items = this.db.all(`SELECT * FROM applications ${clause} ORDER BY updated_at DESC, id DESC LIMIT ? OFFSET ?`, ...params, p.size, p.offset);
        return (0, pagination_1.pageResult)(items.map(row => this.versioned(row)), total, p);
    }
    getApplication(userId, id) {
        const row = this.db.get('SELECT * FROM applications WHERE id = ? AND user_id = ?', id, userId);
        if (!row)
            throw biz_error_1.BizError.notFound('申请记录不存在');
        return this.versioned(row);
    }
    updateApplication(userId, id, body, expected) {
        // The read, precondition and write share a write transaction across SQLite processes.
        return this.db.tx(() => {
            const current = this.getApplication(userId, id); // Owner check precedes version errors.
            this.checkVersion(expected, current.version);
            const sets = [];
            const params = [];
            if (body?.status !== undefined) {
                if (!APPLICATION_STATUS.includes(body.status)) {
                    throw biz_error_1.BizError.invalid(`status 非法（可用：${APPLICATION_STATUS.join(', ')}）`);
                }
                sets.push('status = ?');
                params.push(String(body.status));
            }
            if (body?.progress !== undefined) {
                const n = Number(body.progress);
                if (!Number.isFinite(n) || n < 0 || n > 100)
                    throw biz_error_1.BizError.invalid('progress 需为 0~100');
                sets.push('progress = ?');
                params.push(Math.round(n));
            }
            for (const field of ['institution_name', 'program', 'platform', 'deadline', 'notes']) {
                if (body?.[field] !== undefined) {
                    sets.push(`${field} = ?`);
                    params.push(String(body[field]));
                }
            }
            if (!sets.length)
                throw biz_error_1.BizError.invalid('没有可更新的字段');
            sets.push('updated_at = ?');
            params.push(new Date().toISOString());
            params.push(id, userId);
            this.db.run(`UPDATE applications SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`, ...params);
            return this.getApplication(userId, id);
        }, true);
    }
    // ------------------------------------------------------------ 推荐人
    listRecommenders(userId, applicationId) {
        this.getApplication(userId, applicationId);
        return this.db.all('SELECT * FROM recommenders WHERE application_id = ? ORDER BY id ASC', applicationId);
    }
    addRecommender(userId, applicationId, body) {
        this.getApplication(userId, applicationId);
        const name = String(body?.name || '').trim();
        if (!name)
            throw biz_error_1.BizError.invalid('缺少推荐人姓名');
        const res = this.db.run(`INSERT INTO recommenders(application_id, name, email, title, org, status, invited_at, created_at)
       VALUES (?, ?, ?, ?, ?, 'pending', '', ?)`, applicationId, name, String(body?.email || ''), String(body?.title || ''), String(body?.org || ''), new Date().toISOString());
        return this.db.get('SELECT * FROM recommenders WHERE id = ?', Number(res.lastInsertRowid));
    }
    markInvited(userId, applicationId, recommenderId) {
        this.getApplication(userId, applicationId);
        const rec = this.db.get('SELECT id FROM recommenders WHERE id = ? AND application_id = ?', recommenderId, applicationId);
        if (!rec)
            throw biz_error_1.BizError.notFound('推荐人不存在');
        this.db.run(`UPDATE recommenders SET status = 'invited', invited_at = ? WHERE id = ?`, new Date().toISOString(), recommenderId);
        return this.db.get('SELECT * FROM recommenders WHERE id = ?', recommenderId);
    }
};
exports.ApplicationsService = ApplicationsService;
exports.ApplicationsService = ApplicationsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [database_service_1.DatabaseService])
], ApplicationsService);
//# sourceMappingURL=applications.service.js.map