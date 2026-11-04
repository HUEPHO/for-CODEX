// Separate development database; never connected to the production D1 binding.
import {DatabaseSync} from 'node:sqlite';
import {mkdir, readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
export async function developmentDatabase(root) {
 const directory=resolve(root,'.local');await mkdir(directory,{recursive:true});
 const sqlite=new DatabaseSync(resolve(directory,'rooms.sqlite'));
 sqlite.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS local_migrations (name TEXT PRIMARY KEY NOT NULL)');
 const journal=JSON.parse(await readFile(resolve(root,'drizzle/meta/_journal.json'),'utf8'));
 try{
  for(const {tag} of journal.entries){
   if(sqlite.prepare('SELECT name FROM local_migrations WHERE name=?').get(tag))continue;
   const sql=await readFile(resolve(root,'drizzle',tag+'.sql'),'utf8');sqlite.exec('BEGIN IMMEDIATE');
   try{sqlite.exec(sql);sqlite.prepare('INSERT INTO local_migrations (name) VALUES (?)').run(tag);sqlite.exec('COMMIT');}
   catch(error){sqlite.exec('ROLLBACK');throw error;}
  }
 }catch(error){sqlite.close();throw error;}
 const DB={prepare(sql){return {bind(...values){const statement=sqlite.prepare(sql);return {
  async first(){return statement.get(...values)??null;},
  async all(){return {results:statement.all(...values)};},
  async run(){return {meta:{changes:Number(statement.run(...values).changes)}};}
 };}};}};
 return {DB,close:()=>sqlite.close()};
}
