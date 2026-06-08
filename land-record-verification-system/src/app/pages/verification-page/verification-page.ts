import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import {
  Application,
  ApplicationStatus,
  DisputeFlag,
  LandDetail,
  Payment,
  User,
  VerificationLog,
  WorkflowType,
} from '../../models/api.models';

type VerificationStatus =
  | 'Verified'
  | 'Already Registered'
  | 'Under Review'
  | 'Disputed / Flagged';

interface LandVerificationRecord {
  parcelNumber: string;
  plotNumber: string;
  location: string;
  registeredOwner: string;
  workflowSource: string;
  lastUpdated: string;
  status: VerificationStatus;
  landUse: string;
  registrationDate: string;
  disputeHistory: string[];
  disputeStatus: string;
  paymentReference: string;
  verificationNote: string;
}

@Component({
  selector: 'app-verification-page',
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './verification-page.html',
  styleUrl: './verification-page.css',
})
export class VerificationPage {
  userName: string = 'User';
  currentUserId: number = 0;
  isLoading: boolean = false;
  errorMessage: string = '';

  searchTerm: string = '';
  selectedStatus: string = 'All';
  selectedWorkflow: string = 'All';
  selectedRecord: LandVerificationRecord | null = null;

  statusOptions: string[] = [
    'All',
    'Verified',
    'Already Registered',
    'Under Review',
    'Disputed / Flagged',
  ];

  workflowOptions: string[] = ['All'];
  landRecords: LandVerificationRecord[] = [];

  constructor(private apiService: ApiService, private authService: AuthService) {}

  ngOnInit(): void {
    const currentUser = this.authService.getCurrentUser();
    this.currentUserId = currentUser?.user_id || 0;
    this.userName = currentUser?.full_name || this.userName;
    this.loadLandRecords();
  }

  loadLandRecords(): void {
    this.isLoading = true;
    this.errorMessage = '';

    forkJoin({
      landDetails: this.apiService.getLandDetails(),
      applications: this.apiService.getApplications(),
      workflowTypes: this.apiService.getWorkflowTypes(),
      statuses: this.apiService.getApplicationStatuses(),
      users: this.apiService.getUsers(),
      verificationLogs: this.apiService.getVerificationLogs(),
      disputeFlags: this.apiService.getDisputeFlags(),
      payments: this.apiService.getPayments(),
    }).subscribe({
      next: ({
        landDetails,
        applications,
        workflowTypes,
        statuses,
        users,
        verificationLogs,
        disputeFlags,
        payments,
      }) => {
        this.landRecords = landDetails.map((landDetail) =>
          this.mapLandDetailToRecord(
            landDetail,
            applications,
            workflowTypes,
            statuses,
            users,
            verificationLogs,
            disputeFlags,
            payments
          )
        );

        const backendWorkflowOptions = workflowTypes.map(
          (workflow) => workflow.workflow_name
        );
        this.workflowOptions = ['All', ...backendWorkflowOptions];
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Failed to load land verification records:', error);
        this.errorMessage = 'Unable to load land verification records from the server.';
        this.isLoading = false;
      },
    });
  }

  mapLandDetailToRecord(
    landDetail: LandDetail,
    applications: Application[],
    workflowTypes: WorkflowType[],
    statuses: ApplicationStatus[],
    users: User[],
    verificationLogs: VerificationLog[],
    disputeFlags: DisputeFlag[],
    payments: Payment[]
  ): LandVerificationRecord {
    const application = applications.find(
      (item) => item.application_id === landDetail.application
    );
    const workflowSource = application
      ? workflowTypes.find(
          (workflow) => workflow.workflow_type_id === application.workflow_type
        )?.workflow_name || 'Unknown'
      : 'Unknown';
    const owner = application
      ? users.find((user) => user.user_id === application.user)?.full_name ||
        `User #${application.user}`
      : 'Not linked';
    const statusName = application
      ? statuses.find((status) => status.status_id === application.status)
          ?.status_name || 'Under Review'
      : 'Under Review';
    const relatedLog = verificationLogs.find(
      (log) => log.land_detail === landDetail.land_detail_id
    );
    const relatedDisputes = disputeFlags.filter(
      (flag) => flag.land_detail === landDetail.land_detail_id
    );
    const relatedPayment = application
      ? payments.find((payment) => payment.application === application.application_id)
      : null;

    return {
      parcelNumber: landDetail.parcel_number,
      plotNumber: landDetail.plot_number,
      location: landDetail.property_location,
      registeredOwner: owner,
      workflowSource,
      lastUpdated: this.formatDate(landDetail.updated_at),
      status: this.resolveVerificationStatus(landDetail, statusName),
      landUse: landDetail.land_description || 'Not specified',
      registrationDate: this.formatDate(landDetail.created_at),
      disputeHistory:
        relatedDisputes.length > 0
          ? relatedDisputes.map(
              (flag) =>
                flag.flag_reason ||
                'Dispute flag recorded for this land record.'
            )
          : [
              landDetail.is_disputed
                ? 'Land detail is marked as disputed in the backend.'
                : 'No dispute history recorded.',
            ],
      disputeStatus:
        relatedDisputes[0]?.flag_status ||
        (landDetail.is_disputed ? 'Disputed' : 'No active dispute'),
      paymentReference: relatedPayment?.payment_reference || 'Not provided',
      verificationNote:
        relatedLog?.result_summary ||
        `Backend status: ${statusName}. Record loaded from land details endpoint.`,
    };
  }

  resolveVerificationStatus(
    landDetail: LandDetail,
    applicationStatus: string
  ): VerificationStatus {
    if (landDetail.is_disputed) {
      return 'Disputed / Flagged';
    }

    if (landDetail.is_already_registered) {
      return 'Already Registered';
    }

    if (['Approved', 'Registered', 'Completed'].includes(applicationStatus)) {
      return 'Verified';
    }

    return 'Under Review';
  }

  get filteredLandRecords(): LandVerificationRecord[] {
    const normalizedSearch = this.searchTerm.trim().toLowerCase();

    return this.landRecords.filter((record) => {
      const matchesSearch =
        !normalizedSearch ||
        record.parcelNumber.toLowerCase().includes(normalizedSearch) ||
        record.plotNumber.toLowerCase().includes(normalizedSearch) ||
        record.location.toLowerCase().includes(normalizedSearch) ||
        record.registeredOwner.toLowerCase().includes(normalizedSearch);

      const matchesStatus =
        this.selectedStatus === 'All' || record.status === this.selectedStatus;

      const matchesWorkflow =
        this.selectedWorkflow === 'All' ||
        record.workflowSource === this.selectedWorkflow;

      return matchesSearch && matchesStatus && matchesWorkflow;
    });
  }

  getStatusBadgeClass(status: VerificationStatus): string {
    const statusClasses: Record<VerificationStatus, string> = {
      Verified: 'bg-green-100 text-green-800',
      'Already Registered': 'bg-blue-100 text-blue-800',
      'Under Review': 'bg-amber-100 text-amber-800',
      'Disputed / Flagged': 'bg-red-100 text-red-800',
    };

    return statusClasses[status];
  }

  maskParcelNumber(parcelNumber: string): string {
    const visibleStart = parcelNumber.slice(0, 4);
    const visibleEnd = parcelNumber.slice(-3);

    return `${visibleStart}-****-${visibleEnd}`;
  }

  clearFilters(): void {
    this.searchTerm = '';
    this.selectedStatus = 'All';
    this.selectedWorkflow = 'All';
  }

  openRecordDetails(record: LandVerificationRecord): void {
    this.selectedRecord = record;
  }

  closeRecordDetails(): void {
    this.selectedRecord = null;
  }

  printPage(): void {
    window.print();
  }

  formatDate(value: string): string {
    return new Date(value).toLocaleDateString();
  }
}
