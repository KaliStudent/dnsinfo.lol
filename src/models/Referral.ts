import db from '../database';
import { v4 as uuidv4 } from 'uuid';
import { SubscriptionModel } from './Subscription';

export interface ReferralConversion {
  id: string;
  referrer_id: string;
  referred_id: string;
  converted_at: string | null;
  credit_given: number;
  created_at: string;
}

export interface ReferralStats {
  totalSignups: number;
  totalConversions: number;
  totalCreditsEarned: number;
  pendingConversions: number;
}

export const ReferralModel = {
  // Track a signup with referral code
  trackSignup(referrerId: string, referredId: string): ReferralConversion {
    const id = uuidv4();

    const stmt = db.prepare(`
      INSERT INTO referral_conversions (id, referrer_id, referred_id)
      VALUES (?, ?, ?)
    `);

    stmt.run(id, referrerId, referredId);

    return db.prepare('SELECT * FROM referral_conversions WHERE id = ?')
      .get(id) as ReferralConversion;
  },

  // Track when a referred user makes their first payment
  trackConversion(referredId: string): boolean {
    // Find the referral record
    const referral = db.prepare(`
      SELECT * FROM referral_conversions
      WHERE referred_id = ? AND converted_at IS NULL
    `).get(referredId) as ReferralConversion | null;

    if (!referral) return false;

    // Check if the referrer is on a paid plan (free months don't count)
    const referrerHasPaidPlan = SubscriptionModel.hasEverPaid(referral.referrer_id);

    // Update conversion
    db.prepare(`
      UPDATE referral_conversions
      SET converted_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(referral.id);

    return true;
  },

  // Give credit to referrer when conditions are met
  giveCredit(referredId: string): boolean {
    // Find the referral
    const referral = db.prepare(`
      SELECT * FROM referral_conversions
      WHERE referred_id = ? AND converted_at IS NOT NULL AND credit_given = 0
    `).get(referredId) as ReferralConversion | null;

    if (!referral) return false;

    // Check if referrer is currently on a paid plan (not free months)
    const referrerSubscription = SubscriptionModel.getActive(referral.referrer_id);
    if (!referrerSubscription) return false;

    // Only give credit if referrer has an active paid subscription
    // Free months don't count towards earning more free months
    if (referrerSubscription.plan === 'trial') return false;

    // Check if referrer can still receive referral credits (max 4)
    if (!SubscriptionModel.canReceiveReferralCredit(referral.referrer_id)) {
      // Mark as given but don't add credit - they've hit the max
      db.prepare(`
        UPDATE referral_conversions
        SET credit_given = 1
        WHERE id = ?
      `).run(referral.id);
      return false;
    }

    // Give 1 month credit to the referrer
    SubscriptionModel.addCredit(
      referral.referrer_id,
      1,
      'referral',
      referral.referred_id
    );

    // Mark credit as given
    db.prepare(`
      UPDATE referral_conversions
      SET credit_given = 1
      WHERE id = ?
    `).run(referral.id);

    return true;
  },

  // Get referral by referrer and referred IDs
  findByUsers(referrerId: string, referredId: string): ReferralConversion | null {
    return db.prepare(`
      SELECT * FROM referral_conversions
      WHERE referrer_id = ? AND referred_id = ?
    `).get(referrerId, referredId) as ReferralConversion | null;
  },

  // Get all referrals made by a user
  getByReferrer(referrerId: string): ReferralConversion[] {
    return db.prepare(`
      SELECT * FROM referral_conversions
      WHERE referrer_id = ?
      ORDER BY created_at DESC
    `).all(referrerId) as ReferralConversion[];
  },

  // Get referral stats for a user
  getStats(userId: string): ReferralStats {
    const totalSignups = db.prepare(`
      SELECT COUNT(*) as count
      FROM referral_conversions
      WHERE referrer_id = ?
    `).get(userId) as { count: number };

    const totalConversions = db.prepare(`
      SELECT COUNT(*) as count
      FROM referral_conversions
      WHERE referrer_id = ? AND converted_at IS NOT NULL
    `).get(userId) as { count: number };

    const totalCreditsEarned = db.prepare(`
      SELECT COUNT(*) as count
      FROM referral_conversions
      WHERE referrer_id = ? AND credit_given = 1
    `).get(userId) as { count: number };

    const pendingConversions = db.prepare(`
      SELECT COUNT(*) as count
      FROM referral_conversions
      WHERE referrer_id = ? AND converted_at IS NULL
    `).get(userId) as { count: number };

    return {
      totalSignups: totalSignups.count,
      totalConversions: totalConversions.count,
      totalCreditsEarned: totalCreditsEarned.count,
      pendingConversions: pendingConversions.count
    };
  },

  // Check if a user was referred
  wasReferred(userId: string): ReferralConversion | null {
    return db.prepare(`
      SELECT * FROM referral_conversions
      WHERE referred_id = ?
    `).get(userId) as ReferralConversion | null;
  },

  // Get pending credits (conversions where credit hasn't been given yet)
  getPendingCredits(referrerId: string): ReferralConversion[] {
    return db.prepare(`
      SELECT * FROM referral_conversions
      WHERE referrer_id = ?
        AND converted_at IS NOT NULL
        AND credit_given = 0
      ORDER BY converted_at ASC
    `).all(referrerId) as ReferralConversion[];
  },

  // Process all pending credits for a user (called when they get a paid subscription)
  processAllPendingCredits(referrerId: string): number {
    const pending = this.getPendingCredits(referrerId);
    let creditsGiven = 0;

    for (const referral of pending) {
      // Check if user can still receive credits (max 4)
      if (!SubscriptionModel.canReceiveReferralCredit(referrerId)) {
        // Mark remaining as given but don't add credit - hit the max
        db.prepare(`
          UPDATE referral_conversions
          SET credit_given = 1
          WHERE id = ?
        `).run(referral.id);
        continue;
      }

      // Give credit
      SubscriptionModel.addCredit(
        referral.referrer_id,
        1,
        'referral',
        referral.referred_id
      );

      // Mark as credited
      db.prepare(`
        UPDATE referral_conversions
        SET credit_given = 1
        WHERE id = ?
      `).run(referral.id);

      creditsGiven++;
    }

    return creditsGiven;
  }
};

export default ReferralModel;
