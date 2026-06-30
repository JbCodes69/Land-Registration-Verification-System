import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { ApiService } from '../../services/api.service';
import {
  Application,
  ApplicationStatus,
  LandDetail,
  User,
  VerificationLog,
  WorkflowType,
} from '../../models/api.models';

type RecordStatus =
  | 'Verified'
  | 'Already Registered'
  | 'Under Review'
  | 'Disputed'
  | 'Pending Verification';

type VerificationDecision = 'Mark Verified' | 'Flag Dispute' | 'Request Review';

interface LandRecord {
  landDetailId: number;
  applicationId: number;
  parcelNumber: string;
  plotNumber: string;
  location: string;
  registeredOwner: string;
  applicationReference: string;
  workflowType: string;
  lastChecked: string;
  officer: string;
  status: RecordStatus;
}

@Component({
  selector: 'app-admin-verification',
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './admin-verification.html',
  styleUrl: './admin-verification.css',
})
export class AdminVerification {
  isSidebarOpen: boolean = false;
  adminName: string = 'Administrator';
  isLoading: boolean = false;
  isSubmittingDecision: boolean = false;
  errorMessage: string = '';

  searchTerm: string = '';
  selectedStatus: string = 'All';
  selectedRecord: LandRecord | null = null;
  verificationRemark: string = '';
  actionMessage: string = '';
  actionMessageType: 'success' | 'error' | '' = '';

  statusOptions: string[] = [
    'All',
    'Verified',
    'Already Registered',
    'Under Review',
    'Disputed',
    'Pending Verification',
  ];

  landRecords: LandRecord[] = [];

  constructor(private apiService: ApiService) {}

  ngOnInit(): void {
    this.loadVerificationRecords();
  }

  loadVerificationRecords(): void {
    this.isLoading = true;
    this.errorMessage = '';

    forkJoin({
      landDetails: this.apiService.getLandDetails(),
      applications: this.apiService.getApplications(),
      statuses: this.apiService.getApplicationStatuses(),
      workflowTypes: this.apiService.getWorkflowTypes(),
      users: this.apiService.getUsers(),
      verificationLogs: this.apiService.getVerificationLogs(),
    }).subscribe({
      next: ({ landDetails, applications, statuses, workflowTypes, users, verificationLogs }) => {
        this.landRecords = landDetails
          .filter((landDetail) => {
            const application = applications.find(
              (item) => item.application_id === landDetail.application
            );
            return application
              ? this.isAdminVisibleApplication(application, statuses)
              : false;
          })
          .map((landDetail) =>
            this.mapLandDetailToRecord(
              landDetail,
              applications,
              statuses,
              workflowTypes,
              users,
              verificationLogs
            )
          );
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Failed to load admin verification records.');
        this.errorMessage = 'Unable to load verification records from the server.';
        this.isLoading = false;
      },
    });
  }

  mapLandDetailToRecord(
    landDetail: LandDetail,
    applications: Application[],
    statuses: ApplicationStatus[],
    workflowTypes: WorkflowType[],
    users: User[],
    verificationLogs: VerificationLog[]
  ): LandRecord {
    const application = applications.find(
      (item) => item.application_id === landDetail.application
    );
    const statusName = application
      ? statuses.find((status) => status.status_id === application.status)?.status_name ||
        'Pending Verification'
      : 'Pending Verification';
    const relatedLog = verificationLogs.find(
      (log) => log.land_detail === landDetail.land_detail_id
    );

    return {
      landDetailId: landDetail.land_detail_id,
      applicationId: landDetail.application,
      parcelNumber: landDetail.parcel_number,
      plotNumber: landDetail.plot_number,
      location: landDetail.property_location,
      registeredOwner: application
        ? users.find((user) => user.user_id === application.user)?.full_name ||
          `User #${application.user}`
        : 'Owner details unavailable',
      applicationReference: application?.application_code || `APP-${landDetail.application}`,
      workflowType: application
        ? this.getServiceTypeName(application, workflowTypes)
        : 'Service type not available',
      lastChecked: relatedLog
        ? this.formatDate(relatedLog.checked_at)
        : this.formatDate(landDetail.updated_at),
      officer: relatedLog ? `User #${relatedLog.user}` : 'Unassigned',
      status: this.resolveRecordStatus(landDetail, statusName),
    };
  }

  resolveRecordStatus(landDetail: LandDetail, applicationStatus: string): RecordStatus {
    if (landDetail.is_disputed) {
      return 'Disputed';
    }

    if (landDetail.is_already_registered) {
      return 'Already Registered';
    }

    if (['Approved', 'Registered', 'Completed'].includes(applicationStatus)) {
      return 'Verified';
    }

    if (['Submitted', 'Pending Review', 'Queried'].includes(applicationStatus)) {
      return 'Under Review';
    }

    return 'Pending Verification';
  }

  isAdminVisibleApplication(application: Application, statuses: ApplicationStatus[]): boolean {
    const normalizedStatus = (
      statuses.find((status) => status.status_id === application.status)?.status_name || ''
    ).toLowerCase();
    const hiddenStatuses = ['draft', 'pending submission', 'in progress'];

    return !!application.submitted_at && !hiddenStatuses.includes(normalizedStatus);
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

  get filteredRecords(): LandRecord[] {
    const normalizedSearch = this.searchTerm.trim().toLowerCase();

    return this.landRecords.filter((record) => {
      const matchesSearch =
        !normalizedSearch ||
        record.parcelNumber.toLowerCase().includes(normalizedSearch) ||
        record.plotNumber.toLowerCase().includes(normalizedSearch) ||
        record.location.toLowerCase().includes(normalizedSearch) ||
        record.registeredOwner.toLowerCase().includes(normalizedSearch) ||
        record.applicationReference.toLowerCase().includes(normalizedSearch);

      const matchesStatus =
        this.selectedStatus === 'All' || record.status === this.selectedStatus;

      return matchesSearch && matchesStatus;
    });
  }

  get pendingCount(): number {
    return this.landRecords.filter((record) =>
      ['Under Review', 'Pending Verification'].includes(record.status)
    ).length;
  }

  get verifiedCount(): number {
    return this.landRecords.filter((record) => record.status === 'Verified').length;
  }

  get flaggedCount(): number {
    return this.landRecords.filter((record) => record.status === 'Disputed')
      .length;
  }

  getStatusBadgeClass(status: RecordStatus): string {
    const statusClasses: Record<RecordStatus, string> = {
      Verified: 'bg-green-100 text-green-800',
      'Already Registered': 'bg-blue-100 text-blue-800',
      'Under Review': 'bg-amber-100 text-amber-800',
      Disputed: 'bg-red-100 text-red-800',
      'Pending Verification': 'bg-gray-100 text-gray-700',
    };

    return statusClasses[status];
  }

  selectRecord(record: LandRecord): void {
    this.selectedRecord = record;
    this.verificationRemark = '';
    this.actionMessage = '';
    this.actionMessageType = '';
  }

  clearFilters(): void {
    this.searchTerm = '';
    this.selectedStatus = 'All';
  }

  submitDecision(decision: VerificationDecision): void {
    if (!this.selectedRecord) {
      this.actionMessage = 'Select a land record before submitting a verification decision.';
      this.actionMessageType = 'error';
      return;
    }

    if (!this.verificationRemark.trim()) {
      this.actionMessage = 'Enter a verification remark before submitting a decision.';
      this.actionMessageType = 'error';
      return;
    }

    if (!this.selectedRecord.landDetailId) {
      this.actionMessage = 'This record has no associated land detail.';
      this.actionMessageType = 'error';
      return;
    }

    const patchMap: Record<
      VerificationDecision,
      { is_already_registered: boolean; is_disputed: boolean; status: RecordStatus }
    > = {
      'Mark Verified': {
        is_already_registered: true,
        is_disputed: false,
        status: 'Verified',
      },
      'Flag Dispute': {
        is_already_registered: false,
        is_disputed: true,
        status: 'Disputed',
      },
      'Request Review': {
        is_already_registered: false,
        is_disputed: false,
        status: 'Under Review',
      },
    };

    const selectedPatch = patchMap[decision];
    this.isSubmittingDecision = true;

    this.apiService
      .updateLandDetails(this.selectedRecord.landDetailId, {
        is_already_registered: selectedPatch.is_already_registered,
        is_disputed: selectedPatch.is_disputed,
      })
      .subscribe({
        next: () => {
          if (!this.selectedRecord) {
            return;
          }

          this.selectedRecord.status = selectedPatch.status;
          this.selectedRecord.lastChecked = this.formatDate(new Date().toISOString());
          this.selectedRecord.officer = this.adminName;
          this.actionMessage = `${decision} decision recorded for ${this.selectedRecord.parcelNumber}.`;
          this.actionMessageType = 'success';
          this.isSubmittingDecision = false;
        },
        error: (error) => {
          console.error('Failed to save verification decision.');
          this.actionMessage =
            'Unable to save the verification decision to the server. Please try again.';
          this.actionMessageType = 'error';
          this.isSubmittingDecision = false;
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

  toggleSidebar(): void {
    this.isSidebarOpen = !this.isSidebarOpen;
  }

  closeSidebar(): void {
    this.isSidebarOpen = false;
  }}
