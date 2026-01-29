import Stripe from 'stripe';
import { UserModel, User } from '../models/User';

// Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '');

// Price IDs from Stripe Dashboard
export const PRICE_IDS = {
  monthly: process.env.STRIPE_PRICE_MONTHLY || '',
  quarterly: process.env.STRIPE_PRICE_QUARTERLY || ''
};

// Plan details
export const PLANS = {
  monthly: {
    name: 'Monthly',
    price: 5,
    interval: 'month' as const,
    priceId: PRICE_IDS.monthly
  },
  quarterly: {
    name: 'Quarterly',
    price: 12,
    pricePerMonth: 4,
    savings: '20%',
    interval: '3 months' as const,
    priceId: PRICE_IDS.quarterly
  }
};

export const StripeService = {
  // Create or get Stripe customer
  async getOrCreateCustomer(user: User): Promise<string> {
    // Return existing customer ID
    if (user.stripe_customer_id) {
      return user.stripe_customer_id;
    }

    // Create new customer
    const customer = await stripe.customers.create({
      email: user.email,
      name: user.name || undefined,
      metadata: {
        user_id: user.id,
        referral_code: user.referral_code
      }
    });

    // Save to user
    UserModel.updateStripeCustomerId(user.id, customer.id);

    return customer.id;
  },

  // Create checkout session
  async createCheckoutSession(
    user: User,
    plan: 'monthly' | 'quarterly',
    successUrl: string,
    cancelUrl: string
  ): Promise<string> {
    const customerId = await this.getOrCreateCustomer(user);
    const planDetails = PLANS[plan];

    if (!planDetails.priceId) {
      throw new Error(`Price ID not configured for plan: ${plan}`);
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{
        price: planDetails.priceId,
        quantity: 1
      }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        user_id: user.id,
        plan: plan
      },
      subscription_data: {
        metadata: {
          user_id: user.id,
          plan: plan
        }
      },
      allow_promotion_codes: true
    });

    return session.url || '';
  },

  // Create customer portal session
  async createPortalSession(user: User, returnUrl: string): Promise<string> {
    if (!user.stripe_customer_id) {
      throw new Error('User has no Stripe customer ID');
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripe_customer_id,
      return_url: returnUrl
    });

    return session.url;
  },

  // Get subscription details
  async getSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
    return stripe.subscriptions.retrieve(subscriptionId);
  },

  // Cancel subscription at period end
  async cancelSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
    return stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true
    });
  },

  // Resume subscription (undo cancel)
  async resumeSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
    return stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: false
    });
  },

  // Construct webhook event
  constructWebhookEvent(
    payload: string | Buffer,
    signature: string
  ): Stripe.Event {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';
    return stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  },

  // Get customer by ID
  async getCustomer(customerId: string): Promise<Stripe.Customer | null> {
    try {
      const customer = await stripe.customers.retrieve(customerId);
      if (customer.deleted) return null;
      return customer as Stripe.Customer;
    } catch {
      return null;
    }
  },

  // List customer's invoices
  async listInvoices(customerId: string, limit: number = 10): Promise<Stripe.Invoice[]> {
    const invoices = await stripe.invoices.list({
      customer: customerId,
      limit
    });
    return invoices.data;
  }
};

export default StripeService;
