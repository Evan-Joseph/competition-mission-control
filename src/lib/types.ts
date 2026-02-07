export type NextDeadline = {
  key: "registration_end" | "submission_end" | "result_end";
  label: string;
  dateISO: string;
  daysLeft: number;
};

export type Member = {
  id: string;
  name: string;
  avatar_emoji?: string | null;
  avatar_color?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type Competition = {
  id: string;
  name: string;
  variant: string;
  display_name: string;
  source_tag?: string | null;
  type_tags_json: string;
  offline_defense?: string | null;
  schedule_basis_year?: string | null;
  evidence_links_json: string;
  notes?: string | null;

  registration_start?: string | null;
  registration_end?: string | null;
  submission_start?: string | null;
  submission_end?: string | null;
  result_start?: string | null;
  result_end?: string | null;

  registration_text?: string | null;
  submission_text?: string | null;
  result_text?: string | null;

  progress_state?: string | null;
  progress_state_detail?: string | null;
  progress_award?: string | null;
  progress_owner_member_id?: string | null;
  progress_risk_level?: number | null;
  progress_notes?: string | null;
  progress_updated_at?: string | null;

  nextDeadline?: NextDeadline | null;
};

