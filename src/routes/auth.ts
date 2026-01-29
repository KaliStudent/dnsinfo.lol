import { Router, Request, Response, NextFunction } from 'express';
import passport from 'passport';
import { UserModel, User } from '../models/User';
import { SubscriptionModel } from '../models/Subscription';
import { ApiKeyModel } from '../models/ApiKey';
import { ReferralModel } from '../models/Referral';
import { requireAuth } from '../middleware/requireAuth';

const router = Router();

// Extend session type
declare module 'express-session' {
  interface SessionData {
    referralCode?: string;
  }
}

// Store referral code before OAuth redirect
router.get('/set-referral', (req: Request, res: Response) => {
  const { code } = req.query;
  if (code && typeof code === 'string') {
    req.session.referralCode = code.toUpperCase();
  }
  res.json({ success: true });
});

// ============ Google OAuth ============

router.get('/google', (req: Request, res: Response, next: NextFunction) => {
  // Store referral code if provided
  if (req.query.ref) {
    req.session.referralCode = (req.query.ref as string).toUpperCase();
  }

  passport.authenticate('google', {
    scope: ['profile', 'email']
  })(req, res, next);
});

router.get('/google/callback',
  passport.authenticate('google', {
    failureRedirect: '/login?error=google_failed'
  }),
  (req: Request, res: Response) => {
    res.redirect('/dashboard');
  }
);

// ============ Twitter OAuth ============

router.get('/twitter', (req: Request, res: Response, next: NextFunction) => {
  // Store referral code if provided
  if (req.query.ref) {
    req.session.referralCode = (req.query.ref as string).toUpperCase();
  }

  passport.authenticate('twitter')(req, res, next);
});

router.get('/twitter/callback',
  passport.authenticate('twitter', {
    failureRedirect: '/login?error=twitter_failed'
  }),
  (req: Request, res: Response) => {
    res.redirect('/dashboard');
  }
);

// ============ Email/Password Auth ============

// Register
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { email, password, name, referralCode } = req.body;

    // Validation
    if (!email || !password) {
      res.status(400).json({
        error: 'Missing required fields',
        message: 'Email and password are required'
      });
      return;
    }

    if (password.length < 8) {
      res.status(400).json({
        error: 'Weak password',
        message: 'Password must be at least 8 characters long'
      });
      return;
    }

    // Check if user already exists
    const existing = UserModel.findByEmail(email);
    if (existing) {
      res.status(409).json({
        error: 'Email in use',
        message: 'An account with this email already exists'
      });
      return;
    }

    // Find referrer
    let referredBy: string | undefined;
    if (referralCode) {
      const referrer = UserModel.findByReferralCode(referralCode);
      if (referrer) {
        referredBy = referrer.id;
      }
    }

    // Create user
    const user = await UserModel.create({
      email,
      password,
      name,
      referred_by: referredBy
    });

    // Create trial subscription
    SubscriptionModel.createTrial(user.id);

    // Create default API key
    const { fullKey } = ApiKeyModel.create(user.id, 'Default');

    // Track referral
    if (referredBy) {
      ReferralModel.trackSignup(referredBy, user.id);
    }

    // Log the user in
    req.login(user, (err) => {
      if (err) {
        res.status(500).json({
          error: 'Login failed',
          message: 'Account created but login failed. Please try logging in.'
        });
        return;
      }

      res.status(201).json({
        success: true,
        message: 'Account created successfully',
        user: UserModel.getPublicProfile(user),
        apiKey: fullKey,
        verificationRequired: !user.email_verified
      });
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      error: 'Registration failed',
      message: 'An error occurred during registration'
    });
  }
});

// Login
router.post('/login', (req: Request, res: Response, next: NextFunction) => {
  passport.authenticate('local', (err: Error, user: User, info: { message: string }) => {
    if (err) {
      return res.status(500).json({
        error: 'Login failed',
        message: 'An error occurred during login'
      });
    }

    if (!user) {
      return res.status(401).json({
        error: 'Login failed',
        message: info?.message || 'Invalid credentials'
      });
    }

    req.login(user, (loginErr) => {
      if (loginErr) {
        return res.status(500).json({
          error: 'Login failed',
          message: 'Session creation failed'
        });
      }

      return res.json({
        success: true,
        user: UserModel.getPublicProfile(user)
      });
    });
  })(req, res, next);
});

// Logout
router.post('/logout', (req: Request, res: Response) => {
  req.logout((err) => {
    if (err) {
      res.status(500).json({
        error: 'Logout failed',
        message: 'An error occurred during logout'
      });
      return;
    }

    req.session.destroy((destroyErr) => {
      if (destroyErr) {
        console.error('Session destroy error:', destroyErr);
      }
      res.json({ success: true });
    });
  });
});

// Get current user
router.get('/me', requireAuth, (req: Request, res: Response) => {
  const user = req.user as User;
  const subscription = SubscriptionModel.getActive(user.id);
  const apiKeys = ApiKeyModel.listByUser(user.id);
  const referralStats = ReferralModel.getStats(user.id);
  const credits = SubscriptionModel.getTotalUnusedCredits(user.id);

  res.json({
    user: {
      ...UserModel.getPublicProfile(user),
      email: user.email,
      email_verified: !!user.email_verified,
      has_google: !!user.google_id,
      has_twitter: !!user.twitter_id,
      stripe_customer_id: user.stripe_customer_id
    },
    subscription: subscription ? {
      plan: subscription.plan,
      status: subscription.status,
      current_period_end: subscription.current_period_end,
      cancel_at_period_end: !!subscription.cancel_at_period_end,
      days_remaining: SubscriptionModel.getDaysRemaining(user.id),
      is_trial: subscription.plan === 'trial'
    } : null,
    apiKeys: apiKeys.map(k => ({
      id: k.id,
      name: k.name,
      key_prefix: k.key_prefix,
      is_active: !!k.is_active,
      created_at: k.created_at,
      last_used_at: k.last_used_at
    })),
    referral: {
      code: user.referral_code,
      stats: referralStats
    },
    credits
  });
});

// Verify email
router.get('/verify/:token', (req: Request, res: Response) => {
  const { token } = req.params;
  const user = UserModel.verifyEmail(token);

  if (!user) {
    res.redirect('/login?error=invalid_token');
    return;
  }

  // Log the user in
  req.login(user, (err) => {
    if (err) {
      res.redirect('/login?verified=true');
      return;
    }
    res.redirect('/dashboard?verified=true');
  });
});

// ============ API Key Management ============

// Create new API key
router.post('/api-keys', requireAuth, (req: Request, res: Response) => {
  const user = req.user as User;
  const { name } = req.body;

  // Limit to 5 API keys per user
  const count = ApiKeyModel.countActiveByUser(user.id);
  if (count >= 5) {
    res.status(400).json({
      error: 'Limit reached',
      message: 'Maximum of 5 API keys allowed per account'
    });
    return;
  }

  const { apiKey, fullKey } = ApiKeyModel.create(user.id, name || 'API Key');

  res.status(201).json({
    success: true,
    apiKey: {
      id: apiKey.id,
      name: apiKey.name,
      key_prefix: apiKey.key_prefix,
      key: fullKey, // Only returned on creation
      created_at: apiKey.created_at
    },
    message: 'Save this API key now - it won\'t be shown again!'
  });
});

// Revoke API key
router.delete('/api-keys/:id', requireAuth, (req: Request, res: Response) => {
  const user = req.user as User;
  const { id } = req.params;

  const success = ApiKeyModel.revoke(id, user.id);

  if (!success) {
    res.status(404).json({
      error: 'Not found',
      message: 'API key not found or already revoked'
    });
    return;
  }

  res.json({ success: true });
});

// Rename API key
router.patch('/api-keys/:id', requireAuth, (req: Request, res: Response) => {
  const user = req.user as User;
  const { id } = req.params;
  const { name } = req.body;

  if (!name || typeof name !== 'string') {
    res.status(400).json({
      error: 'Invalid name',
      message: 'Name is required'
    });
    return;
  }

  const success = ApiKeyModel.rename(id, user.id, name);

  if (!success) {
    res.status(404).json({
      error: 'Not found',
      message: 'API key not found'
    });
    return;
  }

  res.json({ success: true });
});

export default router;
