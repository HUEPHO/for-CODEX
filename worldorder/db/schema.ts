import {sqliteTable,text,integer,index} from 'drizzle-orm/sqlite-core';

export const rooms=sqliteTable('rooms',{
 code:text('code').primaryKey(),
 ownerUser:text('owner_user').notNull(),
 revision:integer('revision').notNull(),
 data:text('data').notNull(),
 updatedAt:integer('updated_at').notNull(),
},table=>[index('idx_rooms_owner_updated').on(table.ownerUser,table.updatedAt)]);
