export type CompetitionLink = {
  title: string;
  url: string;
};

export type Competition = {
  id: string;
  name: string;
  registration_deadline_at: string; // YYYY-MM-DD
  submission_deadline_at: string | null; // YYYY-MM-DD
  result_deadline_at: string | null; // YYYY-MM-DD
  included_in_plan: boolean;
  registered: boolean;
  status_text: string;
  team_members: string[];
  links: CompetitionLink[];
};

export type CompetitionPatch = Partial<
  Pick<
    Competition,
    | "registration_deadline_at"
    | "submission_deadline_at"
    | "result_deadline_at"
    | "included_in_plan"
    | "registered"
    | "status_text"
    | "team_members"
    | "links"
  >
>;

export type CompetitionEventType = "registration_deadline" | "submission_deadline" | "result_deadline";

export type CompetitionEvent = {
  event_id: string;
  competition_id: string;
  type: CompetitionEventType;
  date: string; // YYYY-MM-DD
};

export type AuditAction = "create" | "update" | "delete" | "upload" | "comment";

export type AuditLogEntry = {
  id: string;
  iso: string; // ISO timestamp (UTC, from server)
  timestamp?: string; // Optional pre-formatted local timestamp (offline fallback)
  user: string;
  action: AuditAction;
  target_type: "competition" | "system";
  target_id?: string | null;
  target: string;
  details: string;
};

export type AIAction = {
  id: string;
  type: "update_competition";
  title: string;
  competition_id: string;
  patch: CompetitionPatch;
  reason?: string;
};

export type AIReply = {
  content: string;
  actions: AIAction[];
};

export type WhiteboardItemType = "note" | "image" | "text";

export type WhiteboardItem = {
  id: string;
  type: WhiteboardItemType;
  x: number;
  y: number;
  content: string;
  color?: string;
  rotation?: number;
  author?: string;
  updated_at?: number;
  deleted?: boolean;
};

export type WhiteboardDoc = {
  competition_id: string;
  items: WhiteboardItem[];
  version: number;
  updated_at: string | null;
};
