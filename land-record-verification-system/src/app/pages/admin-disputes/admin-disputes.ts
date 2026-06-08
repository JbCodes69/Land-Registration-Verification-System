import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import {
  Application,
  DisputeFlag,
  LandDetail,
  User,
} from '../../models/api.models';

type DisputeStatus = 'Disputed' | 'Under Investigation' | 'Resolved';

interface DisputeRecord {
  disputeFlagId: number | null;
  landDetailId: number;
  disputeReference: string;
  parcelNumber: string;
  plotNumber: string;
  location: string;
  applicant: string;
  disputeReason: string;
  reportedDate: string;
  assignedOfficer: string;
  status: DisputeStatus;
  latestRemark: string;
  userNotification: string;
}

@Component({
  selector: 'app-admin-disputes',
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './admin-disputes.html',
  styleUrl: './admin-disputes.css',
})
export class AdminDisputes {
  adminName: string = 'Administrator';
  adminUserId: number = 0;
  isLoading: boolean = false;
  isSubmitting: boolean = false;
  errorMessage: string = '';

  selectedStatus: string = 'All';
  searchTerm: string = '';
  selectedDispute: DisputeRecord | null = null;
  updatedStatus: DisputeStatus = 'Under Investigation';
  adminRemark: string = '';
  notifyApplicant: boolean = true;
  actionMessage: string = '';
  actionMessageType: 'success' | 'error' | '' = '';

  statusOptions: string[] = [
    'All',
    'Disputed',
    'Under Investigation',
    'Resolved',
  ];

  editableStatusOptions: DisputeStatus[] = [
    'Disputed',
    'Under Investigation',
    'Resolved',
  ];

  disputes: DisputeRecord[] = [];

  constructor(private apiService: ApiService, private authService: AuthService) {}

  ngOnInit(): void {
    const currentUser = this.authService.getCurrentUser();
    this.adminUserId = currentUser?.user_id || 0;
    this.adminName = currentUser?.full_name || this.adminName;
    this.loadDisputeRecords();
  }

  loadDisputeRecords(): void {
    this.isLoading = true;
    this.errorMessage = '';

    forkJoin({
      disputeFlags: this.apiService.getDisputeFlags(),
      landDetails: this.apiService.getLandDetails(),
      applications: this.apiService.getApplications(),
      users: this.apiService.getUsers(),
    }).subscribe({
      next: ({ disputeFlags, landDetails, applications, users }) => {
        const flagRecords = disputeFlags.map((flag) =>
          this.mapDisputeFlag(flag, landDetails, applications, users)
        );
        const flaggedLandRecords = landDetails
          .filter(
            (landDetail) =>
              landDetail.is_disputed &&
              !disputeFlags.some(
                (flag) => flag.land_detail === landDetail.land_detail_id
              )
          )
          .map((landDetail) =>
            this.mapDisputedLandDetail(landDetail, applications, users)
          );

        this.disputes = [...flagRecords, ...flaggedLandRecords];
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Failed to load dispute records:', error);
        this.errorMessage = 'Unable to load dispute records from the server.';
        this.isLoading = false;
      },
    });
  }

  mapDisputeFlag(
    flag: DisputeFlag,
    landDetails: LandDetail[],
    applications: Application[],
    users: User[]
  ): DisputeRecord {
    const landDetail = landDetails.find(
      (item) => item.land_detail_id === flag.land_detail
    );
    const application = landDetail
      ? applications.find((item) => item.application_id === landDetail.application)
      : undefined;

    return {
      disputeFlagId: flag.dispute_flag_id,
      landDetailId: flag.land_detail,
      disputeReference: `DSP-${flag.dispute_flag_id}`,
      parcelNumber: landDetail?.parcel_number || 'Not available',
      plotNumber: landDetail?.plot_number || 'Not available',
      location: landDetail?.property_location || 'Not available',
      applicant: application
        ? users.find((user) => user.user_id === application.user)?.full_name ||
          `User #${application.user}`
        : 'Not linked',
      disputeReason: flag.flag_reason,
      reportedDate: this.formatDate(flag.flagged_at),
      assignedOfficer:
        users.find((user) => user.user_id === flag.flagged_by)?.full_name ||
        `User #${flag.flagged_by}`,
      status: this.normalizeDisputeStatus(flag.flag_status),
      latestRemark: flag.flag_reason,
      userNotification: flag.resolved_at
        ? 'Applicant can be notified that the dispute was resolved.'
        : 'Applicant can be notified that the record is flagged.',
    };
  }

  mapDisputedLandDetail(
    landDetail: LandDetail,
    applications: Application[],
    users: User[]
  ): DisputeRecord {
    const application = applications.find(
      (item) => item.application_id === landDetail.application
    );

    return {
      disputeFlagId: null,
      landDetailId: landDetail.land_detail_id,
      disputeReference: `LAND-${landDetail.land_detail_id}`,
      parcelNumber: landDetail.parcel_number,
      plotNumber: landDetail.plot_number,
      location: landDetail.property_location,
      applicant: application
        ? users.find((user) => user.user_id === application.user)?.full_name ||
          `User #${application.user}`
        : 'Not linked',
      disputeReason: 'Land detail is marked as disputed.',
      reportedDate: this.formatDate(landDetail.updated_at),
      assignedOfficer: 'Unassigned',
      status: 'Disputed',
      latestRemark: 'Derived from land detail dispute flag.',
      userNotification: 'Applicant can be notified that the land record is flagged.',
    };
  }

  normalizeDisputeStatus(status: string): DisputeStatus {
    const normalizedStatus = status.toLowerCase();

    if (normalizedStatus.includes('resolved')) {
      return 'Resolved';
    }

    if (normalizedStatus.includes('investigation') || normalizedStatus.includes('review')) {
      return 'Under Investigation';
    }

    return 'Disputed';
  }

  get filteredDisputes(): DisputeRecord[] {
    const normalizedSearch = this.searchTerm.trim().toLowerCase();

    return this.disputes.filter((dispute) => {
      const matchesSearch =
        !normalizedSearch ||
        dispute.disputeReference.toLowerCase().includes(normalizedSearch) ||
        dispute.parcelNumber.toLowerCase().includes(normalizedSearch) ||
        dispute.applicant.toLowerCase().includes(normalizedSearch) ||
        dispute.location.toLowerCase().includes(normalizedSearch);

      const matchesStatus =
        this.selectedStatus === 'All' || dispute.status === this.selectedStatus;

      return matchesSearch && matchesStatus;
    });
  }

  get activeDisputeCount(): number {
    return this.disputes.filter((dispute) => dispute.status === 'Disputed').length;
  }

  get investigationCount(): number {
    return this.disputes.filter((dispute) => dispute.status === 'Under Investigation')
      .length;
  }

  get resolvedCount(): number {
    return this.disputes.filter((dispute) => dispute.status === 'Resolved').length;
  }

  getStatusBadgeClass(status: DisputeStatus): string {
    const statusClasses: Record<DisputeStatus, string> = {
      Disputed: 'bg-red-100 text-red-800',
      'Under Investigation': 'bg-amber-100 text-amber-800',
      Resolved: 'bg-green-100 text-green-800',
    };

    return statusClasses[status];
  }

  selectDispute(dispute: DisputeRecord): void {
    this.selectedDispute = dispute;
    this.updatedStatus = dispute.status;
    this.adminRemark = dispute.latestRemark;
    this.notifyApplicant = true;
    this.actionMessage = '';
    this.actionMessageType = '';
  }

  clearFilters(): void {
    this.searchTerm = '';
    this.selectedStatus = 'All';
  }

  updateDispute(): void {
    if (!this.selectedDispute) {
      this.actionMessage = 'Select a dispute record before saving an update.';
      this.actionMessageType = 'error';
      return;
    }

    if (!this.adminRemark.trim()) {
      this.actionMessage = 'Enter an admin remark before saving the dispute update.';
      this.actionMessageType = 'error';
      return;
    }

    if (!this.adminUserId) {
      this.actionMessage = 'Your admin login session could not be found. Please sign in again.';
      this.actionMessageType = 'error';
      return;
    }

    // TODO: Persist dispute status, remark, and notification preference to the backend API.
    if (!this.selectedDispute.landDetailId) {
      this.actionMessage = 'This dispute is not linked to a backend land detail.';
      this.actionMessageType = 'error';
      return;
    }

    this.isSubmitting = true;

    const flagRequest = this.selectedDispute.disputeFlagId
      ? this.apiService.updateDisputeFlag(this.selectedDispute.disputeFlagId, {
          flag_reason: this.adminRemark,
          flag_status: this.updatedStatus,
        })
      : this.apiService.createDisputeFlag({
          flag_reason: this.adminRemark,
          flag_status: this.updatedStatus,
          flagged_at: new Date().toISOString(),
          land_detail: this.selectedDispute.landDetailId,
          flagged_by: this.adminUserId,
        });

    const landRequest = this.apiService.updateLandDetails(
      this.selectedDispute.landDetailId,
      {
        is_disputed: this.updatedStatus !== 'Resolved',
      }
    );

    forkJoin([flagRequest, landRequest]).subscribe({
      next: ([flag]) => {
        if (!this.selectedDispute) {
          return;
        }

        this.selectedDispute.disputeFlagId = flag.dispute_flag_id;
        this.selectedDispute.disputeReference = `DSP-${flag.dispute_flag_id}`;
        this.selectedDispute.status = this.updatedStatus;
        this.selectedDispute.latestRemark = this.adminRemark;
        this.selectedDispute.userNotification = this.notifyApplicant
          ? `Applicant notification prepared for ${this.updatedStatus.toLowerCase()} dispute status.`
          : 'Applicant notification not sent for this update.';

        this.actionMessage = `Dispute update saved for ${this.selectedDispute.disputeReference}.`;
        this.actionMessageType = 'success';
        this.isSubmitting = false;
        this.refreshDisputeRelatedData();
      },
      error: (error) => {
        console.error('Failed to save dispute update:', error);
        this.actionMessage =
          'Unable to save the dispute update to the server. Please try again.';
        this.actionMessageType = 'error';
        this.isSubmitting = false;
      },
    });
  }

  refreshDisputeRelatedData(): void {
    forkJoin({
      disputeFlags: this.apiService.getDisputeFlags(),
      notifications: this.apiService.getNotifications(),
    }).subscribe({
      next: () => this.loadDisputeRecords(),
      error: (error) => {
        console.error('Dispute saved, but refresh failed:', error);
      },
    });
  }

  formatDate(value: string): string {
    return new Date(value).toLocaleDateString();
  }
}
