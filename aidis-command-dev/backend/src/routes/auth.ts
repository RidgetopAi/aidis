import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { AuthService } from '../services/auth';
import { authenticateToken, requireAdmin } from '../middleware/auth';
import { LoginRequest, RegisterRequest, AuthenticatedRequest } from '../types/auth';

const router = Router();

// Rate limiting for auth endpoints - Production-safe with admin considerations
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'development' ? 100 : 30, // Increased for testing
  message: {
    error: 'Too many authentication attempts',
    message: 'Rate limit exceeded. Please wait before trying again. If you are a legitimate admin user experiencing issues, check your credentials and try again after the cooldown period.',
    retryAfter: Math.ceil(15 * 60) // 15 minutes in seconds
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Remove custom keyGenerator to use default IPv6-safe implementation
  // Enhanced rate limit handler with better logging
  handler: (req: any, res: any) => {
    console.warn('Authentication rate limit reached:', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      timestamp: new Date().toISOString(),
      path: req.path,
      method: req.method
    });
    res.status(429).json({ 
      error: 'Too many authentication attempts. Please try again later.' 
    });
  }
});

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes  
  max: 200, // Increased from 100 to 200 for better admin experience
  message: {
    error: 'Too many requests',
    message: 'Please try again later. Rate limit exceeded.',
    retryAfter: Math.ceil(15 * 60 / 1000)
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Validation helper
const validateLoginRequest = (body: any): body is LoginRequest => {
  return body && 
         typeof body.username === 'string' && 
         typeof body.password === 'string' &&
         body.username.trim().length > 0 && 
         body.password.length > 0;
};

const validateRegisterRequest = (body: any): body is RegisterRequest => {
  return body && 
         typeof body.username === 'string' && 
         typeof body.email === 'string' && 
         typeof body.password === 'string' &&
         body.username.trim().length >= 3 && 
         body.email.includes('@') &&
         body.password.length >= 6;
};

// POST /api/auth/login
router.post('/login', authLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!validateLoginRequest(req.body)) {
      res.status(400).json({
        error: 'Invalid request',
        message: 'Username and password are required'
      });
      return;
    }

    const { username, password } = req.body;
    const result = await AuthService.login({ username, password });

    if (!result) {
      res.status(401).json({
        error: 'Authentication failed',
        message: 'Invalid username or password'
      });
      return;
    }

    res.json({
      user: result.user,
      token: result.token,
      expires: result.expiresAt.toISOString()
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      error: 'Server error',
      message: 'An error occurred during login'
    });
  }
});

// POST /api/auth/logout
router.post('/logout', generalLimiter, authenticateToken, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (req.tokenId) {
      await AuthService.logout(req.tokenId);
    }

    res.json({
      success: true,
      message: 'Logout successful'
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      error: 'Server error',
      message: 'An error occurred during logout'
    });
  }
});

// GET /api/auth/profile
router.get('/profile', generalLimiter, authenticateToken, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        error: 'User not found',
        message: 'Please log in again'
      });
      return;
    }

    const { password_hash, ...userProfile } = req.user as any;
    
    res.json({
      success: true,
      data: { user: userProfile }
    });
  } catch (error) {
    console.error('Profile error:', error);
    res.status(500).json({
      error: 'Server error',
      message: 'Could not retrieve user profile'
    });
  }
});

// POST /api/auth/refresh
router.post('/refresh', generalLimiter, authenticateToken, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.tokenId) {
      res.status(401).json({
        error: 'Invalid token',
        message: 'Token ID not found'
      });
      return;
    }

    const result = await AuthService.refreshToken(req.tokenId);

    if (!result) {
      res.status(401).json({
        error: 'Refresh failed',
        message: 'Unable to refresh token'
      });
      return;
    }

    res.json({
      success: true,
      message: 'Token refreshed successfully',
      data: {
        token: result.token,
        expires_at: result.expiresAt.toISOString()
      }
    });
  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(500).json({
      error: 'Server error',
      message: 'An error occurred during token refresh'
    });
  }
});

// POST /api/auth/register (Admin only)
router.post('/register', authLimiter, authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!validateRegisterRequest(req.body)) {
      res.status(400).json({
        error: 'Invalid request',
        message: 'Username (3+ chars), valid email, and password (6+ chars) are required'
      });
      return;
    }

    const { username, email, password, role } = req.body;

    // Check if user already exists
    const existingUser = await AuthService.findUserByUsername(username);
    if (existingUser) {
      res.status(409).json({
        error: 'User exists',
        message: 'Username already taken'
      });
      return;
    }

    const newUser = await AuthService.createUser({ username, email, password, role: role || 'admin' });
    
    const { password_hash, ...userResponse } = newUser as any;
    
    res.status(201).json({
      success: true,
      message: 'User created successfully',
      data: { user: userResponse }
    });
  } catch (error: any) {
    console.error('Registration error:', error);
    
    if (error.code === '23505') { // PostgreSQL unique violation
      res.status(409).json({
        error: 'Duplicate entry',
        message: 'Username or email already exists'
      });
      return;
    }

    res.status(500).json({
      error: 'Server error',
      message: 'An error occurred during registration'
    });
  }
});

export default router;
