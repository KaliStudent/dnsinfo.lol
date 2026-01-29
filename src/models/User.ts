import db from '../database';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcrypt';
import crypto from 'crypto';

export interface User {
  id: string;
  email: string;
  password_hash: string | null;
  name: string | null;
  avatar_url: string | null;
  google_id: string | null;
  twitter_id: string | null;
  referral_code: string;
  referred_by: string | null;
  email_verified: number;
  verification_token: string | null;
  stripe_customer_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateUserData {
  email: string;
  password?: string;
  name?: string;
  avatar_url?: string;
  google_id?: string;
  twitter_id?: string;
  referred_by?: string;
}

const SALT_ROUNDS = 12;

// Generate a unique referral code (8 characters, alphanumeric)
function generateReferralCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Exclude confusing chars
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Generate a unique referral code that doesn't exist in DB
function getUniqueReferralCode(): string {
  let code: string;
  let attempts = 0;
  const maxAttempts = 10;

  do {
    code = generateReferralCode();
    const existing = db.prepare('SELECT id FROM users WHERE referral_code = ?').get(code);
    if (!existing) break;
    attempts++;
  } while (attempts < maxAttempts);

  if (attempts >= maxAttempts) {
    // Fallback to UUID-based code
    code = crypto.randomBytes(4).toString('hex').toUpperCase();
  }

  return code;
}

export const UserModel = {
  // Create a new user
  async create(data: CreateUserData): Promise<User> {
    const id = uuidv4();
    const referral_code = getUniqueReferralCode();
    const verification_token = uuidv4();

    let password_hash: string | null = null;
    if (data.password) {
      password_hash = await bcrypt.hash(data.password, SALT_ROUNDS);
    }

    const stmt = db.prepare(`
      INSERT INTO users (
        id, email, password_hash, name, avatar_url,
        google_id, twitter_id, referral_code, referred_by,
        email_verified, verification_token
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      data.email.toLowerCase(),
      password_hash,
      data.name || null,
      data.avatar_url || null,
      data.google_id || null,
      data.twitter_id || null,
      referral_code,
      data.referred_by || null,
      data.google_id || data.twitter_id ? 1 : 0, // OAuth users are auto-verified
      data.google_id || data.twitter_id ? null : verification_token
    );

    return this.findById(id) as User;
  },

  // Find user by ID
  findById(id: string): User | null {
    const stmt = db.prepare('SELECT * FROM users WHERE id = ?');
    return stmt.get(id) as User | null;
  },

  // Find user by email
  findByEmail(email: string): User | null {
    const stmt = db.prepare('SELECT * FROM users WHERE email = ?');
    return stmt.get(email.toLowerCase()) as User | null;
  },

  // Find user by Google ID
  findByGoogleId(googleId: string): User | null {
    const stmt = db.prepare('SELECT * FROM users WHERE google_id = ?');
    return stmt.get(googleId) as User | null;
  },

  // Find user by Twitter ID
  findByTwitterId(twitterId: string): User | null {
    const stmt = db.prepare('SELECT * FROM users WHERE twitter_id = ?');
    return stmt.get(twitterId) as User | null;
  },

  // Find user by referral code
  findByReferralCode(code: string): User | null {
    const stmt = db.prepare('SELECT * FROM users WHERE referral_code = ?');
    return stmt.get(code.toUpperCase()) as User | null;
  },

  // Verify password
  async verifyPassword(user: User, password: string): Promise<boolean> {
    if (!user.password_hash) return false;
    return bcrypt.compare(password, user.password_hash);
  },

  // Verify email
  verifyEmail(token: string): User | null {
    const user = db.prepare('SELECT * FROM users WHERE verification_token = ?').get(token) as User | null;
    if (!user) return null;

    db.prepare(`
      UPDATE users
      SET email_verified = 1, verification_token = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(user.id);

    return this.findById(user.id);
  },

  // Update Stripe customer ID
  updateStripeCustomerId(userId: string, stripeCustomerId: string): void {
    db.prepare(`
      UPDATE users
      SET stripe_customer_id = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(stripeCustomerId, userId);
  },

  // Update user profile
  update(userId: string, data: Partial<Pick<User, 'name' | 'avatar_url' | 'email'>>): User | null {
    const updates: string[] = [];
    const values: any[] = [];

    if (data.name !== undefined) {
      updates.push('name = ?');
      values.push(data.name);
    }
    if (data.avatar_url !== undefined) {
      updates.push('avatar_url = ?');
      values.push(data.avatar_url);
    }
    if (data.email !== undefined) {
      updates.push('email = ?');
      values.push(data.email.toLowerCase());
    }

    if (updates.length === 0) return this.findById(userId);

    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(userId);

    db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    return this.findById(userId);
  },

  // Link Google account to existing user
  linkGoogleAccount(userId: string, googleId: string): void {
    db.prepare(`
      UPDATE users
      SET google_id = ?, email_verified = 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(googleId, userId);
  },

  // Link Twitter account to existing user
  linkTwitterAccount(userId: string, twitterId: string): void {
    db.prepare(`
      UPDATE users
      SET twitter_id = ?, email_verified = 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(twitterId, userId);
  },

  // Update password
  async updatePassword(userId: string, newPassword: string): Promise<void> {
    const password_hash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    db.prepare(`
      UPDATE users
      SET password_hash = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(password_hash, userId);
  },

  // Get user's public profile (safe to expose)
  getPublicProfile(user: User) {
    return {
      id: user.id,
      name: user.name,
      avatar_url: user.avatar_url,
      referral_code: user.referral_code,
      created_at: user.created_at
    };
  }
};

export default UserModel;
