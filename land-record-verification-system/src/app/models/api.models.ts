export interface Role {
  role_id: number;
  role_name: string;
  description: string;
}

export interface User {
  user_id: number;
  full_name: string;
  email: string;
  phone_number: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  role: number;
}

export interface CurrentUser {
  user_id: number;
  full_name: string;
  email: string;
  phone_number: string;
  role_id: number;
  role_name: string;
  is_active: boolean;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  access: string;
  refresh: string;
  user: CurrentUser;
}

export interface SignupRequest {
  full_name: string;
  email: string;
  phone_number: string;
  password: string;
  role_id: number;
  otp_code: string;
}

export interface OtpRequest {
  email: string;
  purpose: 'Signup';
}

export interface VerifyOtpRequest {
  email: string;
  otp_code: string;
  purpose: 'Signup';
}

export interface WorkflowType {
  workflow_type_id: number;
  workflow_name: string;
  description: string;
  is_active: boolean;
}

export interface ApplicationStatus {
  status_id: number;
  status_name: string;
  description: string;
}

export interface Application {
  application_id: number;
  application_code: string;
  submitted_at: string;
  reviewed_at: string | null;
  remarks: string | null;
  created_at: string;
  updated_at: string;
  user: number;
  workflow_type: number;
  status: number;
  reviewed_by: number | null;
}

export interface CreateApplicationRequest {
  user: number;
  workflow_type: number;
  status: number;
  application_code: string;
  remarks?: string;
}

export interface LandDetail {
  land_detail_id: number;
  property_location: string;
  land_size: string;
  parcel_number: string;
  plot_number: string;
  site_plan_number: string;
  instrument_type: string;
  instrument_date: string | null;
  land_description: string;
  is_already_registered: boolean;
  is_disputed: boolean;
  created_at: string;
  updated_at: string;
  application: number;
}

export interface CreateLandDetailRequest {
  application: number;
  property_location: string;
  land_size: string;
  parcel_number: string;
  plot_number: string;
  site_plan_number: string;
  instrument_type: string;
  instrument_date: string | null;
  land_description: string;
  is_already_registered?: boolean;
  is_disputed?: boolean;
}

export interface ApplicationParty {
  party_id: number;
  party_name: string;
  party_role: string;
  contact_details: string;
  address: string;
  created_at: string;
  application: number;
}

export interface CreateApplicationPartyRequest {
  application: number;
  party_name: string;
  party_role: string;
  contact_details: string;
  address: string;
}

export interface DocumentCategory {
  document_category_id: number;
  category_name: string;
  description: string;
}

export interface DocumentRecord {
  document_id: number;
  document_name: string;
  file_path?: string;
  file_url?: string;
  upload_date: string;
  verification_status: string;
  admin_remark: string | null;
  application: number;
  application_id?: number;
  document_category: number;
  document_category_id?: number;
  uploaded_by: number;
}

export interface CreateDocumentRequest {
  application: number;
  document_category: number;
  uploaded_by: number;
  document_name: string;
  file_path: string;
  verification_status: string;
}

export interface Payment {
  payment_id: number;
  amount: string;
  payment_status: string;
  payment_reference: string;
  payment_date: string;
  payment_method: string;
  application: number;
}

export interface CreatePaymentRequest {
  application: number;
  amount: string | number;
  payment_status: string;
  payment_reference?: string;
  payment_method: string;
}

export interface ReviewApplicationRequest {
  admin_id: number;
  new_status_id: number;
  comment: string;
}

export interface Notification {
  notification_id: number;
  notification_type: string;
  notification_title: string;
  message: string;
  is_read: boolean;
  created_at: string;
  user: number;
  application: number | null;
  land_detail: number | null;
}

export interface ReviewLog {
  review_log_id: number;
  comment: string;
  review_date: string;
  application: number;
  reviewed_by: number;
  old_status: number;
  new_status: number;
}

export interface VerificationLog {
  verification_log_id: number;
  search_term: string;
  result_summary: string;
  checked_at: string;
  user: number;
  land_detail: number;
}

export interface AuditLog {
  audit_log_id: number;
  action_type: string;
  action_description: string;
  created_at: string;
  application: number | null;
  user: number;
}

export interface DisputeFlag {
  dispute_flag_id: number;
  flag_reason: string;
  flag_status: string;
  flagged_at: string;
  resolved_at: string | null;
  land_detail: number;
  flagged_by: number;
}

export interface CreateDisputeFlagRequest {
  flag_reason: string;
  flag_status?: string;
  flagged_at?: string;
  resolved_at?: string | null;
  land_detail: number;
  flagged_by: number;
}
