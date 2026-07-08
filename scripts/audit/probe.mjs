import { signIn, sql, PROJECT_REF } from './lib.mjs';
console.log('PROJECT_REF:', PROJECT_REF);
const { jwt, user } = await signIn();
console.log('JWT len:', jwt.length, '| user:', user.email, '| id:', user.id);
const rows = await sql("select current_database() as db, now()::date as today");
console.log('MGMT SQL ok:', JSON.stringify(rows));
