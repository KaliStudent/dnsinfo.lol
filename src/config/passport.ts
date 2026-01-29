import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as TwitterStrategy } from 'passport-twitter';
import { Strategy as LocalStrategy } from 'passport-local';
import { UserModel, User } from '../models/User';
import { SubscriptionModel } from '../models/Subscription';
import { ReferralModel } from '../models/Referral';
import { ApiKeyModel } from '../models/ApiKey';

// Serialize user to session
passport.serializeUser((user: any, done) => {
  done(null, user.id);
});

// Deserialize user from session
passport.deserializeUser((id: string, done) => {
  try {
    const user = UserModel.findById(id);
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

// Helper to handle OAuth user creation/login
async function handleOAuthUser(
  profile: {
    id: string;
    provider: 'google' | 'twitter';
    email?: string;
    displayName?: string;
    photos?: { value: string }[];
  },
  referralCode?: string
): Promise<User> {
  const email = profile.email;
  const name = profile.displayName;
  const avatar = profile.photos?.[0]?.value;

  // Check if user exists with this OAuth ID
  let user = profile.provider === 'google'
    ? UserModel.findByGoogleId(profile.id)
    : UserModel.findByTwitterId(profile.id);

  if (user) {
    return user;
  }

  // Check if user exists with this email
  if (email) {
    user = UserModel.findByEmail(email);
    if (user) {
      // Link OAuth account to existing user
      if (profile.provider === 'google') {
        UserModel.linkGoogleAccount(user.id, profile.id);
      } else {
        UserModel.linkTwitterAccount(user.id, profile.id);
      }
      return UserModel.findById(user.id) as User;
    }
  }

  // Create new user
  let referredBy: string | undefined;
  if (referralCode) {
    const referrer = UserModel.findByReferralCode(referralCode);
    if (referrer) {
      referredBy = referrer.id;
    }
  }

  user = await UserModel.create({
    email: email || `${profile.provider}_${profile.id}@oauth.local`,
    name,
    avatar_url: avatar,
    google_id: profile.provider === 'google' ? profile.id : undefined,
    twitter_id: profile.provider === 'twitter' ? profile.id : undefined,
    referred_by: referredBy
  });

  // Create trial subscription
  SubscriptionModel.createTrial(user.id);

  // Create default API key
  ApiKeyModel.create(user.id, 'Default');

  // Track referral if applicable
  if (referredBy) {
    ReferralModel.trackSignup(referredBy, user.id);
  }

  return user;
}

// Configure Google OAuth Strategy
export function configureGoogleStrategy(): void {
  const clientID = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const callbackURL = `${process.env.APP_URL || 'http://localhost:3000'}/auth/google/callback`;

  if (!clientID || !clientSecret) {
    console.warn('Google OAuth not configured: missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET');
    return;
  }

  passport.use(new GoogleStrategy({
    clientID,
    clientSecret,
    callbackURL,
    passReqToCallback: true
  }, async (req, accessToken, refreshToken, profile, done) => {
    try {
      const referralCode = req.session?.referralCode;
      const user = await handleOAuthUser({
        id: profile.id,
        provider: 'google',
        email: profile.emails?.[0]?.value,
        displayName: profile.displayName,
        photos: profile.photos
      }, referralCode);

      // Clear referral code from session
      if (req.session) {
        delete req.session.referralCode;
      }

      done(null, user);
    } catch (error) {
      done(error as Error, undefined);
    }
  }));
}

// Configure Twitter OAuth Strategy
export function configureTwitterStrategy(): void {
  const consumerKey = process.env.TWITTER_CONSUMER_KEY;
  const consumerSecret = process.env.TWITTER_CONSUMER_SECRET;
  const callbackURL = `${process.env.APP_URL || 'http://localhost:3000'}/auth/twitter/callback`;

  if (!consumerKey || !consumerSecret) {
    console.warn('Twitter OAuth not configured: missing TWITTER_CONSUMER_KEY or TWITTER_CONSUMER_SECRET');
    return;
  }

  passport.use(new TwitterStrategy({
    consumerKey,
    consumerSecret,
    callbackURL,
    includeEmail: true,
    passReqToCallback: true
  }, async (req: any, token: string, tokenSecret: string, profile: any, done: any) => {
    try {
      const referralCode = req.session?.referralCode;
      const user = await handleOAuthUser({
        id: profile.id,
        provider: 'twitter',
        email: profile.emails?.[0]?.value,
        displayName: profile.displayName,
        photos: profile.photos
      }, referralCode);

      // Clear referral code from session
      if (req.session) {
        delete req.session.referralCode;
      }

      done(null, user);
    } catch (error) {
      done(error as Error, undefined);
    }
  }));
}

// Configure Local (email/password) Strategy
export function configureLocalStrategy(): void {
  passport.use(new LocalStrategy({
    usernameField: 'email',
    passwordField: 'password'
  }, async (email, password, done) => {
    try {
      const user = UserModel.findByEmail(email);

      if (!user) {
        return done(null, false, { message: 'Invalid email or password' });
      }

      if (!user.password_hash) {
        return done(null, false, {
          message: 'This account uses social login. Please sign in with Google or Twitter.'
        });
      }

      const isValid = await UserModel.verifyPassword(user, password);
      if (!isValid) {
        return done(null, false, { message: 'Invalid email or password' });
      }

      if (!user.email_verified) {
        return done(null, false, { message: 'Please verify your email before logging in' });
      }

      return done(null, user);
    } catch (error) {
      return done(error);
    }
  }));
}

// Initialize all strategies
export function initializePassport(): void {
  configureLocalStrategy();
  configureGoogleStrategy();
  configureTwitterStrategy();
}

export default passport;
