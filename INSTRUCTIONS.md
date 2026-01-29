# DNS Intel - Implementation Instructions

**Project:** dnsinfo.lol
**Purpose:** This file documents all implementation decisions and changes for session recovery.

---

## ARCHITECTURE OVERVIEW

DNS Intel is a SaaS API platform for DNS intelligence:
- **Backend:** TypeScript + Express.js + SQLite (better-sqlite3)
- **Auth:** Passport.js (Google OAuth, Twitter/X OAuth, Local email/password)
- **Payments:** Stripe subscriptions
- **Frontend:** Static HTML/CSS/JS

---

## SUBSCRIPTION MODEL

### Pricing Structure (FINAL)
| Plan | Price | Per Month | Savings | Stripe Price ID Env Var |
|------|-------|-----------|---------|-------------------------|
| Monthly | $5/month | $5 | - | `STRIPE_PRICE_MONTHLY` |
| Quarterly | $12/3 months | $4 | 20% | `STRIPE_PRICE_QUARTERLY` |

### Free Tier
- 3 API requests per 24 hours (IP-based fingerprinting)
- No account required

### Trial
- 30 days free with full access
- Requires account (email or OAuth)
- No credit card required

---

## LOYALTY/REFERRAL SYSTEM

### How It Works
1. **Every subscribed user** gets a unique 8-character referral code
2. User shares code with friends/colleagues
3. When someone signs up using the code AND subscribes to a paid plan:
   - Referrer gets **1 month free** (equivalent to 50% off one month)
4. **Stacking:** User can accumulate up to 4 free months from referrals
   - This equals 4 quarterly subs at 50% off = 1 full year at 50% off
   - Credits are applied to extend subscription period

### Implementation Details
- Referral code stored in `users.referral_code` (auto-generated on signup)
- Tracking in `referral_conversions` table
- Credits stored in `credits` table
- Credits applied via `SubscriptionModel.applyCreditsToSubscription()`

### Stacking Logic
```
Max discount: 4 months free (1 year of quarterly = 4 quarters, 50% off = 2 quarters worth = ~4 months)
Each referral = 1 month credit
Credits extend subscription end date by 30 days per month
```

---

## FILE CHANGES LOG

### /public/docs.html
**Change:** Replace with Coming Soon page
**Reason:** API documentation not ready yet

### /public/pricing.html
**Change:** Update prices from $6/$15/$7.50 to $5/$12
**Details:**
- Monthly: $5/month
- Quarterly: $12/3 months ($4/mo, save 20%)
- Remove the "50% off" tier (was promotional)

### /src/services/stripe.ts
**Change:** Update PLANS object with new pricing
```typescript
PLANS = {
  monthly: { price: 5, ... },
  quarterly: { price: 12, pricePerMonth: 4, ... }
}
```

### /src/routes/billing.ts
**Change:** Update /plans endpoint response with new pricing

### /src/models/Subscription.ts
**Change:** May need to add max credit cap logic (4 months max from referrals)

### /src/models/Referral.ts
**Change:** Already has referral tracking - may need to add cap check

---

## STRIPE SETUP NOTES

To complete the Stripe integration, create products in Stripe Dashboard:
1. Create product "DNS Intel Monthly" with price $5/month recurring
2. Create product "DNS Intel Quarterly" with price $12/3 months recurring
3. Copy price IDs to .env file:
   - `STRIPE_PRICE_MONTHLY=price_xxxxx`
   - `STRIPE_PRICE_QUARTERLY=price_xxxxx`

---

## AUTHENTICATION FLOW

### Login Page (/login)
- Shows Google OAuth button
- Shows X (Twitter) OAuth button
- Shows email/password form with toggle for signup
- Referral code field shown on signup
- Plan parameter passed through to dashboard for checkout

### OAuth Flow
1. User clicks OAuth button
2. Redirects to provider (Google/X)
3. Provider redirects back to `/auth/google/callback` or `/auth/twitter/callback`
4. Session created, user redirected to /dashboard
5. If plan param present, auto-trigger checkout

---

## TESTING CHECKLIST

After changes, verify:
- [ ] /docs shows Coming Soon page
- [ ] /pricing shows $5/month and $12/quarter
- [ ] Login page OAuth buttons work
- [ ] Email signup creates account with trial
- [ ] Referral code field captures code on signup
- [ ] Dashboard shows user's referral code
- [ ] Checkout creates proper Stripe subscription
- [ ] Referral conversion gives credit to referrer
- [ ] Credits extend subscription correctly

---

## ENVIRONMENT VARIABLES NEEDED

```env
PORT=3000
APP_URL=https://dnsinfo.lol
NODE_ENV=production
SESSION_SECRET=<random-string>

# Google OAuth
GOOGLE_CLIENT_ID=<from-google-console>
GOOGLE_CLIENT_SECRET=<from-google-console>

# Twitter/X OAuth
TWITTER_CONSUMER_KEY=<from-twitter-dev>
TWITTER_CONSUMER_SECRET=<from-twitter-dev>

# Stripe
STRIPE_SECRET_KEY=sk_live_xxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxx
STRIPE_PRICE_MONTHLY=price_xxxxx
STRIPE_PRICE_QUARTERLY=price_xxxxx
```

---

## QUICK RECOVERY STEPS

If you're resuming after a disconnect:

1. Read `WHEREAMI.md` to see current status
2. Read this file for implementation details
3. Check which tasks are marked PENDING vs COMPLETED
4. Continue from where left off
5. Update WHEREAMI.md as you complete tasks
