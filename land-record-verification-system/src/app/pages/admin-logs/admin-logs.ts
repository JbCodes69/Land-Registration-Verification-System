import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { ApiService } from '../../services/api.service';
import {
  Application,
  AuditLog as BackendAuditLog,
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
  status: LogStatus;
}

@Component({
  selector: 'app-admin-logs',
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './admin-logs.html',
  styleUrl: './admin-logs.css',
})
export class AdminLogs {
  adminName: string = 'Administrator';
  isLoading: boolean = false;
  errorMessage: string = '';

  searchTerm: string = '';
  selectedStatus: string = 'All';
  selectedModule: string = 'All';

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
      auditLogs: this.apiService.getAuditLogs(),
      users: this.apiService.getUsers(),
      applications: this.apiService.getApplications(),
    }).subscribe({
      next: ({ auditLogs, users, applications }) => {
        this.auditLogs = auditLogs
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
      error: (error) => {
        console.error('Failed to load audit logs:', error);
        this.errorMessage = 'Unable to load audit logs from the server.';
        this.isLoading = false;
      },
    });
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

    return {
      id: `LOG-${log.audit_log_id}`,
      user: user?.full_name || `User #${log.user}`,
      role: this.getRoleLabel(user?.role),
      action: log.action_description,
      module: this.getModuleName(log.action_type),
      reference: application?.application_code || `Application #${log.application}`,
      dateTime: this.formatDateTime(log.created_at),
      status: this.getLogStatus(log.action_type, log.action_description),
    };
  }

  getRoleLabel(roleId?: number): string {
    if (roleId === 2) {
      return 'Admin';
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

  getLogStatus(actionType: string, description: string): LogStatus {
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
        !normalizedSearch ||
        log.user.toLowerCase().includes(normalizedSearch) ||
        log.action.toLowerCase().includes(normalizedSearch) ||
        log.reference.toLowerCase().includes(normalizedSearch) ||
        log.id.toLowerCase().includes(normalizedSearch);

      const matchesStatus =
        this.selectedStatus === 'All' || log.status === this.selectedStatus;

      const matchesModule =
        this.selectedModule === 'All' || log.module === this.selectedModule;

      return matchesSearch && matchesStatus && matchesModule;
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
  }

  formatDateTime(value: string): string {
    return new Date(value).toLocaleString();
  }
}
