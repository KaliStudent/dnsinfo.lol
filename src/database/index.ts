import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// Database file location
const DATA_DIR = path.join(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'dnsintel.db');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initialize database connection
const db = new Database(DB_PATH);

// Enable foreign keys and WAL mode for better performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Initialize schema
function initializeSchema(): void {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf-8');

  // Execute schema statements
  db.exec(schema);

  console.log('Database schema initialized successfully');
}

// Run initialization
try {
  initializeSchema();
} catch (error) {
  console.error('Failed to initialize database:', error);
  process.exit(1);
}

export default db;
export { db, DB_PATH };
