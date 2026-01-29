import { Router, Request, Response } from 'express';
import { StripeService, PLANS } from '../services/stripe';
import { SubscriptionModel } from '../models/Subscription';
import { UserModel, User } from '../models/User';
import { ReferralModel } from '../models/Referral';
import { requireAuth } from '../middleware/requireAuth';
import Stripe from 'stripe';

const router = Router();

// Get pricing info (public)
router.get('/plans', (req: Request, res: Response) => {
  res.json({
    plans: {
      monthly: {
        name: 'Monthly',
        price: 5,
        priceDisplay: '$5/month',
        features: [
          'Unlimited API requests',
          'All DNS record types',
          'Global propagation checks',
          'Zone health analysis',
          'Subdomain enumeration',
          'WHOIS lookups',
          'Email support',
          'Cancel anytime'
        ]
      },
      quarterly: {
        name: 'Quarterly',
        price: 12,
        pricePerMonth: 4,
        priceDisplay: '$12/quarter ($4/mo)',
        savings: '20%',
        badge: 'Best Value',
        features: [
          'Everything in Monthly',
          'Save $3 per quarter',
          'Priority support'
        ]
      }
    },
    trial: {
      days: 30,
      features: [
        'Full API access',
        'No credit card required',
        'All features included'
      ]
    },
    referral: {
      reward: '1 free month (50% off)',
      maxStackable: 4,
      conditions: 'When your referral subscribes to a paid plan',
      maxBenefit: 'Up to 4 quarterly subs at 50% off (1 full year)'
    }
  });
});

// Get current subscription (authenticated)
router.get('/subscription', requireAuth, (req: Request, res: Response) => {
  const user = req.user as User;
  const subscription = SubscriptionModel.getActive(user.id);
  const credits = SubscriptionModel.getTotalUnusedCredits(user.id);
  const daysRemaining = SubscriptionModel.getDaysRemaining(user.id);

  if (!subscription) {
    res.json({
      subscription: null,
      credits,
      message: 'No active subscription'
    });
    return;
  }

  res.json({
    subscription: {
      id: subscription.id,
      plan: subscription.plan,
      status: subscription.status,
      current_period_start: subscription.current_period_start,
      current_period_end: subscription.current_period_end,
      cancel_at_period_end: !!subscription.cancel_at_period_end,
      days_remaining: daysRemaining,
      is_trial: subscription.plan === 'trial'
    },
    credits
  });
});

// Create checkout session
router.post('/checkout', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user as User;
    const { plan } = req.body;

    // Validate plan
    if (!plan || !['monthly', 'quarterly'].includes(plan)) {
      res.status(400).json({
        error: 'Invalid plan',
        message: 'Please select a valid plan: monthly or quarterly'
      });
      return;
    }

    const appUrl = process.env.APP_URL || 'http://localhost:3000';
    const successUrl = `${appUrl}/dashboard?checkout=success`;
    const cancelUrl = `${appUrl}/pricing?checkout=cancelled`;

    const checkoutUrl = await StripeService.createCheckoutSession(
      user,
      plan as 'monthly' | 'quarterly',
      successUrl,
      cancelUrl
    );

    res.json({
      success: true,
      url: checkoutUrl
    });
  } catch (error) {
    console.error('Checkout error:', error);
    res.status(500).json({
      error: 'Checkout failed',
      message: 'Unable to create checkout session'
    });
  }
});

// Create customer portal session
router.post('/portal', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user as User;

    if (!user.stripe_customer_id) {
      res.status(400).json({
        error: 'No billing history',
        message: 'You need an active subscription to access billing portal'
      });
      return;
    }

    const appUrl = process.env.APP_URL || 'http://localhost:3000';
    const returnUrl = `${appUrl}/dashboard`;

    const portalUrl = await StripeService.createPortalSession(user, returnUrl);

    res.json({
      success: true,
      url: portalUrl
    });
  } catch (error) {
    console.error('Portal error:', error);
    res.status(500).json({
      error: 'Portal access failed',
      message: 'Unable to access billing portal'
    });
  }
});

// Stripe webhook handler
router.post('/webhook', async (req: Request, res: Response) => {
  const signature = req.headers['stripe-signature'] as string;

  if (!signature) {
    res.status(400).json({ error: 'Missing signature' });
    return;
  }

  let event: Stripe.Event;

  try {
    event = StripeService.constructWebhookEvent(req.body, signature);
  } catch (error) {
    console.error('Webhook signature verification failed:', error);
    res.status(400).json({ error: 'Invalid signature' });
    return;
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutComplete(session);
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionUpdate(subscription);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionDeleted(subscription);
        break;
      }

      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice;
        await handleInvoicePaid(invoice);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        await handlePaymentFailed(invoice);
        break;
      }

      default:
        console.log(`Unhandled webhook event: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Webhook handler error:', error);
    res.status(500).json({ error: 'Webhook handler failed' });
  }
});

// Webhook handlers

async function handleCheckoutComplete(session: Stripe.Checkout.Session): Promise<void> {
  const userId = session.metadata?.user_id;
  const plan = session.metadata?.plan as 'monthly' | 'quarterly' | 'quarterly_50';

  if (!userId || !plan) {
    console.error('Missing metadata in checkout session');
    return;
  }

  const user = UserModel.findById(userId);
  if (!user) {
    console.error('User not found:', userId);
    return;
  }

  // Track referral conversion if this is their first payment
  if (!SubscriptionModel.hasEverPaid(userId)) {
    const referral = ReferralModel.wasReferred(userId);
    if (referral) {
      ReferralModel.trackConversion(userId);
      // Credit will be given once referrer has a paid subscription
      ReferralModel.giveCredit(userId);
    }
  }

  console.log(`Checkout completed for user ${userId}, plan: ${plan}`);
}

async function handleSubscriptionUpdate(subscription: Stripe.Subscription): Promise<void> {
  const userId = subscription.metadata?.user_id;
  const plan = subscription.metadata?.plan as 'monthly' | 'quarterly' | 'quarterly_50' || 'monthly';

  if (!userId) {
    console.error('Missing user_id in subscription metadata');
    return;
  }

  // Map plan to our internal format
  const internalPlan: 'monthly' | 'quarterly' =
    plan.startsWith('quarterly') ? 'quarterly' : 'monthly';

  const periodStart = new Date(subscription.current_period_start * 1000);
  const periodEnd = new Date(subscription.current_period_end * 1000);

  // Check if subscription exists
  const existing = SubscriptionModel.findByStripeId(subscription.id);

  if (existing) {
    // Update existing subscription
    SubscriptionModel.updatePeriod(existing.id, periodStart, periodEnd);

    // Map Stripe status to our status
    let status: 'active' | 'cancelled' | 'expired' | 'past_due' = 'active';
    if (subscription.status === 'past_due') status = 'past_due';
    if (subscription.status === 'canceled') status = 'cancelled';
    if (subscription.status === 'unpaid') status = 'expired';

    SubscriptionModel.updateStatus(existing.id, status);

    if (subscription.cancel_at_period_end) {
      SubscriptionModel.cancelAtPeriodEnd(existing.id);
    }
  } else {
    // Create new subscription record
    SubscriptionModel.create(
      userId,
      internalPlan,
      subscription.id,
      periodStart,
      periodEnd
    );

    // Process any pending referral credits now that user has a paid subscription
    ReferralModel.processAllPendingCredits(userId);
  }

  console.log(`Subscription updated for user ${userId}: ${subscription.status}`);
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription): Promise<void> {
  const existing = SubscriptionModel.findByStripeId(subscription.id);

  if (existing) {
    SubscriptionModel.cancel(existing.id);
    console.log(`Subscription cancelled: ${subscription.id}`);
  }
}

async function handleInvoicePaid(invoice: Stripe.Invoice): Promise<void> {
  const customerId = invoice.customer as string;

  // Find user by Stripe customer ID
  // This is a simple approach - in production you might want a dedicated lookup
  console.log(`Invoice paid for customer: ${customerId}`);

  // Referral credit is handled in checkout.session.completed
}

async function handlePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
  const customerId = invoice.customer as string;
  console.log(`Payment failed for customer: ${customerId}`);

  // Could send notification email here
}

// Apply credits to subscription
router.post('/apply-credits', requireAuth, (req: Request, res: Response) => {
  const user = req.user as User;

  const subscription = SubscriptionModel.getActive(user.id);
  if (!subscription) {
    res.status(400).json({
      error: 'No subscription',
      message: 'You need an active subscription to apply credits'
    });
    return;
  }

  const monthsApplied = SubscriptionModel.applyCreditsToSubscription(user.id);

  if (monthsApplied === 0) {
    res.json({
      success: true,
      message: 'No credits to apply',
      monthsApplied: 0
    });
    return;
  }

  res.json({
    success: true,
    message: `Applied ${monthsApplied} month(s) to your subscription`,
    monthsApplied,
    newPeriodEnd: SubscriptionModel.getActive(user.id)?.current_period_end
  });
});

export default router;
