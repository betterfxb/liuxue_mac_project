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
exports.ApplicationsController = void 0;
const node_crypto_1 = require("node:crypto");
const native_preview_qa_1 = require("./native-preview-qa");
const selected_synthetic_pdf_1 = require("./selected-synthetic-pdf");
const local_synthetic_pdf_1 = require("./local-synthetic-pdf");
const hku_r367_plan_1 = require("./hku-r367-plan");
const common_1 = require("@nestjs/common");
const jwt_guard_1 = require("../auth/jwt.guard");
const applications_service_1 = require("./applications.service");
let ApplicationsController = class ApplicationsController {
    apps;
    pdf;
    pick;
    constructor(apps, pdf, pick) {
        this.apps = apps;
        this.pdf = pdf;
        this.pick = pick;
    }
    result(record, res) {
        res.setHeader('ETag', record.version);
        res.setHeader('Cache-Control', 'private, no-store');
        return record;
    }
    listInstitutions(query) {
        return this.apps.listInstitutions(query);
    }
    create(user, body, res) {
        return this.result(this.apps.createApplication(user.userId, body), res);
    }
    list(user, query, res) {
        res.setHeader('Cache-Control', 'private, no-store');
        return this.apps.listApplications(user.userId, query);
    }
    get(user, id, res) {
        res.setHeader('Cache-Control', 'private, no-store');
        return this.result(this.apps.getApplication(user.userId, id), res);
    }
    update(user, id, body, expected, res) {
        res.setHeader('Cache-Control', 'private, no-store');
        return this.result(this.apps.updateApplication(user.userId, id, body, expected), res);
    }
    hkuR367Plan(user, id, query, res) {
        res.setHeader('Cache-Control', 'private, no-store');
        const record = this.apps.getApplication(user.userId, id);
        return (0, hku_r367_plan_1.planHkuR367)(record, query);
    }
    qaPdfOwner(user, appId) {
        this.pdf.enabled();
        (0, hku_r367_plan_1.planHkuR367)(this.apps.getApplication(user.userId, appId), {});
    }
    localPdfStatus(user, id, res) {
        this.qaPdfOwner(user, id);
        res.setHeader('Cache-Control', 'private, no-store');
        return this.pdf.status(user.userId, id);
    }
    localPdfPrepare(user, id, type, body, res) {
        this.qaPdfOwner(user, id);
        res.setHeader('Cache-Control', 'private, no-store');
        return this.pdf.prepare(user.userId, id, type, body);
    }
    localPdfPreview(user, id, res) {
        this.qaPdfOwner(user, id);
        const file = this.pdf.read(user.userId, id);
        res.setHeader('Cache-Control', 'private, no-store');
        res.setHeader('Content-Type', file.mime);
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Content-Disposition', 'inline; filename="' + file.filename + '"');
        res.send(file.bytes);
    }
    qaSelectedOwner(user, id) {
        this.pick.enabled();
        (0, hku_r367_plan_1.planHkuR367)(this.apps.getApplication(user.userId, id), {});
    }
    selectPdfStatus(user, id, res) {
        this.qaSelectedOwner(user, id);
        res.setHeader('Cache-Control', 'private, no-store');
        return this.pick.status(user.userId, id);
    }
    selectPdfUpload(user, id, req, res) {
        this.qaSelectedOwner(user, id);
        res.setHeader('Cache-Control', 'private, no-store');
        return this.pick.upload(user.userId, id, req, res);
    }
    selectPdfPreview(user, id, res) {
        this.qaSelectedOwner(user, id);
        const file = this.pick.preview(user.userId, id);
        res.setHeader('Cache-Control', 'private, no-store');
        res.setHeader('Content-Type', file.mime);
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Content-Disposition', 'inline; filename="' + file.filename + '"');
        res.send(file.bytes);
    }
    async selectPdfPage(user, id, res) {
        this.qaSelectedOwner(user, id);
        const file = this.pick.preview(user.userId, id);
        const digest = (0, node_crypto_1.createHash)('sha256').update(file.bytes).digest('hex');
        const png = await (0, native_preview_qa_1.renderSyntheticPreview)(file.bytes);
        res.setHeader('Cache-Control', 'private, no-store');
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Preview-Source-SHA256', digest);
        res.send(png);
    }
    listRecommenders(user, id) {
        return this.apps.listRecommenders(user.userId, id);
    }
    addRecommender(user, id, body) {
        return this.apps.addRecommender(user.userId, id, body);
    }
    invite(user, id, rid) {
        return this.apps.markInvited(user.userId, id, rid);
    }
};
exports.ApplicationsController = ApplicationsController;
__decorate([
    (0, common_1.Get)('institutions'),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], ApplicationsController.prototype, "listInstitutions", null);
__decorate([
    (0, common_1.Post)('applications'),
    __param(0, (0, jwt_guard_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", void 0)
], ApplicationsController.prototype, "create", null);
__decorate([
    (0, common_1.Get)('applications'),
    __param(0, (0, jwt_guard_1.CurrentUser)()),
    __param(1, (0, common_1.Query)()),
    __param(2, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", void 0)
], ApplicationsController.prototype, "list", null);
__decorate([
    (0, common_1.Get)('applications/:id'),
    __param(0, (0, jwt_guard_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(2, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Number, Object]),
    __metadata("design:returntype", void 0)
], ApplicationsController.prototype, "get", null);
__decorate([
    (0, common_1.Patch)('applications/:id'),
    __param(0, (0, jwt_guard_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(2, (0, common_1.Body)()),
    __param(3, (0, common_1.Headers)('if-match')),
    __param(4, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Number, Object, String, Object]),
    __metadata("design:returntype", void 0)
], ApplicationsController.prototype, "update", null);
__decorate([
    (0, common_1.Get)('applications/:id/hku-r367-plan'),
    __param(0, (0, jwt_guard_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(2, (0, common_1.Query)()),
    __param(3, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Number, Object, Object]),
    __metadata("design:returntype", void 0)
], ApplicationsController.prototype, "hkuR367Plan", null);
__decorate([
    (0, common_1.Get)('applications/:id/hku-r367-local-pdf'),
    __param(0, (0, jwt_guard_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(2, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Number, Object]),
    __metadata("design:returntype", void 0)
], ApplicationsController.prototype, "localPdfStatus", null);
__decorate([
    (0, common_1.Post)('applications/:id/hku-r367-local-pdf'),
    __param(0, (0, jwt_guard_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(2, (0, common_1.Headers)('content-type')),
    __param(3, (0, common_1.Body)()),
    __param(4, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Number, String, Object, Object]),
    __metadata("design:returntype", void 0)
], ApplicationsController.prototype, "localPdfPrepare", null);
__decorate([
    (0, common_1.Get)('applications/:id/hku-r367-local-pdf/preview'),
    __param(0, (0, jwt_guard_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Number, Object]),
    __metadata("design:returntype", void 0)
], ApplicationsController.prototype, "localPdfPreview", null);
__decorate([
    (0, common_1.Get)('applications/:id/hku-r367-select-pdf'),
    __param(0, (0, jwt_guard_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(2, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Number, Object]),
    __metadata("design:returntype", void 0)
], ApplicationsController.prototype, "selectPdfStatus", null);
__decorate([
    (0, common_1.Post)('applications/:id/hku-r367-select-pdf'),
    __param(0, (0, jwt_guard_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(2, (0, common_1.Req)()),
    __param(3, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Number, Object, Object]),
    __metadata("design:returntype", void 0)
], ApplicationsController.prototype, "selectPdfUpload", null);
__decorate([
    (0, common_1.Get)('applications/:id/hku-r367-select-pdf/preview'),
    __param(0, (0, jwt_guard_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Number, Object]),
    __metadata("design:returntype", void 0)
], ApplicationsController.prototype, "selectPdfPreview", null);
__decorate([
    (0, common_1.Get)('applications/:id/hku-r367-select-pdf/page'),
    __param(0, (0, jwt_guard_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Number, Object]),
    __metadata("design:returntype", Promise)
], ApplicationsController.prototype, "selectPdfPage", null);
__decorate([
    (0, common_1.Get)('applications/:id/recommenders'),
    __param(0, (0, jwt_guard_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Number]),
    __metadata("design:returntype", void 0)
], ApplicationsController.prototype, "listRecommenders", null);
__decorate([
    (0, common_1.Post)('applications/:id/recommenders'),
    __param(0, (0, jwt_guard_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Number, Object]),
    __metadata("design:returntype", void 0)
], ApplicationsController.prototype, "addRecommender", null);
__decorate([
    (0, common_1.Post)('applications/:id/recommenders/:rid/invite'),
    __param(0, (0, jwt_guard_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(2, (0, common_1.Param)('rid', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Number, Number]),
    __metadata("design:returntype", void 0)
], ApplicationsController.prototype, "invite", null);
exports.ApplicationsController = ApplicationsController = __decorate([
    (0, common_1.Controller)('api/v1'),
    (0, common_1.UseGuards)(jwt_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [applications_service_1.ApplicationsService, local_synthetic_pdf_1.LocalSyntheticPdf, selected_synthetic_pdf_1.SelectedSyntheticPdf])
], ApplicationsController);
//# sourceMappingURL=applications.controller.js.map