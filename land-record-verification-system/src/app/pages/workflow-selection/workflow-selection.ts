import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { ApplicationDraftService } from '../../services/application-draft.service';
import { WorkflowType } from '../../models/api.models';

interface WorkflowOption {
  workflow_type_id: number;
  value: string;
  label: string;
  description: string;
}

@Component({
  selector: 'app-workflow-selection',
  imports: [CommonModule, RouterLink],
  templateUrl: './workflow-selection.html',
  styleUrl: './workflow-selection.css',
})
export class WorkflowSelection {
  // Branding / display text
  appShortName: string = 'LRV';

  pageHeroTitle: string = 'Choose the land service workflow';

  pageDescription: string =
    'Select the workflow that matches the land-related service you want to begin. Your selection will determine the form structure and required supporting documents.';

  systemFooterText: string =
    'Secure Web-Based Land Registration and Verification System';
  userName: string = 'User';

  // UI feedback state
  message: string = '';
  messageType: 'success' | 'error' | '' = '';
  isLoading: boolean = false;

  // Currently selected workflow value
  selectedWorkflow: string = '';
  selectedWorkflowTypeId: number | null = null;

  // Workflow options shown on the page
  workflowOptions: WorkflowOption[] = [];

  constructor(
    private router: Router,
    private apiService: ApiService,
    private authService: AuthService,
    private applicationDraftService: ApplicationDraftService
  ) {}

  ngOnInit(): void {
    this.userName = this.authService.getCurrentUser()?.full_name || this.userName;
    this.restoreSelectedWorkflow();
    this.loadWorkflowTypes();
  }

  // Returns the label of the selected workflow for preview display
  get selectedWorkflowLabel(): string {
    const selected = this.workflowOptions.find(
      (workflow) => workflow.workflow_type_id === this.selectedWorkflowTypeId
    );
    return selected ? selected.label : '';
  }

  loadWorkflowTypes(): void {
    this.isLoading = true;

    this.apiService.getWorkflowTypes().subscribe({
      next: (workflowTypes) => {
        this.workflowOptions = workflowTypes
          .filter((workflow) => workflow.is_active)
          .map((workflow) => this.mapWorkflowTypeToOption(workflow));

        this.isLoading = false;

        if (this.workflowOptions.length === 0) {
          this.showError('No land service workflows available.');
        }
      },
      error: (error) => {
        console.error('Failed to load workflow types:', error);
        this.isLoading = false;
        this.showError('Unable to load workflow types from the server.');
      },
    });
  }

  mapWorkflowTypeToOption(workflow: WorkflowType): WorkflowOption {
    return {
      workflow_type_id: workflow.workflow_type_id,
      value: workflow.workflow_name.toLowerCase().replace(/\s+/g, '-'),
      label: workflow.workflow_name,
      description:
        workflow.description || this.getDefaultWorkflowDescription(workflow.workflow_name),
    };
  }

  getDefaultWorkflowDescription(workflowName: string): string {
    const descriptions: Record<string, string> = {
      Registration:
        'Begin a new land registration application with the required land and party details.',
      'Transfer of Title':
        'Submit a transfer-related application for change of ownership or interest in land.',
      Concurrence:
        'Start a concurrence request and provide the required supporting records and documents.',
      Consent:
        'Initiate a consent application and continue with the relevant legal and land details.',
      'Land Verification':
        'Verify land information using a parcel number, title number, location, or optional supporting reference.',
    };

    return descriptions[workflowName] || 'Continue with this land service workflow.';
  }

  restoreSelectedWorkflow(): void {
    const draft = this.applicationDraftService.getDraft();

    this.selectedWorkflowTypeId = draft.selectedWorkflowTypeId;
    this.selectedWorkflow = draft.selectedWorkflow;
  }

  // Clears any previous UI message
  clearMessage(): void {
    this.message = '';
    this.messageType = '';
  }

  // Shows an error message
  showError(message: string): void {
    this.message = message;
    this.messageType = 'error';
  }

  // Shows a success message
  showSuccess(message: string): void {
    this.message = message;
    this.messageType = 'success';
  }

  // Handles workflow selection
  selectWorkflow(workflow: WorkflowOption): void {
    this.clearMessage();

    const isChangingService =
      this.selectedWorkflowTypeId !== null &&
      this.selectedWorkflowTypeId !== workflow.workflow_type_id;

    if (isChangingService && !this.applicationDraftService.confirmDiscardInProgress()) {
      return;
    }

    this.selectedWorkflow = workflow.value;
    this.selectedWorkflowTypeId = workflow.workflow_type_id;

    this.applicationDraftService.updateDraft({
      selectedWorkflow: workflow.value,
      selectedWorkflowTypeId: workflow.workflow_type_id,
      selectedWorkflowLabel: workflow.label,
    });

    this.showSuccess(`${workflow.label} workflow selected.`);
  }

  // Moves the user to the application form if a workflow has been selected
  continueToApplication(): void {
    this.clearMessage();

    if (!this.selectedWorkflowTypeId) {
      this.showError('Please select a workflow before continuing.');
      return;
    }

    this.router.navigate(['/application-form']);
  }
}
