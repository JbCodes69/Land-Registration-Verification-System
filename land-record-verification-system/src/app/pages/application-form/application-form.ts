import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { switchMap } from 'rxjs';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import {
  ApplicationDraftFormData,
  ApplicationDraftService,
} from '../../services/application-draft.service';
import {
  FieldRequirement,
  WorkflowRequirementsService,
} from '../../services/workflow-requirements.service';
import {
  Application,
  ApplicationStatus,
  CreateApplicationRequest,
  CreateLandDetailRequest,
} from '../../models/api.models';

@Component({
  selector: 'app-application-form',
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './application-form.html',
  styleUrl: './application-form.css',
})
export class ApplicationForm {
  // Placeholder user data for documentation/demo UI
  userName: string = 'User';

  // UI feedback message state
  message: string = '';
  messageType: 'success' | 'error' | '' = '';
  isSubmitting: boolean = false;

  // Selected workflow from previous page
  selectedWorkflow: string = '';
  selectedWorkflowLabel: string = '';
  selectedWorkflowTypeId: number | null = null;
  currentApplicationId: number | null = null;
  currentLandDetailId: number | null = null;

  // Placeholder application reference for display
  applicationReference: string = 'Not provided';
  applicationStatuses: ApplicationStatus[] = [];

  // Main application form model
  applicationForm = {
    applicantFullName: '',
    phoneNumber: '',
    emailAddress: '',
    partyName: '',
    partyRole: '',
    partyAddress: '',

    propertyLocation: '',
    landSize: '',
    parcelNumber: '',
    plotNumber: '',
    sitePlanNumber: '',
    landDescription: '',

    instrumentType: '',
    instrumentDate: '',
    ownerNameOnDocument: '',
    taxClearanceNumber: '',
    ownershipType: '',
    currentOwner: '',
    newOwner: '',
    transferReason: '',
    consentPurpose: '',
    concurrencePurpose: '',
    titleNumber: '',

    declarationAccepted: false,
  };

  constructor(
    private router: Router,
    private apiService: ApiService,
    private authService: AuthService,
    private applicationDraftService: ApplicationDraftService,
    private workflowRequirementsService: WorkflowRequirementsService
  ) {}

  ngOnInit(): void {
    const currentUser = this.authService.getCurrentUser();
    if (currentUser) {
      this.userName = currentUser.full_name;
      this.applicationForm.applicantFullName = currentUser.full_name;
      this.applicationForm.phoneNumber = currentUser.phone_number;
      this.applicationForm.emailAddress = currentUser.email;
    }

    this.restoreDraft();

    this.loadApplicationStatuses();

    // If no workflow was selected, keep user on correct process path
    if (!this.selectedWorkflowTypeId) {
      this.showError('Please select a workflow before filling the application form.');
    }
  }

  restoreDraft(): void {
    const draft = this.applicationDraftService.getDraft();

    this.selectedWorkflow = draft.selectedWorkflow;
    this.selectedWorkflowLabel = draft.selectedWorkflowLabel;
    this.selectedWorkflowTypeId = draft.selectedWorkflowTypeId;
    this.currentApplicationId = draft.currentApplicationId;
    this.currentLandDetailId = draft.currentLandDetailId;
    this.applicationReference =
      draft.currentApplicationCode || this.generateApplicationCode();

    if (draft.applicationFormData) {
      this.applicationForm = {
        ...this.applicationForm,
        ...draft.applicationFormData,
      };
    }

    this.saveDraftState();
  }

  loadApplicationStatuses(): void {
    this.apiService.getApplicationStatuses().subscribe({
      next: (statuses) => {
        this.applicationStatuses = statuses;
      },
      error: (error) => {
        console.error('Failed to load application statuses:', error);
        this.showError('Unable to load application statuses. The form will use a default pending status.');
      },
    });
  }

  // Clears any UI message
  clearMessage(): void {
    this.message = '';
    this.messageType = '';
  }

  // Shows error feedback
  showError(message: string): void {
    this.message = message;
    this.messageType = 'error';
  }

  // Shows success feedback
  showSuccess(message: string): void {
    this.message = message;
    this.messageType = 'success';
  }

  // Validates minimum required fields before moving forward
  validateForm(): boolean {
    if (!this.selectedWorkflowTypeId) {
      this.showError('No workflow selected. Please return and select a workflow.');
      return false;
    }

    if (!this.getCurrentUserId()) {
      this.showError('Your login session could not be found. Please sign in again.');
      return false;
    }

    const missingField = this.getMissingRequiredField();

    if (missingField) {
      this.showError(`${missingField.label} is required for ${this.selectedWorkflowLabel || 'this workflow'}.`);
      return false;
    }

    if (!this.applicationForm.declarationAccepted) {
      this.showError('You must accept the declaration before continuing.');
      return false;
    }

    return true;
  }

  getMissingRequiredField(): FieldRequirement | null {
    const requirements = this.workflowRequirementsService.getRequirements(
      this.selectedWorkflowLabel || this.selectedWorkflow
    );

    const missingRequiredField =
      requirements.requiredFields.find(
        (field) => !this.getFormValue(field.key).trim()
      ) || null;

    if (missingRequiredField) {
      return missingRequiredField;
    }

    if (
      requirements.anyOfFields &&
      requirements.anyOfFields.keys.every((fieldKey) => !this.getFormValue(fieldKey).trim())
    ) {
      return {
        key: requirements.anyOfFields.keys[0],
        label: requirements.anyOfFields.label,
      };
    }

    return null;
  }

  getFormValue(fieldKey: string): string {
    const value = this.applicationForm[fieldKey as keyof typeof this.applicationForm];
    return typeof value === 'string' ? value : '';
  }

  isFieldRequired(fieldKey: string): boolean {
    return this.workflowRequirementsService.isFieldRequired(
      this.selectedWorkflowLabel || this.selectedWorkflow,
      fieldKey
    );
  }

  isTransferWorkflow(): boolean {
    return this.workflowRequirementsService.getWorkflowKey(
      this.selectedWorkflowLabel || this.selectedWorkflow
    ) === 'transfer-of-title';
  }

  isConsentWorkflow(): boolean {
    return this.workflowRequirementsService.getWorkflowKey(
      this.selectedWorkflowLabel || this.selectedWorkflow
    ) === 'consent';
  }

  isConcurrenceWorkflow(): boolean {
    return this.workflowRequirementsService.getWorkflowKey(
      this.selectedWorkflowLabel || this.selectedWorkflow
    ) === 'concurrence';
  }

  isVerificationWorkflow(): boolean {
    return this.workflowRequirementsService.getWorkflowKey(
      this.selectedWorkflowLabel || this.selectedWorkflow
    ) === 'land-verification';
  }

  getCurrentUserId(): number {
    return this.authService.getCurrentUserId() || 0;
  }

  getPendingReviewStatusId(): number {
    const pendingReview = this.applicationStatuses.find(
      (status) => status.status_name.toLowerCase() === 'pending review'
    );

    const submitted = this.applicationStatuses.find(
      (status) => status.status_name.toLowerCase() === 'submitted'
    );

    return pendingReview?.status_id || submitted?.status_id || 3;
  }

  getWorkflowCodeSegment(): string {
    const workflowName = this.selectedWorkflowLabel || this.selectedWorkflow;
    const normalizedWorkflow = workflowName.toLowerCase();

    if (normalizedWorkflow.includes('transfer')) {
      return 'TRF';
    }

    if (normalizedWorkflow.includes('concurrence')) {
      return 'CCR';
    }

    if (normalizedWorkflow.includes('consent')) {
      return 'CON';
    }

    return 'REG';
  }

  generateApplicationCode(): string {
    return `APP-${this.getWorkflowCodeSegment()}-${Date.now()}`;
  }

  buildApplicationPayload(): CreateApplicationRequest {
    return {
      user: this.getCurrentUserId(),
      workflow_type: this.selectedWorkflowTypeId || 1,
      status: this.getPendingReviewStatusId(),
      application_code: this.applicationReference,
      remarks: 'Application submitted from Angular frontend.',
    };
  }

  buildLandDetailsPayload(application: Application): CreateLandDetailRequest {
    return {
      application: application.application_id,
      property_location: this.applicationForm.propertyLocation || 'Not provided',
      land_size: this.applicationForm.landSize || 'Not provided',
      parcel_number: this.applicationForm.parcelNumber || 'Not provided',
      plot_number: this.applicationForm.plotNumber || this.applicationForm.titleNumber || 'Not provided',
      site_plan_number: this.applicationForm.sitePlanNumber || 'Not provided',
      instrument_type: this.applicationForm.instrumentType,
      instrument_date: this.applicationForm.instrumentDate || null,
      land_description: this.buildLandDescription(),
      is_already_registered: false,
      is_disputed: false,
    };
  }

  buildLandDescription(): string {
    const details = [
      this.applicationForm.landDescription,
      this.applicationForm.ownershipType ? `Ownership type: ${this.applicationForm.ownershipType}` : '',
      this.applicationForm.currentOwner ? `Current owner: ${this.applicationForm.currentOwner}` : '',
      this.applicationForm.newOwner ? `New owner: ${this.applicationForm.newOwner}` : '',
      this.applicationForm.transferReason ? `Transfer reason: ${this.applicationForm.transferReason}` : '',
      this.applicationForm.consentPurpose ? `Consent purpose: ${this.applicationForm.consentPurpose}` : '',
      this.applicationForm.concurrencePurpose ? `Concurrence purpose: ${this.applicationForm.concurrencePurpose}` : '',
      this.applicationForm.titleNumber ? `Title number: ${this.applicationForm.titleNumber}` : '',
    ].filter(Boolean);

    return details.join(' | ') || 'Not provided';
  }

  saveLocalApplicationState(application: Application): void {
    this.currentApplicationId = application.application_id;
    this.applicationReference = application.application_code;
    this.saveDraftState({ applicationSubmissionStatus: 'draft' });
  }

  saveDraftState(extraDraftData: Partial<ReturnType<ApplicationDraftService['getDraft']>> = {}): void {
    this.applicationDraftService.updateDraft({
      selectedWorkflow: this.selectedWorkflow,
      selectedWorkflowLabel: this.selectedWorkflowLabel,
      selectedWorkflowTypeId: this.selectedWorkflowTypeId,
      currentApplicationId: this.currentApplicationId,
      currentApplicationCode: this.applicationReference,
      currentLandDetailId: this.currentLandDetailId,
      applicationFormData: this.applicationForm as ApplicationDraftFormData,
      ...extraDraftData,
    });
  }

  // Resets the current form fields
  resetForm(): void {
    this.clearMessage();

    const confirmed = window.confirm(
      'Discard the current application form draft? This will clear the values entered on this page.'
    );

    if (!confirmed) {
      return;
    }

    this.applicationForm = {
      applicantFullName: '',
      phoneNumber: '',
      emailAddress: '',
      partyName: '',
      partyRole: '',
      partyAddress: '',

      propertyLocation: '',
      landSize: '',
      parcelNumber: '',
      plotNumber: '',
      sitePlanNumber: '',
      landDescription: '',

      instrumentType: '',
      instrumentDate: '',
      ownerNameOnDocument: '',
      taxClearanceNumber: '',
      ownershipType: '',
      currentOwner: '',
      newOwner: '',
      transferReason: '',
      consentPurpose: '',
      concurrencePurpose: '',
      titleNumber: '',

      declarationAccepted: false,
    };

    this.applicationDraftService.clearApplicationFormData();
    this.showSuccess('Application form has been reset.');
  }

  // Saves form data temporarily and moves to the document upload page
  saveAndContinue(): void {
    this.clearMessage();

    if (!this.validateForm()) {
      return;
    }

    this.isSubmitting = true;
    this.saveDraftState();

    const applicationRequest = this.currentApplicationId
      ? this.apiService.updateApplication(
          this.currentApplicationId,
          this.buildApplicationPayload()
        )
      : this.apiService.createApplication(this.buildApplicationPayload());

    applicationRequest
      .pipe(
        switchMap((application) => {
          this.saveLocalApplicationState(application);
          const landDetailsPayload = this.buildLandDetailsPayload(application);

          return this.currentLandDetailId
            ? this.apiService.updateLandDetails(this.currentLandDetailId, landDetailsPayload)
            : this.apiService.createLandDetails(landDetailsPayload);
        })
      )
      .subscribe({
        next: (landDetail) => {
          this.currentLandDetailId = landDetail.land_detail_id;
          this.saveDraftState();
          this.isSubmitting = false;
          this.showSuccess('Application and land details saved successfully.');
          this.router.navigate(['/document-upload']);
        },
        error: (error) => {
          console.error('Failed to create application or land details:', error);
          this.isSubmitting = false;
          this.showError(
            'Unable to submit the application to the server. Please check the form details and try again.'
          );
        },
      });
  }
}
