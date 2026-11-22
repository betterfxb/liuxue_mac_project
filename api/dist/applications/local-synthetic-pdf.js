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
exports.LocalSyntheticPdf = void 0;
exports.checkSyntheticPdf = checkSyntheticPdf;
exports.makeFixture = makeFixture;
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
const biz_error_1 = require("../common/biz-error");
const database_service_1 = require("../db/database.service");
const max = 512 * 1024;
function checkSyntheticPdf(value, type) {
    const b = Buffer.from(value);
    if (type !== 'application/pdf' || b.length < 120 || b.length > max || b.subarray(0, 8).toString('ascii') !== '%PDF-1.4'
        || !b.subarray(-24).toString('ascii').endsWith('%%EOF\n'))
        throw new biz_error_1.BizError(1001, 'LOCAL_PDF_VALIDATION_FAILED', 415);
    return { byteLength: b.length, sha256: (0, node_crypto_1.createHash)('sha256').update(b).digest('hex') };
}
function makeFixture(sample = undefined) {
    const contentBase = 'BT /F1 18 Tf 58 730 Td (Synthetic HKU R367 local preview) Tj 0 -31 Td /F1 12 Tf (QA fixture only - not for submission to any university.) Tj 0 -20 Td (This is not an applicant document or a school receipt.) Tj ET\n';
    const content = sample ? contentBase.replace('local preview', 'local preview ' + sample) : contentBase;
    const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
        '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
        '<< /Length ' + Buffer.byteLength(content, 'ascii') + ' >>\nstream\n' + content + 'endstream'];
    let pdf = '%PDF-1.4\n';
    const offsets = [];
    objects.forEach((obj, i) => { offsets.push(Buffer.byteLength(pdf, 'ascii')); pdf += (i + 1) + ' 0 obj\n' + obj + '\nendobj\n'; });
    const xref = Buffer.byteLength(pdf, 'ascii');
    pdf += 'xref\n0 6\n0000000000 65535 f \n' + offsets.map(off => String(off).padStart(10, '0') + ' 00000 n \n').join('') +
        'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n';
    return Buffer.from(pdf, 'ascii');
}
const fixture = makeFixture(), mime = 'application/pdf', filename = 'hku-r367-synthetic-local.pdf';
const info = checkSyntheticPdf(fixture, mime);
const table = 'admissions_local_synthetic_pdf_v1';
let LocalSyntheticPdf = class LocalSyntheticPdf {
    db;
    constructor(db) {
        this.db = db;
    }
    enabled() {
        if (process.env.NODE_ENV !== 'test' || process.env.APP_ENV !== 'test' || process.env.ADMISSIONS_SYNTHETIC_PDF !== '1')
            throw biz_error_1.BizError.notFound('SYNTHETIC_PDF_QA_DISABLED');
    }
    status(owner, record) {
        this.enabled();
        const exists = this.db.get("SELECT name FROM sqlite_master WHERE type='table' AND name=?", table);
        const item = exists ? this.db.get('SELECT sha256,byte_length FROM ' + table + ' WHERE user_id=? AND application_id=?', owner, record) : undefined;
        if (!item)
            return { scope: 'synthetic_qa', localStatus: 'not_prepared', schoolAddonVerified: false };
        if (item.sha256 !== info.sha256 || item.byte_length !== info.byteLength)
            throw new biz_error_1.BizError(1001, 'LOCAL_PDF_DIGEST_MISMATCH', 409);
        return { scope: 'synthetic_qa', localStatus: 'prepared', schoolAddonVerified: false, filename, mime, ...info };
    }
    prepare(owner, record, type, body) {
        this.enabled();
        if (type?.split(';')[0].trim().toLowerCase() !== 'application/json')
            throw new biz_error_1.BizError(1001, 'JSON_FIXTURE_SELECTOR_ONLY', 415);
        if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 1 || !Object.hasOwn(body, 'fixture') || body.fixture !== 'built_in_synthetic')
            throw biz_error_1.BizError.invalid('ONLY_BUILT_IN_SYNTHETIC_PDF_ALLOWED');
        const checked = checkSyntheticPdf(fixture, mime);
        this.db.run('CREATE TABLE IF NOT EXISTS ' + table + '(user_id INTEGER NOT NULL,application_id INTEGER NOT NULL,sha256 TEXT NOT NULL,byte_length INTEGER NOT NULL,PRIMARY KEY(user_id,application_id),FOREIGN KEY(application_id) REFERENCES applications(id))');
        const row = this.db.run('INSERT INTO ' + table + '(user_id,application_id,sha256,byte_length) VALUES (?,?,?,?) ON CONFLICT(user_id,application_id) DO NOTHING', owner, record, checked.sha256, checked.byteLength);
        if (Number(row.changes) !== 1)
            throw new biz_error_1.BizError(1001, 'LOCAL_SYNTHETIC_PDF_ALREADY_PREPARED', 409);
        return this.status(owner, record);
    }
    read(owner, record) {
        const state = this.status(owner, record);
        if (state.localStatus !== 'prepared')
            throw biz_error_1.BizError.notFound('LOCAL_SYNTHETIC_PDF_NOT_PREPARED');
        checkSyntheticPdf(fixture, mime);
        return { filename, mime, bytes: Buffer.from(fixture) };
    }
};
exports.LocalSyntheticPdf = LocalSyntheticPdf;
exports.LocalSyntheticPdf = LocalSyntheticPdf = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [database_service_1.DatabaseService])
], LocalSyntheticPdf);
//# sourceMappingURL=local-synthetic-pdf.js.map