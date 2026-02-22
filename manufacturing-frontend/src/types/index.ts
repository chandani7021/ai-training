// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export interface User {
  id: number;
  email: string;
  role: 'admin' | 'employee';
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  user: User;
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

export type DocumentStatus = 'uploaded' | 'processing' | 'training_ready' | 'failed';

export interface DocumentListItem {
  id: number;
  title: string;
  status: DocumentStatus;
  created_at: string;
  training_id: number | null;
  error_message: string | null;
  progress_message: string | null;
}

export interface DocumentOut extends DocumentListItem {
  s3_url: string;
  uploaded_by: number;
}

// ---------------------------------------------------------------------------
// Training JSON content types
// ---------------------------------------------------------------------------

export interface ContentParagraph {
  type: 'paragraph';
  text: string;
}

export interface ContentBulletList {
  type: 'bullet_list';
  items: string[];
}

export type ContentBlock = ContentParagraph | ContentBulletList;

export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  correct_index: number;
  explanation: string;
}

export interface Module {
  id: string;
  title: string;
  summary: string;
  content: ContentBlock[];
  quiz: {
    questions: QuizQuestion[];
  };
}

export interface ModulesJSON {
  modules: Module[];
}

// ---------------------------------------------------------------------------
// Training
// ---------------------------------------------------------------------------

export interface TrainingOut {
  id: number;
  doc_id: number;
  title: string;
  modules: ModulesJSON;
  created_at: string;
  assigned_user_ids: number[];
}

// ---------------------------------------------------------------------------
// Employee views
// ---------------------------------------------------------------------------

export interface EmployeeTrainingItem {
  training_id: number;
  title: string;
  assigned_at: string;
  completed: boolean;
  score: number | null;
}

export interface ProgressInfo {
  completed: boolean;
  score: number | null;
}

export interface EmployeeTrainingDetail {
  id: number;
  title: string;
  modules: ModulesJSON;
  progress: ProgressInfo;
}

// ---------------------------------------------------------------------------
// Quiz
// ---------------------------------------------------------------------------

export interface QuizAnswer {
  question_id: string;
  selected_index: number;
}

export interface QuizResult {
  score: number;
  passed: boolean;
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export interface EmployeeListItem {
  id: number;
  email: string;
}
