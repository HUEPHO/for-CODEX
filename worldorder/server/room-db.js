import {RoomError} from './rooms.js';

export function roomDatabase(env){
 if(!env.DB)throw new RoomError('房间服务暂时不可用，请稍后重试',503);
 // Use the primary for reads participating in compare-and-swap writes.
 const db=env.DB.withSession?env.DB.withSession('first-primary'):env.DB;
 return {
  async get(code){const row=await db.prepare('SELECT data FROM rooms WHERE code = ?').bind(code).first();return row?JSON.parse(row.data):null;},
  async list(user){const result=await db.prepare('SELECT code, updated_at FROM rooms WHERE owner_user = ? ORDER BY updated_at DESC LIMIT 8').bind(user).all();return result.results;},
  async insert(room){const result=await db.prepare('INSERT OR IGNORE INTO rooms (code, owner_user, revision, data, updated_at) VALUES (?, ?, ?, ?, ?)').bind(room.code,room.host.user,room.revision,JSON.stringify(room),room.updatedAt).run();return result.meta.changes===1;},
  async replace(before,after){const result=await db.prepare('UPDATE rooms SET revision = ?, data = ?, updated_at = ? WHERE code = ? AND revision = ?').bind(after.revision,JSON.stringify(after),after.updatedAt,before.code,before.revision).run();return result.meta.changes===1;},
 };
}
