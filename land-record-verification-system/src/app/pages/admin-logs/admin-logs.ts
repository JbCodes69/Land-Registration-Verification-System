import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { catchError, forkJoin, of } from 'rxjs';
import { ApiService } from '../../services/api.service';
import {
  Application,
  ApplicationStatus,
  AuditLog as BackendAuditLog,
  DisputeFlag,
  LandDetail,
  ReviewLog as BackendReviewLog,
  User,
} from '../../models/api.models';

type LogStatus = 'Success' | 'Warning' | 'Failed';

interface AuditLog {
  id: string;
  user: string;
  role: string;
  action: string;
  module: string;
  reference: string;
  dateTime: string;
  dateValue: string;
  status: LogStatus;
  searchText: string;
}

@Component({
  selector: 'app-admin-logs',
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './admin-logs.html',
  styleUrl: './admin-logs.css',
})
export class AdminLogs {
  isSidebarOpen: boolean = false;
  adminName: string = 'Administrator';
  isLoading: boolean = false;
  errorMessage: string = '';

  searchTerm: string = '';
  selectedStatus: string = 'All';
  selectedModule: string = 'All';
  selectedReviewDate: string = '';

  statusOptions: string[] = ['All', 'Success', 'Warning', 'Failed'];

  moduleOptions: string[] = [
    'All',
    'Applications',
    'Review',
    'Verification',
    'Disputes',
    'Payments',
    'Authentication',
  ];

  auditLogs: AuditLog[] = [];

  constructor(private apiService: ApiService) {}

  ngOnInit(): void {
    this.loadAuditLogs();
  }

  loadAuditLogs(): void {
    this.isLoading = true;
    this.errorMessage = '';

    forkJoin({
      reviewLogs: this.apiService
        .getReviewLogs()
        .pipe(catchError(() => of<BackendReviewLog[] | null>(null))),
      auditLogs: this.apiService.getAuditLogs(),
      users: this.apiService.getUsers(),
      applications: this.apiService.getApplications(),
      statuses: this.apiService.getApplicationStatuses(),
      landDetails: this.apiService.getLandDetails(),
      disputeFlags: this.apiService.getDisputeFlags(),
    }).subscribe({
      next: ({
        reviewLogs,
        auditLogs,
        users,
        applications,
        statuses,
        landDetails,
        disputeFlags,
      }) => {
        this.auditLogs = reviewLogs
          ? reviewLogs
              .slice()
              .sort(
                (a, b) =>
                  new Date(b.review_date).getTime() -
                  new Date(a.review_date).getTime()
              )
              .map((log) =>
                this.mapReviewLog(
                  log,
                  users,
                  applications,
                  statuses,
                  landDetails,
                  disputeFlags
                )
              )
          : auditLogs
              .slice()
              .sort(
                (a, b) =>
                  new Date(b.created_at).getTime() -
                  new Date(a.created_at).getTime()
              )
              .map((log) => this.mapAuditLog(log, users, applications));

        this.moduleOptions = [
          'All',
          ...Array.from(new Set(this.auditLogs.map((log) => log.module))),
        ];
        this.isLoading = false;
      },
      error: () => {
        console.error('Failed to load admin review logs.');
        this.errorMessage = 'Unable to load admin review logs from the server.';
        this.isLoading = false;
      },
    });
  }

  mapReviewLog(
    log: BackendReviewLog,
    users: User[],
    applications: Application[],
    statuses: ApplicationStatus[],
    landDetails: LandDetail[],
    disputeFlags: DisputeFlag[]
  ): AuditLog {
    const application = applications.find(
      (item) => item.application_id === log.application
    );
    const landDetail = landDetails.find(
      (item) => item.application === log.application
    );
    const oldStatus = this.getStatusName(log.old_status, statuses);
    const baseNewStatus = this.getStatusName(log.new_status, statuses);
    const decision = this.getDisplayDecision(
      baseNewStatus,
      landDetail,
      disputeFlags
    );
    const reviewer = users.find((item) => item.user_id === log.reviewed_by);
    const applicant = application
      ? users.find((item) => item.user_id === application.user)
      : undefined;
    const applicantName =
      applicant?.full_name || `User #${application?.user || 'Unknown'}`;
    const parcelNumber = landDetail?.parcel_number || 'Not available';
    const remarks = this.getReviewComment(log.comment);
    const status = this.getLogStatus(decision);
    const reference = application?.application_code || `Application #${log.application}`;

    return {
      id: `REV-${log.review_log_id}`,
      user: reviewer?.full_name || `User #${log.reviewed_by}`,
      role: 'Reviewer',
      action: `Decision: ${decision}. Previous status: ${oldStatus}. Remarks: ${remarks || 'No remarks provided.'}`,
      module: 'Review',
      reference: `${reference} | Applicant: ${applicantName} | Parcel: ${parcelNumber}`,
      dateTime: this.formatDateTime(log.review_date),
      dateValue: this.formatDateValue(log.review_date),
      status,
      searchText: [
        `REV-${log.review_log_id}`,
        reviewer?.full_name || `User #${log.reviewed_by}`,
        applicantName,
        parcelNumber,
        reference,
        oldStatus,
        decision,
        remarks,
        status,
      ]
        .join(' ')
        .toLowerCase(),
    };
  }

  mapAuditLog(
    log: BackendAuditLog,
    users: User[],
    applications: Application[]
  ): AuditLog {
    const user = users.find((item) => item.user_id === log.user);
    const application = applications.find(
      (item) => item.application_id === log.application
    );
    const status = this.getAuditLogStatus(log.action_type, log.action_description);
    const reference = application?.application_code || `Application #${log.application}`;

    return {
      id: `LOG-${log.audit_log_id}`,
      user: user?.full_name || `User #${log.user}`,
      role: this.getRoleLabel(user?.role),
      action: log.action_description,
      module: this.getModuleName(log.action_type),
      reference,
      dateTime: this.formatDateTime(log.created_at),
      dateValue: this.formatDateValue(log.created_at),
      status,
      searchText: [
        `LOG-${log.audit_log_id}`,
        user?.full_name || `User #${log.user}`,
        log.action_description,
        log.action_type,
        reference,
        status,
      ]
        .join(' ')
        .toLowerCase(),
    };
  }

  getStatusName(statusId: number, statuses: ApplicationStatus[]): string {
    return (
      statuses.find((status) => status.status_id === statusId)?.status_name ||
      'Not specified'
    );
  }

  getDisplayDecision(
    baseStatus: string,
    landDetail: LandDetail | undefined,
    disputeFlags: DisputeFlag[]
  ): string {
    if (baseStatus.toLowerCase() === 'rejected') {
      return 'Rejected';
    }

    const hasActiveDispute =
      !!landDetail &&
      (landDetail.is_disputed ||
        disputeFlags.some(
          (flag) =>
            Number(flag.land_detail) === Number(landDetail.land_detail_id) &&
            (flag.flag_status || '').toLowerCase() !== 'resolved'
        ));

    return hasActiveDispute ? 'Disputed' : baseStatus;
  }

  getReviewComment(comment: string): string {
    const reviewCommentMatch = (comment || '').match(
      /(?:^|\n)Review Comment:\s*([\s\S]*)$/i
    );

    return reviewCommentMatch ? reviewCommentMatch[1].trim() : comment || '';
  }

  getRoleLabel(roleId?: number): string {
    if (roleId === 2) {
      return 'Administrator';
    }

    if (roleId === 1) {
      return 'Applicant';
    }

    return 'System';
  }

  getModuleName(actionType: string): string {
    const normalizedType = actionType.toLowerCase();

    if (normalizedType.includes('review')) {
      return 'Review';
    }

    if (normalizedType.includes('verification')) {
      return 'Verification';
    }

    if (normalizedType.includes('payment')) {
      return 'Payments';
    }

    if (normalizedType.includes('auth') || normalizedType.includes('login')) {
      return 'Authentication';
    }

    return 'Applications';
  }

  getLogStatus(decision: string): LogStatus {
    const normalizedDecision = decision.toLowerCase();

    if (normalizedDecision === 'rejected') {
      return 'Failed';
    }

    if (normalizedDecision === 'disputed') {
      return 'Warning';
    }

    return 'Success';
  }

  getAuditLogStatus(actionType: string, description: string): LogStatus {
    const text = `${actionType} ${description}`.toLowerCase();

    if (text.includes('fail') || text.includes('error')) {
      return 'Failed';
    }

    if (text.includes('dispute') || text.includes('flag')) {
      return 'Warning';
    }

    return 'Success';
  }

  get filteredLogs(): AuditLog[] {
    const normalizedSearch = this.searchTerm.trim().toLowerCase();

    return this.auditLogs.filter((log) => {
      const matchesSearch =
        !normalizedSearch || log.searchText.includes(normalizedSearch);

      const matchesStatus =
        this.selectedStatus === 'All' || log.status === this.selectedStatus;

      const matchesModule =
        this.selectedModule === 'All' || log.module === this.selectedModule;

      const matchesDate =
        !this.selectedReviewDate ||
        log.dateValue === this.selectedReviewDate;

      return matchesSearch && matchesStatus && matchesModule && matchesDate;
    });
  }

  get successCount(): number {
    return this.auditLogs.filter((log) => log.status === 'Success').length;
  }

  get warningCount(): number {
    return this.auditLogs.filter((log) => log.status === 'Warning').length;
  }

  get failedCount(): number {
    return this.auditLogs.filter((log) => log.status === 'Failed').length;
  }

  getStatusBadgeClass(status: LogStatus): string {
    const statusClasses: Record<LogStatus, string> = {
      Success: 'bg-green-100 text-green-800',
      Warning: 'bg-amber-100 text-amber-800',
      Failed: 'bg-red-100 text-red-800',
    };

    return statusClasses[status];
  }

  clearFilters(): void {
    this.searchTerm = '';
    this.selectedStatus = 'All';
    this.selectedModule = 'All';
    this.selectedReviewDate = '';
  }

  formatDateTime(value: string): string {
    return new Date(value).toLocaleString('en-GH', {
      timeZone: 'Africa/Accra',
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  }

  formatDateValue(value: string): string {
    const dateParts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Accra',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date(value));
    const getPart = (type: string) =>
      dateParts.find((part) => part.type === type)?.value || '';

    return `${getPart('year')}-${getPart('month')}-${getPart('day')}`;
  }

  toggleSidebar(): void {
    this.isSidebarOpen = !this.isSidebarOpen;
  }

  closeSidebar(): void {
    this.isSidebarOpen = false;
  }
}
