"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RuntimeConfigError = void 0;
exports.isProduction = isProduction;
exports.resolveRuntimeConfig = resolveRuntimeConfig;
exports.inspectRuntimeFilesystem = inspectRuntimeFilesystem;
exports.runtimeCors = runtimeCors;
exports.publicRuntimeSummary = publicRuntimeSummary;
/** Startup policy is pure; filesystem inspection is explicitly read-only and separate. */
const node_path_1 = require("node:path");
const node_fs_1 = require("node:fs");
class RuntimeConfigError extends Error {
    issues;
    constructor(issues) {
        super(`启动配置被拒绝：${issues.join(', ')}`);
        this.issues = issues;
        this.name = 'RuntimeConfigError';
    }
}
exports.RuntimeConfigError = RuntimeConfigError;
function isProduction(env = process.env) {
    return [env.NODE_ENV, env.APP_ENV].some(v => ['production', 'prod', 'staging'].includes((v || '').trim().toLowerCase()));
}
function strongSecret(value) {
    return Buffer.byteLength(value, 'utf8') >= 32 && value.length <= 4096 && new Set(value).size >= 10
        && !/^(dev[-_ ]?secret|test[-_ ]?secret|change[-_ ]?me|your[-_ ]|replace[-_ ]|example[-_ ])/i.test(value);
}
function inside(parent, child) {
    const rel = (0, node_path_1.relative)(parent, child);
    return rel === '' || (rel !== '..' && !rel.startsWith('..' + node_path_1.sep) && !(0, node_path_1.isAbsolute)(rel));
}
function corsOrigin(value) {
    try {
        const url = new URL(value);
        if (url.username || url.password || url.search || url.hash || url.pathname && url.pathname !== '/')
            return false;
        if (url.protocol === 'chrome-extension:')
            return /^chrome-extension:\/\/[a-p]{32}$/.test(value);
        return url.protocol === 'https:' && url.origin === value && !value.includes('*');
    }
    catch {
        return false;
    }
}
function upstream(value) {
    try {
        const url = new URL(value || '');
        return ['http:', 'https:'].includes(url.protocol) && !!url.hostname && !url.username && !url.password && !url.search && !url.hash && url.pathname === '/';
    }
    catch {
        return false;
    }
}
function resolveRuntimeConfig(env = process.env) {
    const production = isProduction(env), issues = [];
    for (const key of ['NODE_ENV', 'APP_ENV'])
        if (env[key] && !['dev', 'development', 'test', 'local', 'prod', 'production', 'staging'].includes(env[key].trim().toLowerCase()))
            issues.push(key + '_INVALID');
    const jwtSecret = env.JWT_SECRET || '';
    if (!production && !strongSecret(jwtSecret))
        issues.push('JWT_SECRET_STRONG_VALUE_REQUIRED');
    const dbPath = env.DB_PATH || ':memory:', storageDir = env.STORAGE_DIR || './storage';
    const corsOrigins = [...new Set((env.CORS_ORIGINS || '').split(',').map(v => v.trim()).filter(Boolean))];
    const port = Number(env.PORT || 8080);
    if (!Number.isInteger(port) || port < (production ? 1 : 0) || port > 65535)
        issues.push('PORT_INVALID');
    if (production) {
        if (!strongSecret(jwtSecret))
            issues.push('JWT_SECRET_STRONG_VALUE_REQUIRED');
        if (!(0, node_path_1.isAbsolute)(dbPath) || dbPath === ':memory:')
            issues.push('DB_PATH_ABSOLUTE_FILE_REQUIRED');
        if (!(0, node_path_1.isAbsolute)(storageDir))
            issues.push('STORAGE_DIR_ABSOLUTE_REQUIRED');
        if ((0, node_path_1.isAbsolute)(dbPath) && (0, node_path_1.isAbsolute)(storageDir) && inside(storageDir, dbPath))
            issues.push('DB_PATH_OUTSIDE_STORAGE_REQUIRED');
        if (!corsOrigins.length || !corsOrigins.every(corsOrigin))
            issues.push('CORS_ORIGINS_EXACT_HTTPS_OR_EXTENSION_REQUIRED');
        if (!upstream(env.CRAWLER_BASE))
            issues.push('CRAWLER_BASE_EXPLICIT_SERVICE_REQUIRED');
        if (!upstream(env.INTELLIGENCE_BASE))
            issues.push('INTELLIGENCE_BASE_EXPLICIT_SERVICE_REQUIRED');
        if (!['0', '1'].includes(env.SCHEDULER_ENABLED || ''))
            issues.push('SCHEDULER_ENABLED_EXPLICIT_0_OR_1_REQUIRED');
        if (env.RATE_LIMIT_ENABLED !== undefined && env.RATE_LIMIT_ENABLED !== '1')
            issues.push('RATE_LIMIT_MUST_REMAIN_ENABLED');
        if (env.SQLITE_JOURNAL_MODE && !['wal', 'delete', 'truncate', 'persist'].includes(env.SQLITE_JOURNAL_MODE))
            issues.push('SQLITE_DURABLE_JOURNAL_REQUIRED');
        if (env.STORAGE_DRIVER && env.STORAGE_DRIVER !== 'local')
            issues.push('STORAGE_DRIVER_IMPLEMENTATION_REQUIRED');
        if (env.DB_ALLOW_CREATE !== undefined && !['0', '1'].includes(env.DB_ALLOW_CREATE))
            issues.push('DB_ALLOW_CREATE_INVALID');
        if (env.CRAWLER_CONTROL_TOKEN && (!strongSecret(env.CRAWLER_CONTROL_TOKEN) || env.CRAWLER_CONTROL_TOKEN === jwtSecret))
            issues.push('CRAWLER_CONTROL_TOKEN_DISTINCT_STRONG_VALUE_REQUIRED');
    }
    if (issues.length)
        throw new RuntimeConfigError(issues);
    return { production, jwtSecret, dbPath, storageDir, corsOrigins, port, host: env.HOST || '127.0.0.1', schedulerEnabled: env.SCHEDULER_ENABLED === '1' || (!production && env.SCHEDULER_ENABLED !== '0'), allowNewDatabase: env.DB_ALLOW_CREATE === '1', crawlerControlConfigured: !!env.CRAWLER_CONTROL_TOKEN };
}
/** No creation, chmod, SQLite opening, migration, network access or value logging. */
function inspectRuntimeFilesystem(config) {
    if (!config.production)
        return;
    const issues = [];
    let dbExists = false;
    try {
        const stat = (0, node_fs_1.statSync)(config.dbPath);
        dbExists = stat.isFile();
        if (!dbExists)
            issues.push('DB_PATH_NOT_REGULAR_FILE');
        else if (stat.size < 100 && !config.allowNewDatabase)
            issues.push('DB_EXISTING_CONTENT_REQUIRED_OR_EXPLICIT_CREATE');
    }
    catch {
        if (!config.allowNewDatabase)
            issues.push('DB_FILE_REQUIRED_OR_EXPLICIT_CREATE');
    }
    try {
        if (!(0, node_fs_1.statSync)(config.storageDir).isDirectory())
            issues.push('STORAGE_DIRECTORY_REQUIRED');
    }
    catch {
        issues.push('STORAGE_DIRECTORY_REQUIRED');
    }
    if (dbExists) {
        try {
            if (inside((0, node_fs_1.realpathSync)(config.storageDir), (0, node_fs_1.realpathSync)(config.dbPath)))
                issues.push('DB_PATH_STORAGE_ALIAS_FORBIDDEN');
        }
        catch { /* Already reported missing metadata. */ }
    }
    else if (config.allowNewDatabase) {
        try {
            if (!(0, node_fs_1.statSync)((0, node_path_1.dirname)(config.dbPath)).isDirectory())
                issues.push('DB_PARENT_DIRECTORY_REQUIRED');
            if (inside((0, node_fs_1.realpathSync)(config.storageDir), (0, node_path_1.join)((0, node_fs_1.realpathSync)((0, node_path_1.dirname)(config.dbPath)), (0, node_path_1.basename)(config.dbPath))))
                issues.push('DB_PATH_STORAGE_ALIAS_FORBIDDEN');
        }
        catch {
            issues.push('DB_PARENT_DIRECTORY_REQUIRED');
        }
    }
    if (issues.length)
        throw new RuntimeConfigError(issues);
}
function runtimeCors(config) {
    return { origin: config.production ? ((origin, callback) => callback(null, !!origin && config.corsOrigins.includes(origin))) : true,
        credentials: true, exposedHeaders: ['X-Trace-Id', 'Content-Disposition', 'ETag'] };
}
function publicRuntimeSummary(config) {
    return { production: config.production, scope: 'CONFIG_AND_PATH_METADATA_ONLY', persistent_database: config.dbPath !== ':memory:', explicit_cors_origins: config.corsOrigins.length, scheduler_enabled: config.schedulerEnabled, crawler_control_configured: config.crawlerControlConfigured,
        database_integrity_verified: false, backup_verified: false, upstreams_contacted: 0, services_started: 0 };
}
//# sourceMappingURL=runtime-config.js.map