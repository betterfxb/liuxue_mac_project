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
exports.SelectedSyntheticPdf = void 0;
exports.makeSelectedFixture = makeSelectedFixture;
const common_1 = require("@nestjs/common");
const biz_error_1 = require("../common/biz-error");
const database_service_1 = require("../db/database.service");
const local_synthetic_pdf_1 = require("./local-synthetic-pdf");
const multer = require('multer');
const mime = 'application/pdf', limit = 512 * 1024, table = 'admissions_selected_synthetic_pdf_v1';
const fixtures = ['A', 'B', 'C'].map(key => {
    const bytes = makeSelectedFixture(key);
    return { key, filename: 'synthetic-r367-' + key.toLowerCase() + '.pdf', bytes, ...(0, local_synthetic_pdf_1.checkSyntheticPdf)(bytes, mime) };
});
const receive = multer({ storage: multer.memoryStorage(), preservePath: true,
    limits: { fileSize: limit, files: 1, fields: 0, parts: 2, fieldNameSize: 35, headerPairs: 20 } }).single('pdf');
let SelectedSyntheticPdf = class SelectedSyntheticPdf {
    db;
    constructor(db) {
        this.db = db;
    }
    enabled() {
        if (process.env.NODE_ENV !== 'test' || process.env.APP_ENV !== 'test' || process.env.ADMISSIONS_SYNTHETIC_PICK_PDF !== '1')
            throw biz_error_1.BizError.notFound('SYNTHETIC_PDF_SELECTION_DISABLED');
    }
    row(owner, app) {
        this.enabled();
        if (!this.db.get("SELECT name FROM sqlite_master WHERE type='table' AND name=?", table))
            return undefined;
        const row = this.db.get('SELECT fixture_key,sha256,byte_length FROM ' + table + ' WHERE user_id=? AND application_id=?', owner, app);
        if (!row)
            return undefined;
        const known = fixtures.find(x => x.key === row.fixture_key && x.sha256 === row.sha256 && x.byteLength === row.byte_length);
        if (!known)
            throw new biz_error_1.BizError(1001, 'LOCAL_SELECTION_METADATA_MISMATCH', 409);
        return known;
    }
    info(known) {
        return { scope: 'synthetic_qa', localStatus: known ? 'selected' : 'not_selected', schoolAddonVerified: false,
            allowed: fixtures.map(({ filename, sha256, byteLength }) => ({ filename, sha256, byteLength })),
            selected: known ? { filename: known.filename, sha256: known.sha256, byteLength: known.byteLength, mime } : null };
    }
    status(owner, app) { return this.info(this.row(owner, app)); }
    async upload(owner, app, req, res) {
        this.enabled();
        if (!req.is('multipart/form-data'))
            throw new biz_error_1.BizError(1001, 'MULTIPART_REQUIRED', 415);
        const file = await new Promise((resolve, reject) => receive(req, res, (err) => {
            if (err)
                return reject(new biz_error_1.BizError(1001, 'INVALID_SYNTHETIC_MULTIPART', err.code === 'LIMIT_FILE_SIZE' ? 413 : 400));
            resolve(req.file);
        }));
        try {
            if (!file || !Buffer.isBuffer(file.buffer))
                throw biz_error_1.BizError.invalid('ONE_SYNTHETIC_PDF_REQUIRED');
            const named = fixtures.find(x => x.filename === file.originalname);
            if (!named)
                throw biz_error_1.BizError.invalid('SYNTHETIC_PDF_FILENAME_REQUIRED');
            const checked = (0, local_synthetic_pdf_1.checkSyntheticPdf)(file.buffer, file.mimetype);
            if (file.size !== checked.byteLength || checked.sha256 !== named.sha256 || checked.byteLength !== named.byteLength)
                throw new biz_error_1.BizError(1001, 'SYNTHETIC_PDF_EXACT_BYTES_REQUIRED', 415);
            this.db.run('CREATE TABLE IF NOT EXISTS ' + table + '(user_id INTEGER NOT NULL,application_id INTEGER NOT NULL,fixture_key TEXT NOT NULL,sha256 TEXT NOT NULL,byte_length INTEGER NOT NULL,PRIMARY KEY(user_id,application_id),FOREIGN KEY(application_id) REFERENCES applications(id))');
            const row = this.db.run('INSERT INTO ' + table + '(user_id,application_id,fixture_key,sha256,byte_length) VALUES (?,?,?,?,?) ON CONFLICT(user_id,application_id) DO UPDATE SET fixture_key=excluded.fixture_key,sha256=excluded.sha256,byte_length=excluded.byte_length WHERE sha256<>excluded.sha256', owner, app, named.key, named.sha256, named.byteLength);
            return { ...this.info(named), reused: Number(row.changes) === 0 };
        }
        finally {
            file?.buffer?.fill(0);
            delete req.file;
        }
    }
    preview(owner, app) {
        const known = this.row(owner, app);
        if (!known)
            throw biz_error_1.BizError.notFound('NO_SYNTHETIC_SELECTION');
        return { filename: known.filename, mime, bytes: Buffer.from(known.bytes) };
    }
};
exports.SelectedSyntheticPdf = SelectedSyntheticPdf;
exports.SelectedSyntheticPdf = SelectedSyntheticPdf = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [database_service_1.DatabaseService])
], SelectedSyntheticPdf);
function bilingualFixture() {
    const text = 'BT /F2 28 Tf 58 730 Td <B3C9BCA8B5A5> Tj /F1 21 Tf 0 -43 Td (Transcript - R367 QA bilingual) Tj 0 -32 Td /F1 12 Tf (Synthetic only - no submission.) Tj ET\n';
    const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 6 0 R >> >> /Contents 5 0 R >>',
        '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', '<< /Length ' + text.length + ' >>\nstream\n' + text + 'endstream',
        '<< /Type /Font /Subtype /Type0 /BaseFont /STSong-Light /Encoding /GBK-EUC-H /DescendantFonts [7 0 R] >>',
        '<< /Type /Font /Subtype /CIDFontType0 /BaseFont /STSong-Light /CIDSystemInfo << /Registry (Adobe) /Ordering (GB1) /Supplement 4 >> /FontDescriptor 8 0 R /DW 1000 >>',
        '<< /Type /FontDescriptor /FontName /STSong-Light /Flags 6 /FontBBox [-25 -254 1000 880] /ItalicAngle 0 /Ascent 752 /Descent -271 /CapHeight 737 /StemV 58 >>'];
    let pdf = '%PDF-1.4\n';
    const offsets = [];
    objects.forEach((obj, i) => { offsets.push(pdf.length); pdf += (i + 1) + ' 0 obj\n' + obj + '\nendobj\n'; });
    const pos = pdf.length;
    return Buffer.from(pdf + 'xref\n0 9\n0000000000 65535 f \n' + offsets.map(off => String(off).padStart(10, '0') + ' 00000 n \n').join('') + 'trailer\n<< /Size 9 /Root 1 0 R >>\nstartxref\n' + pos + '\n%%EOF\n', 'ascii');
}
function makeSelectedFixture(key) { return key === 'C' ? bilingualFixture() : (0, local_synthetic_pdf_1.makeFixture)(key); }
//# sourceMappingURL=selected-synthetic-pdf.js.map