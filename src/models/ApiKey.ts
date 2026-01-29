import db from '../database';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';

export interface ApiKey {
  id: string;
  user_id: string;
  key_hash: string;
  key_prefix: string;
  name: string;
  is_active: number;
  created_at: string;
  last_used_at: string | null;
}

// Generate a secure API key
function generateApiKey(): string {
  // Format: di_<32 random hex chars> = 35 chars total
  const randomPart = crypto.randomBytes(16).toString('hex');
  return `di_${randomPart}`;
}

// Hash an API key for storage
function hashApiKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

export const ApiKeyModel = {
  // Create a new API key - returns the full key (only time it's visible)
  create(userId: string, name: string = 'Default'): { apiKey: ApiKey; fullKey: string } {
    const id = uuidv4();
    const fullKey = generateApiKey();
    const key_hash = hashApiKey(fullKey);
    const key_prefix = fullKey.substring(0, 10) + '...'; // di_abc123...

    const stmt = db.prepare(`
      INSERT INTO api_keys (id, user_id, key_hash, key_prefix, name)
      VALUES (?, ?, ?, ?, ?)
    `);

    stmt.run(id, userId, key_hash, key_prefix, name);

    const apiKey = this.findById(id) as ApiKey;
    return { apiKey, fullKey };
  },

  // Find API key by ID
  findById(id: string): ApiKey | null {
    const stmt = db.prepare('SELECT * FROM api_keys WHERE id = ?');
    return stmt.get(id) as ApiKey | null;
  },

  // Validate an API key and return the associated key record
  validate(key: string): ApiKey | null {
    if (!key || !key.startsWith('di_')) return null;

    const key_hash = hashApiKey(key);
    const stmt = db.prepare('SELECT * FROM api_keys WHERE key_hash = ? AND is_active = 1');
    const apiKey = stmt.get(key_hash) as ApiKey | null;

    if (apiKey) {
      // Update last used timestamp
      db.prepare('UPDATE api_keys SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(apiKey.id);
    }

    return apiKey;
  },

  // Get user ID from API key
  getUserIdFromKey(key: string): string | null {
    const apiKey = this.validate(key);
    return apiKey ? apiKey.user_id : null;
  },

  // List all API keys for a user
  listByUser(userId: string): ApiKey[] {
    const stmt = db.prepare('SELECT * FROM api_keys WHERE user_id = ? ORDER BY created_at DESC');
    return stmt.all(userId) as ApiKey[];
  },

  // Revoke (deactivate) an API key
  revoke(id: string, userId: string): boolean {
    const result = db.prepare(`
      UPDATE api_keys
      SET is_active = 0
      WHERE id = ? AND user_id = ?
    `).run(id, userId);

    return result.changes > 0;
  },

  // Delete an API key permanently
  delete(id: string, userId: string): boolean {
    const result = db.prepare('DELETE FROM api_keys WHERE id = ? AND user_id = ?')
      .run(id, userId);

    return result.changes > 0;
  },

  // Rename an API key
  rename(id: string, userId: string, name: string): boolean {
    const result = db.prepare(`
      UPDATE api_keys
      SET name = ?
      WHERE id = ? AND user_id = ?
    `).run(name, id, userId);

    return result.changes > 0;
  },

  // Reactivate an API key
  reactivate(id: string, userId: string): boolean {
    const result = db.prepare(`
      UPDATE api_keys
      SET is_active = 1
      WHERE id = ? AND user_id = ?
    `).run(id, userId);

    return result.changes > 0;
  },

  // Count active API keys for a user
  countActiveByUser(userId: string): number {
    const result = db.prepare(
      'SELECT COUNT(*) as count FROM api_keys WHERE user_id = ? AND is_active = 1'
    ).get(userId) as { count: number };

    return result.count;
  },

  // Validate and get full key info including user
  validateWithUser(key: string): { apiKey: ApiKey; userId: string } | null {
    const apiKey = this.validate(key);
    if (!apiKey) return null;

    return { apiKey, userId: apiKey.user_id };
  }
};

export default ApiKeyModel;
