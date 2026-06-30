import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { forkJoin, map, switchMap } from 'rxjs';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import {
  Application,
  ApplicationParty,
  ApplicationStatus,
  DocumentCategory,
  DocumentRecord,
  DisputeFlag,
  LandDetail,
  Payment,
  User,
  WorkflowType,
} from '../../models/api.models';
import { AppNotificationService } from '../../services/app-notification.service';

type ReviewDecision = 'Disputed' | 'Approved' | 'Rejected';
type DocumentReviewStatus =
  | 'Complete'
  | 'Incomplete'
  | 'Requires Correction'
  | 'Invalid';
type VerificationOutcome =
  | 'Verified'
  | 'Not Verified'
  | 'Disputed'
  | 'Pending Further Review';
type AdminRecommendation =
  | ''
  | 'Proceed'
  | 'Request Correction'
  | 'Reject Application'
  | 'Escalate for Further Review';
type ReviewStatus = string;

interface SubmittedDocument {
  category: string;
  fileName: string;
  fileUrl: string;
  isImage: boolean;
  uploadedDate: string;
  status: 'Submitted' | 'Needs Review' | 'Accepted';
}

interface SelectedReviewApplication {
  reference: string;
  workflowType: string;
  submittedDate: string;
  currentStatus: ReviewStatus;
  paymentStatus: string;
  applicantName: string;
  applicantRole: string;
  applicantPhone: string;
  applicantEmail: string;
  applicantAddress: string;
  parcelNumber: string;
  landDetailId: number | null;
  disputeFlagId: number | null;
  plotNumber: string;
  location: string;
  landSize: string;
  landUse: string;
  instrumentType: string;
  verificationStatus: string;
  disputeWarning: string;
}

@Component({
  selector: 'app-admin-review',
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './admin-review.html',
  styleUrl: './admin-review.css',
})
export class AdminReview {
  isSidebarOpen: boolean = false;
  private readonly backendBaseUrl = 'http://127.0.0.1:8000';

  adminName: string = 'Administrator';
  adminUserId: number = 0;
  isLoading: boolean = false;
  isSubmittingDecision: boolean = false;

  adminRemark: string = '';
  selectedReviewDecision: ReviewDecision | '' = '';
  selectedDocumentReviewStatus: DocumentReviewStatus | '' = '';
  selectedVerificationOutcome: VerificationOutcome | '' = '';
  selectedAdminRecommendation: AdminRecommendation = '';
  decisionMessage: string = '';
  decisionMessageType: 'success' | 'error' | '' = '';
  selectedApplicationId: number | null = null;
  applicationStatuses: ApplicationStatus[] = [];

  reviewDecisionOptions: ReviewDecision[] = ['Disputed', 'Approved', 'Rejected'];
  documentReviewStatusOptions: DocumentReviewStatus[] = [
    'Complete',
    'Incomplete',
    'Requires Correction',
    'Invalid',
  ];
  verificationOutcomeOptions: VerificationOutcome[] = [
    'Verified',
    'Not Verified',
    'Disputed',
    'Pending Further Review',
  ];
  adminRecommendationOptions: Exclude<AdminRecommendation, ''>[] = [
    'Proceed',
    'Request Correction',
    'Reject Application',
    'Escalate for Further Review',
  ];
  reviewCommentPlaceholder: string = [
    'Documents reviewed and found complete.',
    'Land record is disputed and requires administrative handling.',
    'Application rejected due to inconsistent land details.',
    'Application approved after successful document and land record review.',
    'Land record requires further verification before approval.',
  ].join('\n');

  selectedApplication: SelectedReviewApplication | null = null;

  submittedDocuments: SubmittedDocument[] = [];

  constructor(
    private apiService: ApiService,
    private authService: AuthService,
    private appNotificationService: AppNotificationService,
    private router: Router
  ) {}

  ngOnInit(): void {
    const currentUser = this.authService.getCurrentUser();
    this.adminUserId = currentUser?.user_id || 0;
    this.adminName = currentUser?.full_name || this.adminName;
    this.loadReviewApplication();
  }

  loadReviewApplication(): void {
    const selectedApplicationId = this.getStoredReviewApplicationId();
    if (!selectedApplicationId) {
      this.selectedApplicationId = null;
      this.selectedApplication = null;
      this.submittedDocuments = [];
      this.decisionMessage = 'No application selected for review.';
      this.decisionMessageType = 'error';
      this.isLoading = false;
      return;
    }

    this.isLoading = true;
    this.decisionMessage = '';
    this.decisionMessageType = '';

    forkJoin({
      applications: this.apiService.getApplications(),
      statuses: this.apiService.getApplicationStatuses(),
      workflowTypes: this.apiService.getWorkflowTypes(),
      users: this.apiService.getUsers(),
      landDetails: this.apiService.getLandDetails(),
      documents: this.apiService.getDocuments(),
      documentCategories: this.apiService.getDocumentCategories(),
      applicationParties: this.apiService.getApplicationParties(),
      payments: this.apiService.getPayments(),
      disputeFlags: this.apiService.getDisputeFlags(),
    }).subscribe({
      next: ({
        applications,
        statuses,
        workflowTypes,
        users,
        landDetails,
        documents,
        documentCategories,
        applicationParties,
        payments,
        disputeFlags,
      }) => {
        this.applicationStatuses = statuses;
        const selectedApplication = applications.find(
          (application) => application.application_id === selectedApplicationId
        );

        if (!selectedApplication) {
          this.selectedApplicationId = null;
          this.selectedApplication = null;
          this.submittedDocuments = [];
          this.decisionMessage = 'The selected application could not be found for review.';
          this.decisionMessageType = 'error';
          this.isLoading = false;
          return;
        }

        if (!this.isAdminVisibleApplication(selectedApplication, statuses)) {
          this.selectedApplicationId = null;
          this.selectedApplication = null;
          this.submittedDocuments = [];
          this.decisionMessage = 'This application has not been finally submitted for administrative review.';
          this.decisionMessageType = 'error';
          this.isLoading = false;
          return;
        }

        this.selectedApplicationId = selectedApplication.application_id;
        this.mapSelectedApplication(
          selectedApplication,
          statuses,
          workflowTypes,
          users,
          landDetails,
          applicationParties,
          payments,
          disputeFlags
        );
        this.mapSubmittedDocuments(
          selectedApplication.application_id,
          documents,
          documentCategories
        );
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Failed to load admin review data.');
        this.showErrorAndFocus(
          'Unable to load review data from the server.',
          'reviewDecision'
        );
        this.isLoading = false;
      },
    });
  }

  getStoredReviewApplicationId(): number | null {
    const storedApplicationId = Number(localStorage.getItem('adminReviewApplicationId') || 0);
    return storedApplicationId > 0 ? storedApplicationId : null;
  }

  isAdminVisibleApplication(application: Application, statuses: ApplicationStatus[]): boolean {
    const normalizedStatus = this.getStatusName(application.status, statuses).toLowerCase();
    const hiddenStatuses = ['draft', 'pending submission', 'in progress'];

    return !!application.submitted_at && !hiddenStatuses.includes(normalizedStatus);
  }

  mapSelectedApplication(
    application: Application,
    statuses: ApplicationStatus[],
    workflowTypes: WorkflowType[],
    users: User[],
    landDetails: LandDetail[],
    applicationParties: ApplicationParty[],
    payments: Payment[],
    disputeFlags: DisputeFlag[]
  ): void {
    const accountUser = users.find((user) => user.user_id === application.user);
    const applicationParty = applicationParties.find(
      (party) => Number(party.application) === Number(application.application_id)
    );
    const landDetail = landDetails.find(
      (item) => item.application === application.application_id
    );
    const payment = payments.find(
      (item) => item.application === application.application_id
    );
    const disputeFlag = landDetail
      ? disputeFlags.find(
          (flag) =>
            Number(flag.land_detail) === Number(landDetail.land_detail_id) &&
            (flag.flag_status || '').toLowerCase() !== 'resolved'
        ) || null
      : null;

    this.selectedApplication = {
      reference: application.application_code,
      workflowType: this.getServiceTypeName(application, workflowTypes),
      submittedDate: this.formatDate(application.submitted_at),
      currentStatus: this.getReviewDisplayStatus(
        this.getStatusName(application.status, statuses),
        landDetail,
        disputeFlag
      ),
      paymentStatus: payment?.payment_status || 'Not Required',
      applicantName:
        this.cleanPartyValue(applicationParty?.party_name) ||
        accountUser?.full_name ||
        `User #${application.user}`,
      applicantRole: this.cleanPartyValue(applicationParty?.party_role) || 'Applicant',
      applicantPhone:
        this.getContactDetail(applicationParty?.contact_details, 'Phone') ||
        accountUser?.phone_number ||
        'Information not available',
      applicantEmail:
        this.getContactDetail(applicationParty?.contact_details, 'Email') ||
        accountUser?.email ||
        'Information not available',
      applicantAddress: this.getApplicantAddress(application, applicationParties),
      landDetailId: landDetail?.land_detail_id || null,
      disputeFlagId: disputeFlag?.dispute_flag_id || null,
      parcelNumber: landDetail?.parcel_number || 'Not available',
      plotNumber: landDetail?.plot_number || 'Not available',
      location: landDetail?.property_location || 'Not available',
      landSize: landDetail?.land_size || 'Not available',
      landUse: landDetail?.land_description || 'Not specified',
      instrumentType: landDetail?.instrument_type || 'Not available',
      verificationStatus: landDetail?.is_disputed
        ? 'Disputed'
        : landDetail?.is_already_registered
        ? 'Already Registered'
        : this.getStatusName(application.status, statuses),
      disputeWarning: landDetail?.is_disputed
        ? 'This parcel is marked as disputed and requires special review.'
        : 'No active dispute has been recorded for this land record.',
    };

    this.adminRemark = this.getAdministrativeReviewNotes(application.remarks);
  }

  getServiceTypeName(application: Application, workflowTypes: WorkflowType[]): string {
    const workflowTypeId = Number(application.workflow_type);
    const workflowName =
      workflowTypes.find(
        (workflow) => Number(workflow.workflow_type_id) === workflowTypeId
      )?.workflow_name || '';

    return this.normalizeServiceType(workflowName);
  }

  normalizeServiceType(serviceName: string): string {
    const normalizedServiceName = (serviceName || '').trim().toLowerCase();
    const serviceNames: Record<string, string> = {
      registration: 'Land Registration',
      'land registration': 'Land Registration',
      transfer: 'Transfer of Title',
      'transfer of title': 'Transfer of Title',
      concurrence: 'Concurrence',
      consent: 'Consent',
      verification: 'Land Verification',
      'land verification': 'Land Verification',
    };

    return serviceNames[normalizedServiceName] || serviceName.trim() || 'Service type not available';
  }

  getAdministrativeReviewNotes(remarks: string | null): string {
    const trimmedRemarks = (remarks || '').trim();
    if (trimmedRemarks.toLowerCase() === 'application submitted from angular frontend.') {
      return 'Enter administrative review notes for this application.';
    }

    const reviewCommentMatch = trimmedRemarks.match(/(?:^|\n)Review Comment:\s*([\s\S]*)$/i);
    if (reviewCommentMatch) {
      return reviewCommentMatch[1].trim();
    }

    return trimmedRemarks;
  }

  getApplicantAddress(
    application: Application,
    applicationParties: ApplicationParty[]
  ): string {
    const applicationParty = applicationParties.find(
      (party) => Number(party.application) === Number(application.application_id)
    );
    const partyAddress = applicationParty?.address?.trim() || '';

    return partyAddress && partyAddress.toLowerCase() !== 'not provided'
      ? partyAddress
      : 'Address information not available';
  }

  getContactDetail(contactDetails: string | null | undefined, label: string): string {
    const detailParts = (contactDetails || '').split('|').map((part) => part.trim());
    const matchedPart = detailParts.find((part) =>
      part.toLowerCase().startsWith(`${label.toLowerCase()}:`)
    );

    return this.cleanPartyValue(matchedPart?.split(':').slice(1).join(':'));
  }

  cleanPartyValue(value: string | null | undefined): string {
    const trimmedValue = (value || '').trim();
    return trimmedValue && trimmedValue.toLowerCase() !== 'not provided'
      ? trimmedValue
      : '';
  }

  mapSubmittedDocuments(
    applicationId: number,
    documents: DocumentRecord[],
    documentCategories: DocumentCategory[]
  ): void {
    const relatedDocuments = documents.filter(
      (document) => this.getDocumentApplicationId(document) === applicationId
    );

    this.submittedDocuments = relatedDocuments.map((document) => ({
      category:
        documentCategories.find(
          (category) =>
            category.document_category_id === this.getDocumentCategoryId(document)
        )?.category_name || document.document_name,
      fileName: document.document_name || this.getFileName(document.file_url || document.file_path || ''),
      fileUrl: this.resolveFileUrl(document.file_url || document.file_path || ''),
      isImage: this.isImageFile(document.file_url || document.file_path || document.document_name),
      uploadedDate: this.formatDate(document.upload_date),
      status:
        document.verification_status === 'Verified'
          ? 'Accepted'
          : document.verification_status === 'Rejected'
          ? 'Needs Review'
          : 'Submitted',
    }));
  }

  getDocumentApplicationId(document: DocumentRecord): number | null {
    return document.application_id || document.application || null;
  }

  getDocumentCategoryId(document: DocumentRecord): number | null {
    return document.document_category_id || document.document_category || null;
  }

  resolveFileUrl(fileUrl: string): string {
    if (!fileUrl) {
      return '';
    }

    if (/^https?:\/\//i.test(fileUrl)) {
      return fileUrl;
    }

    return `${this.backendBaseUrl}${fileUrl.startsWith('/') ? '' : '/'}${fileUrl}`;
  }

  isImageFile(fileUrl: string): boolean {
    return /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(fileUrl.split('?')[0]);
  }

  getFileName(fileUrl: string): string {
    return fileUrl.split('/').pop() || 'Uploaded document';
  }

  getStatusName(statusId: number, statuses: ApplicationStatus[]): string {
    return (
      statuses.find((status) => status.status_id === statusId)?.status_name ||
      'Pending Review'
    );
  }

  getReviewDisplayStatus(
    baseStatus: string,
    landDetail: LandDetail | undefined,
    disputeFlag: DisputeFlag | null
  ): string {
    if (baseStatus.toLowerCase() === 'rejected') {
      return 'Rejected';
    }

    return landDetail?.is_disputed || disputeFlag ? 'Disputed' : baseStatus;
  }

  getStatusBadgeClass(status: ReviewStatus): string {
    const normalizedStatus = status.toLowerCase();

    if (['approved', 'registered', 'completed'].includes(normalizedStatus)) {
      return 'bg-green-100 text-green-800';
    }

    if (['submitted', 'pending review', 'under review', 'draft'].includes(normalizedStatus)) {
      return 'bg-amber-100 text-amber-800';
    }

    if (normalizedStatus === 'queried' || normalizedStatus === 'disputed') {
      return 'bg-purple-100 text-purple-800';
    }

    return 'bg-red-100 text-red-800';
  }

  getDocumentBadgeClass(status: SubmittedDocument['status']): string {
    const statusClasses: Record<SubmittedDocument['status'], string> = {
      Submitted: 'bg-blue-100 text-blue-800',
      'Needs Review': 'bg-amber-100 text-amber-800',
      Accepted: 'bg-green-100 text-green-800',
    };

    return statusClasses[status];
  }

  getPaymentBadgeClass(status: string): string {
    const normalizedStatus = status.toLowerCase();

    if (['completed', 'successful', 'success'].includes(normalizedStatus)) {
      return 'bg-green-100 text-green-800';
    }

    if (['pending', 'pending payment'].includes(normalizedStatus)) {
      return 'bg-amber-100 text-amber-800';
    }

    if (['failed', 'declined'].includes(normalizedStatus)) {
      return 'bg-red-100 text-red-800';
    }

    return 'bg-gray-100 text-gray-700';
  }

  submitDecision(): void {
    if (!this.selectedReviewDecision) {
      this.showErrorAndFocus('Select a review decision before submitting.', 'reviewDecision');
      return;
    }

    if (!this.selectedDocumentReviewStatus) {
      this.showErrorAndFocus(
        'Select the document review status before submitting.',
        'documentReviewStatus'
      );
      return;
    }

    if (!this.selectedVerificationOutcome) {
      this.showErrorAndFocus(
        'Select the verification outcome before submitting.',
        'verificationOutcome'
      );
      return;
    }

    if (!this.adminRemark.trim()) {
      this.showErrorAndFocus(
        'Enter a professional review comment before submitting.',
        'adminRemark'
      );
      return;
    }

    if (!this.selectedApplicationId) {
      this.showErrorAndFocus('No application is selected for review.', 'reviewDecision');
      return;
    }

    if (!this.adminUserId) {
      this.showErrorAndFocus(
        'Your admin login session could not be found. Please sign in again.',
        'reviewDecision'
      );
      return;
    }

    const nextStatusName = this.getBackendStatusNameForDecision(
      this.selectedReviewDecision
    );
    const nextStatus = this.applicationStatuses.find(
      (status) => status.status_name === nextStatusName
    );

    if (!nextStatus) {
      this.showErrorAndFocus(
        `${nextStatusName} status is not available in the status list.`,
        'reviewDecision'
      );
      return;
    }

    if (this.selectedReviewDecision === 'Disputed' && !this.selectedApplication?.landDetailId) {
      this.showErrorAndFocus(
        'This application has no land detail to flag as disputed.',
        'reviewDecision'
      );
      return;
    }

    this.isSubmittingDecision = true;

    const reviewRequest = this.apiService
      .reviewApplication(this.selectedApplicationId, {
        admin_id: this.adminUserId,
        new_status_id: nextStatus.status_id,
        comment: this.buildReviewComment(),
      });

    const saveRequest =
      this.selectedReviewDecision === 'Disputed' && this.selectedApplication?.landDetailId
        ? reviewRequest.pipe(
            switchMap(() =>
              forkJoin([
                this.apiService.updateLandDetails(this.selectedApplication?.landDetailId || 0, {
                  is_disputed: true,
                }),
                this.saveDisputeFlag(),
              ])
            ),
            map(() => null)
          )
        : reviewRequest.pipe(map(() => null));

    saveRequest
      .subscribe({
        next: () => {
          if (this.selectedApplication) {
            this.selectedApplication.currentStatus = this.selectedReviewDecision;
            if (this.selectedReviewDecision === 'Disputed') {
              this.selectedApplication.verificationStatus = 'Disputed';
              this.selectedApplication.disputeWarning =
                'This parcel is marked as disputed and requires special review.';
            }
          }
          this.decisionMessage = `${this.selectedReviewDecision} decision recorded for ${this.selectedApplication?.reference || 'the selected application'}.`;
          this.decisionMessageType = 'success';
          this.isSubmittingDecision = false;
          localStorage.removeItem('adminReviewApplicationId');
          window.setTimeout(() => {
            this.router.navigate(['/admin/applications']);
          }, 600);
        },
        error: (error) => {
          console.error('Failed to submit review decision.');
          this.showErrorAndFocus(
            'Unable to save the review decision to the server. Please try again.',
            'reviewDecision'
          );
          this.isSubmittingDecision = false;
        },
      });
  }

  getBackendStatusNameForDecision(decision: ReviewDecision): string {
    if (decision === 'Disputed') {
      return this.applicationStatuses.some(
        (status) => status.status_name.toLowerCase() === 'queried'
      )
        ? 'Queried'
        : 'Pending Review';
    }

    return decision;
  }

  saveDisputeFlag() {
    const landDetailId = this.selectedApplication?.landDetailId || 0;
    const flagReason = this.adminRemark.trim();

    return this.selectedApplication?.disputeFlagId
      ? this.apiService.updateDisputeFlag(this.selectedApplication.disputeFlagId, {
          flag_reason: flagReason,
          flag_status: 'Disputed',
        })
      : this.apiService.createDisputeFlag({
          flag_reason: flagReason,
          flag_status: 'Disputed',
          land_detail: landDetailId,
          flagged_by: this.adminUserId,
        });
  }

  buildReviewComment(): string {
    const recommendation = this.selectedAdminRecommendation || 'Not specified';

    return [
      `Review Decision: ${this.selectedReviewDecision}`,
      `Document Review Status: ${this.selectedDocumentReviewStatus}`,
      `Verification Outcome: ${this.selectedVerificationOutcome}`,
      `Administrative Recommendation: ${recommendation}`,
      `Review Comment: ${this.adminRemark.trim()}`,
    ].join('\n');
  }

  refreshReviewRelatedData(): void {
    forkJoin({
      applications: this.apiService.getApplications(),
      reviewLogs: this.apiService.getReviewLogs(),
      notifications: this.apiService.getNotifications(),
      auditLogs: this.apiService.getAuditLogs(),
    }).subscribe({
      next: () => this.loadReviewApplication(),
      error: (error) => {
        console.error('Review saved, but refresh failed.');
      },
    });
  }

  formatDate(value: string): string {
    return new Date(value).toLocaleString('en-GH', {
      timeZone: 'Africa/Accra',
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  }

  showErrorAndFocus(message: string, elementId: string): void {
    this.decisionMessage = '';
    this.decisionMessageType = '';
    this.appNotificationService.errorAndWait(message).then(() => {
      this.focusElement(elementId);
    });
  }

  focusElement(elementId: string): void {
    const element = document.getElementById(elementId);
    if (!element) {
      return;
    }

    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    window.setTimeout(() => element.focus(), 250);
  }

  toggleSidebar(): void {
    this.isSidebarOpen = !this.isSidebarOpen;
  }

  closeSidebar(): void {
    this.isSidebarOpen = false;
  }
}
