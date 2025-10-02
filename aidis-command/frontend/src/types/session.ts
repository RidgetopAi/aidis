import type { SessionEntity } from '../api/generated';

export interface Session extends SessionEntity {
  project_name?: string;
  session_type?: string;
  context_count?: number;
  last_context_at?: string;
  input_tokens?: number;     // TS006-2: Input tokens consumed
  output_tokens?: number;    // TS006-2: Output tokens generated
  total_tokens?: number;     // TS006-2: Total tokens (input + output)
  tasks_created?: number;    // TS007-2: Tasks created in session
  tasks_updated?: number;    // TS007-2: Tasks updated in session
  tasks_completed?: number;  // TS007-2: Tasks completed in session
  contexts_created?: number; // TS007-2: Contexts created (tracked)
}

export interface SessionDetail extends Session {
  contexts?: Array<{
    id: string;
    type: string;
    content: string;
    created_at: string;
    tags?: string[];
  }>;
  duration?: number;
  metadata?: Record<string, unknown>;
}

export interface UpdateSessionRequest {
  title?: string;
  description?: string;
}
