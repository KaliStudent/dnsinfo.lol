import db from '../database';
import { v4 as uuidv4 } from 'uuid';

export interface Subscription {
  id: string;
  user_id: string;
  stripe_subscription_id: string | null;
  plan: 'trial' | 'monthly' | 'quarterly';
  status: 'active' | 'cancelled' | 'expired' | 'past_due';
  current_period_start: string;
  current_period_end: string;
  cancel_at_period_end: number;
  created_at: string;
}

export interface Credit {
  id: string;
  user_id: string;
  months: number;
  reason: string;
  source_user_id: string | null;
  applied: number;
  created_at: string;
}

const TRIAL_DAYS = 30;

export const SubscriptionModel = {
  // Create a trial subscription for new users
  createTrial(userId: string): Subscription {
    const id = uuidv4();
    const now = new Date();
    const endDate = new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);

    const stmt = db.prepare(`
      INSERT INTO subscriptions (
        id, user_id, plan, status,
        current_period_start, current_period_end
      ) VALUES (?, ?, 'trial', 'active', ?, ?)
    `);

    stmt.run(id, userId, now.toISOString(), endDate.toISOString());

    return this.findById(id) as Subscription;
  },

  // Create a paid subscription
  create(
    userId: string,
    plan: 'monthly' | 'quarterly',
    stripeSubscriptionId: string,
    periodStart: Date,
    periodEnd: Date
  ): Subscription {
    const id = uuidv4();

    // Deactivate any existing subscriptions
    db.prepare(`
      UPDATE subscriptions
      SET status = 'cancelled'
      WHERE user_id = ? AND status IN ('active', 'past_due')
    `).run(userId);

    const stmt = db.prepare(`
      INSERT INTO subscriptions (
        id, user_id, stripe_subscription_id, plan, status,
        current_period_start, current_period_end
      ) VALUES (?, ?, ?, ?, 'active', ?, ?)
    `);

    stmt.run(
      id,
      userId,
      stripeSubscriptionId,
      plan,
      periodStart.toISOString(),
      periodEnd.toISOString()
    );

    return this.findById(id) as Subscription;
  },

  // Find subscription by ID
  findById(id: string): Subscription | null {
    const stmt = db.prepare('SELECT * FROM subscriptions WHERE id = ?');
    return stmt.get(id) as Subscription | null;
  },

  // Find by Stripe subscription ID
  findByStripeId(stripeSubscriptionId: string): Subscription | null {
    const stmt = db.prepare('SELECT * FROM subscriptions WHERE stripe_subscription_id = ?');
    return stmt.get(stripeSubscriptionId) as Subscription | null;
  },

  // Get active subscription for a user
  getActive(userId: string): Subscription | null {
    const stmt = db.prepare(`
      SELECT * FROM subscriptions
      WHERE user_id = ?
        AND status IN ('active', 'past_due')
        AND current_period_end > datetime('now')
      ORDER BY created_at DESC
      LIMIT 1
    `);
    return stmt.get(userId) as Subscription | null;
  },

  // Check if user has valid subscription (including trial)
  hasValidSubscription(userId: string): boolean {
    const subscription = this.getActive(userId);
    if (!subscription) return false;

    const now = new Date();
    const periodEnd = new Date(subscription.current_period_end);

    return periodEnd > now && subscription.status === 'active';
  },

  // Check if user is in trial period
  isInTrialPeriod(userId: string): boolean {
    const subscription = this.getActive(userId);
    if (!subscription) return false;

    return subscription.plan === 'trial' && subscription.status === 'active';
  },

  // Get days remaining in subscription/trial
  getDaysRemaining(userId: string): number {
    const subscription = this.getActive(userId);
    if (!subscription) return 0;

    const now = new Date();
    const periodEnd = new Date(subscription.current_period_end);
    const diff = periodEnd.getTime() - now.getTime();

    return Math.max(0, Math.ceil(diff / (24 * 60 * 60 * 1000)));
  },

  // Update subscription status
  updateStatus(id: string, status: Subscription['status']): void {
    db.prepare(`
      UPDATE subscriptions
      SET status = ?
      WHERE id = ?
    `).run(status, id);
  },

  // Update subscription period
  updatePeriod(id: string, periodStart: Date, periodEnd: Date): void {
    db.prepare(`
      UPDATE subscriptions
      SET current_period_start = ?, current_period_end = ?
      WHERE id = ?
    `).run(periodStart.toISOString(), periodEnd.toISOString(), id);
  },

  // Cancel subscription at period end
  cancelAtPeriodEnd(id: string): void {
    db.prepare(`
      UPDATE subscriptions
      SET cancel_at_period_end = 1
      WHERE id = ?
    `).run(id);
  },

  // Immediately cancel subscription
  cancel(id: string): void {
    db.prepare(`
      UPDATE subscriptions
      SET status = 'cancelled', cancel_at_period_end = 0
      WHERE id = ?
    `).run(id);
  },

  // Extend subscription by months (for credits)
  extend(userId: string, months: number): void {
    const subscription = this.getActive(userId);
    if (!subscription) return;

    const currentEnd = new Date(subscription.current_period_end);
    const newEnd = new Date(currentEnd.getTime() + months * 30 * 24 * 60 * 60 * 1000);

    db.prepare(`
      UPDATE subscriptions
      SET current_period_end = ?
      WHERE id = ?
    `).run(newEnd.toISOString(), subscription.id);
  },

  // Add credit to user
  addCredit(userId: string, months: number, reason: string, sourceUserId?: string): Credit {
    const id = uuidv4();

    db.prepare(`
      INSERT INTO credits (id, user_id, months, reason, source_user_id)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, userId, months, reason, sourceUserId || null);

    return db.prepare('SELECT * FROM credits WHERE id = ?').get(id) as Credit;
  },

  // Get unused credits for a user
  getUnusedCredits(userId: string): Credit[] {
    return db.prepare(`
      SELECT * FROM credits
      WHERE user_id = ? AND applied = 0
      ORDER BY created_at ASC
    `).all(userId) as Credit[];
  },

  // Get total unused credit months
  getTotalUnusedCredits(userId: string): number {
    const result = db.prepare(`
      SELECT COALESCE(SUM(months), 0) as total
      FROM credits
      WHERE user_id = ? AND applied = 0
    `).get(userId) as { total: number };

    return result.total;
  },

  // Apply a credit
  applyCredit(creditId: string): void {
    db.prepare('UPDATE credits SET applied = 1 WHERE id = ?').run(creditId);
  },

  // Apply credits to extend subscription
  applyCreditsToSubscription(userId: string): number {
    const credits = this.getUnusedCredits(userId);
    if (credits.length === 0) return 0;

    let totalMonths = 0;
    for (const credit of credits) {
      this.extend(userId, credit.months);
      this.applyCredit(credit.id);
      totalMonths += credit.months;
    }

    return totalMonths;
  },

  // Get subscription history for a user
  getHistory(userId: string): Subscription[] {
    return db.prepare(`
      SELECT * FROM subscriptions
      WHERE user_id = ?
      ORDER BY created_at DESC
    `).all(userId) as Subscription[];
  },

  // Check if user has ever had a paid subscription
  hasEverPaid(userId: string): boolean {
    const result = db.prepare(`
      SELECT COUNT(*) as count
      FROM subscriptions
      WHERE user_id = ? AND plan != 'trial'
    `).get(userId) as { count: number };

    return result.count > 0;
  },

  // Get total referral credits earned (applied + unapplied)
  getTotalReferralCredits(userId: string): number {
    const result = db.prepare(`
      SELECT COALESCE(SUM(months), 0) as total
      FROM credits
      WHERE user_id = ? AND reason = 'referral'
    `).get(userId) as { total: number };

    return result.total;
  },

  // Check if user can receive more referral credits (max 4 months)
  canReceiveReferralCredit(userId: string): boolean {
    const MAX_REFERRAL_CREDITS = 4;
    return this.getTotalReferralCredits(userId) < MAX_REFERRAL_CREDITS;
  },

  // Get remaining referral credit slots
  getRemainingReferralSlots(userId: string): number {
    const MAX_REFERRAL_CREDITS = 4;
    const earned = this.getTotalReferralCredits(userId);
    return Math.max(0, MAX_REFERRAL_CREDITS - earned);
  }
};

export default SubscriptionModel;
