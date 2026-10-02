import { migrate } from "../db/migrate.js";
import { pool } from "../db/connection.js";
import { backfillPersistentMedia } from "../services/mediaStorageService.js";

async function main() {
  try {await migrate();console.log(JSON.stringify(await backfillPersistentMedia()));}
  finally {await pool.end();}
}
void main().catch(error=>{console.error(error instanceof Error?error.message:"Falha ao copiar mídias.");process.exitCode=1;});
