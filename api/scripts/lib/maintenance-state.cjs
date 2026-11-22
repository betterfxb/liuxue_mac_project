/** Cooperative per-SQLite maintenance protocol. No TTL/force completion, network or env bypass. */
'use strict';
const {AsyncLocalStorage}=require('node:async_hooks');
const {randomUUID}=require('node:crypto');
const CONTROL_SQL=`
CREATE TABLE IF NOT EXISTS maintenance_control (
 id INTEGER PRIMARY KEY CHECK(id=1), mode TEXT NOT NULL CHECK(mode IN ('live','draining','active')),
 generation INTEGER NOT NULL CHECK(generation>=0), updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS maintenance_operations (
 id TEXT PRIMARY KEY, owner TEXT NOT NULL, kind TEXT NOT NULL, generation INTEGER NOT NULL, started_at TEXT NOT NULL
);
INSERT OR IGNORE INTO maintenance_control VALUES(1,'live',0,'');
`;
class MaintenanceError extends Error {
 constructor(message='维护门禁已阻断新操作，请稍后重试；未自动重放',status=503){super(message);this.name='MaintenanceError';this.httpStatus=status;this.code=9002;}
}
function present(db){return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='maintenance_control'").get();}
function triggers(tables){return tables.filter(t=>!t.startsWith('maintenance_')).flatMap(table=>['INSERT','UPDATE','DELETE'].map(action=>`
CREATE TRIGGER IF NOT EXISTS maintenance_${action.toLowerCase()}_${table} BEFORE ${action} ON ${table}
WHEN COALESCE((SELECT mode FROM maintenance_control WHERE id=1),'invalid') NOT IN ('live','draining')
BEGIN SELECT RAISE(ABORT,'MAINTENANCE_ACTIVE'); END;
`)).join('');}
class MaintenanceGate {
 constructor(db){this.db=db;this.context=new AsyncLocalStorage();this.owner=randomUUID();}
 rawState(){const row=this.db.prepare('SELECT * FROM maintenance_control WHERE id=1').get();if(!row||!['live','draining','active'].includes(row.mode)||!Number.isSafeInteger(row.generation))throw new MaintenanceError('维护状态不可验证，已拒绝操作');return row;}
 status(){const row=this.rawState(),n=this.db.prepare('SELECT COUNT(*) AS n FROM maintenance_operations').get().n;return{mode:row.mode,generation:row.generation,version:`"maintenance-${row.generation}"`,active_operations:n,admission_open:row.mode==='live',tracked_operations_drained:row.mode==='active'&&n===0,safe_for_backup:false,external_quiescence_verified:false};}
 transaction(fn){if(this.db.isTransaction)return fn();this.db.exec('BEGIN IMMEDIATE');try{const r=fn();this.db.exec('COMMIT');return r;}catch(e){try{this.db.exec('ROLLBACK');}catch{}throw e;}}
 current(){const lease=this.context.getStore();if(!lease)return null;const row=this.db.prepare('SELECT generation FROM maintenance_operations WHERE id=? AND owner=?').get(lease.id,this.owner);if(!row||row.generation!==lease.generation||this.rawState().mode==='active')throw new MaintenanceError('在途操作凭据已失效，拒绝重新接纳');return lease;}
 enter(kind){if(this.current())return null;try{return this.transaction(()=>{const row=this.rawState();if(row.mode!=='live')throw new MaintenanceError();const lease={id:randomUUID(),generation:row.generation};this.db.prepare('INSERT INTO maintenance_operations VALUES(?,?,?,?,?)').run(lease.id,this.owner,String(kind).slice(0,64),lease.generation,new Date().toISOString());return lease;});}catch(error){if(!(error instanceof MaintenanceError))error.maintenanceAdmissionFailed=true;throw error;}}
 leave(lease){if(!lease)return;this.transaction(()=>{const r=this.db.prepare('DELETE FROM maintenance_operations WHERE id=? AND owner=?').run(lease.id,this.owner);if(!r.changes)throw new MaintenanceError('在途记录缺失，不能确认排空');const row=this.rawState();if(row.mode==='draining'&&!this.db.prepare('SELECT 1 FROM maintenance_operations LIMIT 1').get())this.db.prepare("UPDATE maintenance_control SET mode='active',generation=generation+1,updated_at=? WHERE id=1").run(new Date().toISOString());});}
 sync(kind,fn){const lease=this.enter(kind);if(!lease)return fn();return this.context.run(lease,()=>{try{return fn();}finally{this.leave(lease);}});}
 async operation(kind,fn){const lease=this.enter(kind);if(!lease)return fn();return this.context.run(lease,async()=>{try{return await fn();}finally{this.leave(lease);}});}
 // Read-only audits may not create leases. Fence only synchronous dispatch admission;
 // already dispatched remote work can still complete and is never claimed as drained.
 fence(fn){if(this.db.isTransaction)throw new MaintenanceError('只读派发门禁不能复用已有事务快照');return this.transaction(()=>{if(this.rawState().mode!=='live')throw new MaintenanceError();return fn();});}
 change(action,expected){return this.transaction(()=>{const state=this.status();if(!expected)throw new MaintenanceError('维护操作需要读取时的If-Match版本',428);if(!/^"maintenance-\d+"$/.test(expected))throw new MaintenanceError('维护版本格式无效',400);if(expected!==state.version)throw new MaintenanceError('维护状态已变化，请重新读取',412);let mode;
 if(action==='pause'){if(state.mode!=='live')return state;mode=state.active_operations?'draining':'active';}
 else if(action==='resume'){if(state.mode!=='active'||state.active_operations)throw new MaintenanceError('尚未排空，不能恢复或跳过未知在途任务',409);mode='live';}
 else throw new MaintenanceError('维护操作无效',400);
 this.db.prepare('UPDATE maintenance_control SET mode=?,generation=generation+1,updated_at=? WHERE id=1').run(mode,new Date().toISOString());return this.status();});}
}
module.exports={CONTROL_SQL,MaintenanceGate,MaintenanceError,present,triggers};
