export interface Room {
  id: string;
  room_id: string;
  owner_id: string;
  name: string;
  language: string;
  code: string;
  is_private: boolean;
  members: string[];
  created_at: string;
}

export interface Message {
  id: string;
  room_id: string;
  user_id: string;
  sender_name: string;
  message: string;
  created_at: string;
}

export interface CodeHistoryEntry {
  id: string;
  room_id: string;
  user_id: string;
  user_name: string;
  code: string;
  created_at: string;
}

export interface Profile {
  id: string;
  email: string;
  displayName: string;
}

export interface RunResult {
  run?: {
    stdout: string;
    stderr: string;
    code: number | null;
    signal: string | null;
    output: string;
  };
  compile?: {
    stdout: string;
    stderr: string;
    code: number | null;
    signal: string | null;
    output: string;
  };
  language?: string;
  version?: string;
  error?: string;
  details?: string;
}
