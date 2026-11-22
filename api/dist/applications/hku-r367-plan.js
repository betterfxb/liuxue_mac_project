"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CUTOFF = void 0;
exports.planHkuR367 = planHkuR367;
const biz_error_1 = require("../common/biz-error");
exports.CUTOFF = '2027-02-01T04:00:00.000Z';
const OPEN = Date.parse('2026-09-20T16:00:00.000Z'); // beginning of published Hong Kong opening date, only an input sanity check
const cutoff = Date.parse(exports.CUTOFF);
const fourWeeks = 28 * 86400 * 1000;
const keys = new Set(['createdUtc', 'payment', 'ack', 'pdf', 'referee']);
const knownInstitutions = new Set(['the university of hong kong', 'university of hong kong', 'hku', '香港大学', '香港大學']);
const knownProgrammes = new Set(['master of science in artificial intelligence', 'msc(ai)', 'msc in artificial intelligence', '人工智能理学硕士', '人工智能理學碩士']);
const normal = (s) => typeof s === 'string' ? s.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ') : '';
function planHkuR367(rawRecord, query, now = Date.now()) {
    if (!rawRecord || typeof rawRecord !== 'object')
        throw biz_error_1.BizError.invalid('APPLICANT_RECORD_REQUIRED');
    const record = rawRecord;
    if (typeof record.status !== 'string')
        throw biz_error_1.BizError.invalid('APPLICANT_STATUS_UNAVAILABLE');
    if (!knownInstitutions.has(normal(record.institution_name)) || !knownProgrammes.has(normal(record.program)))
        throw biz_error_1.BizError.invalid('HKU_R367_APPLICATION_REQUIRED');
    if (!Number.isFinite(now) || Object.keys(query).some(k => !keys.has(k)))
        throw biz_error_1.BizError.invalid('UNKNOWN_PLANNER_INPUT');
    function choice(key, values) {
        const x = query[key] ?? 'unknown';
        if (typeof x !== 'string' || !values.includes(x))
            throw biz_error_1.BizError.invalid('INVALID_EVIDENCE_' + key.toUpperCase());
        return x;
    }
    const payment = choice('payment', ['unknown', 'not_seen', 'ambiguous', 'official_receipt_seen']);
    const ack = choice('ack', ['unknown', 'number_only', 'email_with_number_seen']);
    const pdf = choice('pdf', ['unknown', 'no_evidence', 'separate_addon_confirmation_seen']);
    const referee = choice('referee', ['unknown', 'omitted', 'details_in_official_form']);
    let created = null;
    if (query.createdUtc !== undefined) {
        const raw = query.createdUtc;
        if (typeof raw !== 'string' || !(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(raw)))
            throw biz_error_1.BizError.invalid('ACCOUNT_CREATION_UTC_REQUIRED');
        const parsed = Date.parse(raw), canonical = raw.includes('.') ? raw : raw.replace('Z', '.000Z');
        if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== canonical || parsed < OPEN || parsed > now || parsed >= cutoff)
            throw biz_error_1.BizError.invalid('ACCOUNT_CREATION_DATE_OUTSIDE_INTAKE');
        created = parsed;
    }
    const end = created === null ? null : Math.min(created + fourWeeks, cutoff);
    const clock = now >= cutoff || (end !== null && now >= end) ? 'closed' : end === null ? 'unknown_account_creation' : 'open_by_reported_account_time';
    let next;
    if (clock === 'closed')
        next = 'WINDOW_CLOSED_CONFIRM_WITH_PROGRAMME';
    else if (payment === 'ambiguous' || (payment === 'not_seen' && ack === 'email_with_number_seen'))
        next = 'RECONCILE_PAYMENT_AND_ACKNOWLEDGEMENT_DO_NOT_REPEAT_PAYMENT';
    else if (ack !== 'email_with_number_seen')
        next = ack === 'number_only' || payment === 'official_receipt_seen' ? 'CHECK_SEPARATE_ACKNOWLEDGEMENT' : 'PREPARE_AND_MANUALLY_CHECK_PORTAL';
    else if (clock === 'unknown_account_creation')
        next = 'CONFIRM_ACCOUNT_CREATION_BEFORE_ADDON';
    else if (pdf !== 'separate_addon_confirmation_seen')
        next = 'CHECK_SEPARATE_PDF_ADDON_EVIDENCE';
    else
        next = 'REVIEW_DOCUMENT_LIST_AGAINST_OFFICIAL_REQUIREMENTS';
    return {
        programme: 'HKU MSc(AI) 2027/28', code: 'R367',
        scope: 'local_read_only_self_reported_evidence', officiallyVerified: false,
        schoolContacted: false, readyToSubmit: false, allMaterialsAccepted: false, automaticAction: false,
        localStatus: record.status, localStatusIsOfficialEvidence: false,
        timing: { programmeCutoffUtc: exports.CUTOFF, possibleAccountEndUtc: created === null ? null : new Date(created + fourWeeks).toISOString(), effectiveEndUtc: end === null ? null : new Date(end).toISOString(), state: clock, inclusiveClose: true },
        evidence: { payment, submissionAcknowledgement: ack, pdfAddon: pdf, independentStages: true },
        referee: { input: referee, optional: true, schoolMayNotifyIfListed: true, notificationByThisApp: false },
        nextAction: next,
    };
}
//# sourceMappingURL=hku-r367-plan.js.map