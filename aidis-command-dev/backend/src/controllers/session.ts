import { Request, Response } from 'express';
import { SessionService } from '../services/session';

export class SessionController {
  /**
   * GET /sessions/:id - Get session details with contexts
   */
  static async getSessionDetail(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const session = await SessionService.getSessionDetail(id);

      if (!session) {
        res.status(404).json({
          success: false,
          error: 'Session not found'
        });
        return;
      }

      res.json({
        success: true,
        data: { session }
      });
    } catch (error) {
      console.error('Get session detail error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get session details'
      });
    }
  }
}
