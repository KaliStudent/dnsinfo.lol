import { Request, Response, NextFunction } from 'express';
import { User } from '../models/User';

// Extend Express Request type to include user
declare global {
  namespace Express {
    interface User extends import('../models/User').User {}
  }
}

// Middleware to require authentication
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    res.status(401).json({
      error: 'Authentication required',
      message: 'Please log in to access this resource',
      loginUrl: '/login'
    });
    return;
  }

  next();
}

// Middleware to require email verification
export function requireVerifiedEmail(req: Request, res: Response, next: NextFunction): void {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    res.status(401).json({
      error: 'Authentication required',
      message: 'Please log in to access this resource',
      loginUrl: '/login'
    });
    return;
  }

  const user = req.user as User;
  if (!user.email_verified) {
    res.status(403).json({
      error: 'Email verification required',
      message: 'Please verify your email address to access this resource'
    });
    return;
  }

  next();
}

// Optional auth - populates req.user if logged in, continues otherwise
export function optionalAuth(req: Request, res: Response, next: NextFunction): void {
  // Passport already handles this, just continue
  next();
}

export default requireAuth;
