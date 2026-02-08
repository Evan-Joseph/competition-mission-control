export type Status = 'planning' | 'registered' | 'submitted' | 'reviewing' | 'ended' | 'missed';

export interface User {
  id: string;
  name: string;
  avatar: string;
  role: 'admin' | 'member' | 'viewer';
}

export interface FileItem {
  id: string;
  name: string;
  type: 'pdf' | 'image' | 'doc' | 'code' | 'zip';
  size: string;
  uploaded_by: User;
  uploaded_at: string;
}

export interface Competition {
  id: string;
  name: string;
  type: string;
  registration_deadline_at: string;
  submission_deadline_at: string | null;
  result_deadline_at: string | null;
  included_in_plan: boolean;
  registered: boolean;
  status_text: string;
  team_members: User[];
  tags: string[];
}

export interface LogEntry {
  id: string;
  timestamp: string;
  user: User;
  action: 'create' | 'update' | 'delete' | 'upload' | 'comment';
  target: string;
  details: string;
}

export interface WhiteboardItem {
  id: string;
  type: 'note' | 'image' | 'text' | 'shape';
  content: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  color?: string;
  author: User;
  rotation?: number;
}
