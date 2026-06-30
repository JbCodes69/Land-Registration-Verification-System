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
  isSidebarOpen: boolean = false;
  // Branding / display text
  appShortName: string = 'LRV';

  pageHeroTitle: string = 'Select a land service';

  pageDescription: string =
    'Select the land service that matches your request. Your selection will determine the form structure and required supporting documents.';

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
          this.showError('No land services are currently available.');
        }
      },
      error: (error) => {
        console.error('Failed to load land services.');
        this.isLoading = false;
        this.showError('Unable to load land services from the server.');
      },
    });
  }

  mapWorkflowTypeToOption(workflow: WorkflowType): WorkflowOption {
    return {
      workflow_type_id: workflow.workflow_type_id,
      value: workflow.workflow_name.toLowerCase().replace(/\s+/g, '-'),
      label: workflow.workflow_name,
      description: this.getDefaultWorkflowDescription(workflow.workflow_name),
    };
  }

  getDefaultWorkflowDescription(workflowName: string): string {
    const descriptions: Record<string, string> = {
      Registration: 'Register a new land record.',
      'Transfer of Title': 'Change ownership of an existing land record.',
      Concurrence: 'Request official approval for land interest or allocation.',
      Consent: 'Request permission to proceed with a land transaction.',
      'Land Verification':
        'Search a public land record before requesting the full verification report.',
    };

    return descriptions[workflowName] || 'Continue with this land service.';
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
  async selectWorkflow(workflow: WorkflowOption): Promise<void> {
    this.clearMessage();

    const isChangingService =
      this.selectedWorkflowTypeId !== null &&
      this.selectedWorkflowTypeId !== workflow.workflow_type_id;

    if (
      isChangingService &&
      !(await this.applicationDraftService.confirmDiscardInProgress())
    ) {
      return;
    }

    this.selectedWorkflow = workflow.value;
    this.selectedWorkflowTypeId = workflow.workflow_type_id;

    this.applicationDraftService.updateDraft({
      selectedWorkflow: workflow.value,
      selectedWorkflowTypeId: workflow.workflow_type_id,
      selectedWorkflowLabel: workflow.label,
    });

    this.showSuccess(`${workflow.label} service selected.`);
  }

  // Moves the user to the application form if a workflow has been selected
  continueToApplication(): void {
    this.clearMessage();

    if (!this.selectedWorkflowTypeId) {
      this.showError('Please select a land service before continuing.');
      return;
    }

    this.router.navigate(['/application-form']);
  }

  toggleSidebar(): void {
    this.isSidebarOpen = !this.isSidebarOpen;
  }

  closeSidebar(): void {
    this.isSidebarOpen = false;
  }}
