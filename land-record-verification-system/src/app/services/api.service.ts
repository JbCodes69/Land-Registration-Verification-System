import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import {
  Application,
  ApplicationParty,
  ApplicationStatus,
  AuditLog,
  CreateApplicationPartyRequest,
  CreateApplicationRequest,
  CreateDocumentRequest,
  CreateLandDetailRequest,
  CreatePaymentRequest,
  DisputeFlag,
  CreateDisputeFlagRequest,
  DocumentCategory,
  DocumentRecord,
  LandDetail,
  LoginRequest,
  OtpRequest,
  Notification,
  Payment,
  ReviewApplicationRequest,
  ReviewLog,
  Role,
  SignupRequest,
  User,
  VerifyOtpRequest,
  VerificationPaymentRequired,
  VerificationReport,
  VerificationSearchRecord,
  VerificationLog,
  WorkflowType,
} from '../models/api.models';

@Injectable({
  providedIn: 'root',
})
export class ApiService {
  private readonly baseUrl = 'https://land-registration-backend.onrender.com/api';

  constructor(private http: HttpClient) {}

  getRoles(): Observable<Role[]> {
    return this.http.get<Role[]>(`${this.baseUrl}/roles/`);
  }

  login(data: LoginRequest): Observable<unknown> {
    return this.http.post<unknown>(`${this.baseUrl}/auth/login/`, data);
  }

  requestOtp(data: OtpRequest): Observable<unknown> {
    return this.http.post<unknown>(`${this.baseUrl}/auth/request-otp/`, data);
  }

  verifyOtp(data: VerifyOtpRequest): Observable<unknown> {
    return this.http.post<unknown>(`${this.baseUrl}/auth/verify-otp/`, data);
  }

  signup(data: SignupRequest): Observable<unknown> {
    return this.http.post<unknown>(`${this.baseUrl}/auth/signup/`, data);
  }

  getCurrentUserFromApi(userId: number): Observable<unknown> {
    return this.http.get<unknown>(`${this.baseUrl}/auth/me/${userId}/`);
  }

  getUsers(): Observable<User[]> {
    return this.http.get<User[]>(`${this.baseUrl}/users/`);
  }

  getWorkflowTypes(): Observable<WorkflowType[]> {
    return this.http.get<WorkflowType[]>(`${this.baseUrl}/workflow-types/`);
  }

  getApplicationStatuses(): Observable<ApplicationStatus[]> {
    return this.http.get<ApplicationStatus[]>(`${this.baseUrl}/application-statuses/`);
  }

  getApplications(): Observable<Application[]> {
    return this.http.get<Application[]>(`${this.baseUrl}/applications/`);
  }

  getApplication(id: number): Observable<Application> {
    return this.http.get<Application>(`${this.baseUrl}/applications/${id}/`);
  }

  createApplication(data: CreateApplicationRequest): Observable<Application> {
    return this.http.post<Application>(`${this.baseUrl}/applications/`, data);
  }

  updateApplication(id: number, data: Partial<CreateApplicationRequest>): Observable<Application> {
    return this.http.patch<Application>(`${this.baseUrl}/applications/${id}/`, data);
  }

  reviewApplication(id: number, data: ReviewApplicationRequest): Observable<Application> {
    return this.http.post<Application>(`${this.baseUrl}/applications/${id}/review/`, data);
  }

  completeApplication(id: number): Observable<Application> {
    return this.http.post<Application>(`${this.baseUrl}/applications/${id}/complete/`, {});
  }

  getLandDetails(): Observable<LandDetail[]> {
    return this.http.get<LandDetail[]>(`${this.baseUrl}/land-details/`);
  }

  createLandDetails(data: CreateLandDetailRequest): Observable<LandDetail> {
    return this.http.post<LandDetail>(`${this.baseUrl}/land-details/`, data);
  }

  updateLandDetails(id: number, data: Partial<CreateLandDetailRequest>): Observable<LandDetail> {
    return this.http.patch<LandDetail>(`${this.baseUrl}/land-details/${id}/`, data);
  }

  getVerificationSearchRecords(searchTerm: string = ''): Observable<VerificationSearchRecord[]> {
    const params = searchTerm.trim()
      ? { search: searchTerm.trim() }
      : undefined;
    return this.http.get<VerificationSearchRecord[]>(
      `${this.baseUrl}/land-details/verification-search/`,
      { params }
    );
  }

  getVerificationReport(
    landDetailId: number,
    searchTerm: string = '',
    verificationLogId: number | null = null
  ): Observable<VerificationReport | VerificationPaymentRequired> {
    const params: Record<string, string> = {};
    if (searchTerm.trim()) {
      params['search'] = searchTerm.trim();
    }
    if (verificationLogId) {
      params['verificationLogId'] = String(verificationLogId);
    }

    return this.http.get<VerificationReport | VerificationPaymentRequired>(
      `${this.baseUrl}/land-details/${landDetailId}/verification-report/`,
      { params: Object.keys(params).length ? params : undefined }
    );
  }

  getApplicationParties(): Observable<ApplicationParty[]> {
    return this.http.get<ApplicationParty[]>(`${this.baseUrl}/application-parties/`);
  }

  createApplicationParty(data: CreateApplicationPartyRequest): Observable<ApplicationParty> {
    return this.http.post<ApplicationParty>(`${this.baseUrl}/application-parties/`, data);
  }

  updateApplicationParty(id: number, data: Partial<CreateApplicationPartyRequest>): Observable<ApplicationParty> {
    return this.http.patch<ApplicationParty>(`${this.baseUrl}/application-parties/${id}/`, data);
  }

  getDocumentCategories(): Observable<DocumentCategory[]> {
    return this.http.get<DocumentCategory[]>(`${this.baseUrl}/document-categories/`);
  }

  getDocuments(): Observable<DocumentRecord[]> {
    return this.http.get<DocumentRecord[]>(`${this.baseUrl}/documents/`);
  }

  createDocument(data: CreateDocumentRequest): Observable<DocumentRecord> {
    return this.http.post<DocumentRecord>(`${this.baseUrl}/documents/`, data);
  }

  uploadDocument(data: FormData): Observable<DocumentRecord> {
    return this.http.post<DocumentRecord>(`${this.baseUrl}/documents/`, data);
  }

  getPayments(): Observable<Payment[]> {
    return this.http.get<Payment[]>(`${this.baseUrl}/payments/`);
  }

  createPayment(data: CreatePaymentRequest): Observable<Payment> {
    return this.http.post<Payment>(`${this.baseUrl}/payments/`, data);
  }

  getNotifications(): Observable<Notification[]> {
    return this.http.get<Notification[]>(`${this.baseUrl}/notifications/`);
  }

  getDisputeFlags(): Observable<DisputeFlag[]> {
    return this.http.get<DisputeFlag[]>(`${this.baseUrl}/dispute-flags/`);
  }

  createDisputeFlag(data: CreateDisputeFlagRequest): Observable<DisputeFlag> {
    return this.http.post<DisputeFlag>(`${this.baseUrl}/dispute-flags/`, data);
  }

  updateDisputeFlag(id: number, data: Partial<CreateDisputeFlagRequest>): Observable<DisputeFlag> {
    return this.http.patch<DisputeFlag>(`${this.baseUrl}/dispute-flags/${id}/`, data);
  }

  getReviewLogs(): Observable<ReviewLog[]> {
    return this.http.get<ReviewLog[]>(`${this.baseUrl}/review-logs/`);
  }

  getVerificationLogs(): Observable<VerificationLog[]> {
    return this.http.get<VerificationLog[]>(`${this.baseUrl}/verification-logs/`);
  }

  getAuditLogs(): Observable<AuditLog[]> {
    return this.http.get<AuditLog[]>(`${this.baseUrl}/audit-logs/`);
  }
}
