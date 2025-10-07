/**
 * Background Services Orchestrator
 * Manages lifecycle of all background services
 */

import { logger } from '../utils/logger.js';
import { getQueueManager, shutdownQueue } from './queueManager.js';
import { startGitTracking, stopGitTracking } from './gitTracker.js';
import { startPatternDetection, stopPatternDetection } from './patternDetector.js';

// Check if background services should be skipped (for testing)
const SKIP_BACKGROUND_SERVICES = process.env.AIDIS_SKIP_BACKGROUND === 'true';

/**
 * Background Services Orchestrator
 * Manages lifecycle of all background services
 */
export class BackgroundServices {
  private servicesStarted: boolean = false;

  /**
   * Start all background services
   */
  async startAll(): Promise<void> {
    if (SKIP_BACKGROUND_SERVICES) {
      console.log('🧪 Skipping background services (AIDIS_SKIP_BACKGROUND=true)');
      return;
    }

    logger.info('Starting background services...');

    try {
      // Initialize BullMQ queue system (replaces timer-based polling)
      console.log('🚀 Starting BullMQ queue system...');
      try {
        await getQueueManager();
        console.log('✅ Queue system initialized successfully');
      } catch (error) {
        console.warn('⚠️  Failed to initialize queue system:', error);
        console.warn('   Background services will be disabled');
      }

      // Initialize real-time git tracking (file watching only)
      console.log('⚡ Starting real-time git tracking...');
      try {
        await startGitTracking({
          enableFileWatching: true,
          enablePeriodicPolling: false, // Disabled: polling moved to queue
          pollingIntervalMs: 30000, // Still used by queue system
          correlationDelayMs: 5000   // 5 seconds delay after detection
        });
        console.log('✅ Git tracking initialized successfully');
      } catch (error) {
        console.warn('⚠️  Failed to initialize git tracking:', error);
        console.warn('   Git correlation will be manual only');
      }

      // Initialize pattern detection service
      console.log('🔍 Starting pattern detection service...');
      try {
        await startPatternDetection({
          enableRealTimeDetection: true,
          enableBatchProcessing: true,
          detectionTimeoutMs: 100, // Sub-100ms target
          patternUpdateIntervalMs: 5000 // 5 seconds
        });
        console.log('✅ Pattern detection service initialized successfully');
      } catch (error) {
        console.warn('⚠️  Failed to initialize pattern detection:', error);
        console.warn('   Pattern detection will be manual only');
      }

      // Initialize session timeout service (2-hour inactivity timeout)
      console.log('⏱️  Starting session timeout service...');
      try {
        const { SessionTimeoutService } = await import('./sessionTimeout.js');
        SessionTimeoutService.start();
        console.log('✅ Session timeout service initialized successfully');
      } catch (error) {
        console.warn('⚠️  Failed to initialize session timeout service:', error);
        console.warn('   Session timeouts will not be automatic');
      }

      this.servicesStarted = true;
      logger.info('✅ All background services started');

    } catch (error) {
      logger.error('Error starting background services:', error as Error);
      throw error;
    }
  }

  /**
   * Stop all background services
   */
  async stopAll(): Promise<void> {
    if (SKIP_BACKGROUND_SERVICES || !this.servicesStarted) {
      return;
    }

    logger.info('Stopping background services...');

    try {
      // Stop queue system first (it manages background jobs)
      console.log('🚀 Stopping queue system...');
      try {
        await shutdownQueue();
        console.log('✅ Queue system stopped gracefully');
      } catch (error) {
        console.warn('⚠️  Failed to stop queue system:', error);
      }

      // Stop git tracking
      console.log('⚡ Stopping git tracking...');
      try {
        await stopGitTracking();
        console.log('✅ Git tracking stopped gracefully');
      } catch (error) {
        console.warn('⚠️  Failed to stop git tracking:', error);
      }

      // Stop pattern detection service
      console.log('🔍 Stopping pattern detection service...');
      try {
        await stopPatternDetection();
        console.log('✅ Pattern detection service stopped gracefully');
      } catch (error) {
        console.warn('⚠️  Failed to stop pattern detection:', error);
      }

      // Stop session timeout service
      console.log('⏱️  Stopping session timeout service...');
      try {
        const { SessionTimeoutService } = await import('./sessionTimeout.js');
        SessionTimeoutService.stop();
        console.log('✅ Session timeout service stopped gracefully');
      } catch (error) {
        console.warn('⚠️  Failed to stop session timeout service:', error);
      }

      this.servicesStarted = false;
      logger.info('✅ All background services stopped');

    } catch (error) {
      logger.error('Error stopping background services:', error as Error);
    }
  }
}

export const backgroundServices = new BackgroundServices();
