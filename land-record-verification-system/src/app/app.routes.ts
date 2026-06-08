import { Routes } from '@angular/router';
import { LandingPage } from './landing-page/landing-page';
import { LoginPage } from './login-page/login-page';
import { SignupPage } from './signup-page/signup-page';
import { AdminDashboard } from './admin-dashboard/admin-dashboard';
import { UserDashboard } from './user-dashboard/user-dashboard';

import { WorkflowSelection } from './pages/workflow-selection/workflow-selection';
import { ApplicationForm } from './pages/application-form/application-form';
import { DocumentUpload } from './pages/document-upload/document-upload';
import { ApplicationSummary } from './pages/application-summary/application-summary';
import { ApplicationStatus } from './pages/application-status/application-status';
import { VerificationPage } from './pages/verification-page/verification-page';
import { NotificationsPage } from './pages/notifications-page/notifications-page';
import { PaymentPage } from './pages/payment-page/payment-page';

import { AdminApplications } from './pages/admin-applications/admin-applications';
import { AdminReview } from './pages/admin-review/admin-review';
import { AdminVerification } from './pages/admin-verification/admin-verification';
import { AdminDisputes } from './pages/admin-disputes/admin-disputes';
import { AdminLogs } from './pages/admin-logs/admin-logs';
import { AdminPayments } from './pages/admin-payments/admin-payments';
import { adminGuard, applicantGuard } from './guards/role.guard';
import { applicationDraftGuard } from './guards/application-draft.guard';

export const routes: Routes = [
  { path: '', component: LandingPage },

  // Auth
  { path: 'login', component: LoginPage },
  { path: 'signup', component: SignupPage },

  // Applicant side
  { path: 'user-dashboard', component: UserDashboard, canActivate: [applicantGuard] },
  { path: 'workflow-selection', component: WorkflowSelection, canActivate: [applicantGuard], canDeactivate: [applicationDraftGuard] },
  { path: 'application-form', component: ApplicationForm, canActivate: [applicantGuard], canDeactivate: [applicationDraftGuard] },
  { path: 'document-upload', component: DocumentUpload, canActivate: [applicantGuard], canDeactivate: [applicationDraftGuard] },
  { path: 'application-summary', component: ApplicationSummary, canActivate: [applicantGuard], canDeactivate: [applicationDraftGuard] },
  { path: 'application-status', component: ApplicationStatus, canActivate: [applicantGuard] },
  { path: 'verification', component: VerificationPage, canActivate: [applicantGuard] },
  { path: 'notifications', component: NotificationsPage, canActivate: [applicantGuard] },
  { path: 'payment', component: PaymentPage, canActivate: [applicantGuard], canDeactivate: [applicationDraftGuard] },

  // Admin side
  { path: 'admin-dashboard', component: AdminDashboard, canActivate: [adminGuard] },
  { path: 'admin/applications', component: AdminApplications, canActivate: [adminGuard] },
  { path: 'admin/review', component: AdminReview, canActivate: [adminGuard] },
  { path: 'admin/verification', component: AdminVerification, canActivate: [adminGuard] },
  { path: 'admin/disputes', component: AdminDisputes, canActivate: [adminGuard] },
  { path: 'admin/logs', component: AdminLogs, canActivate: [adminGuard] },
  { path: 'admin/payments', component: AdminPayments, canActivate: [adminGuard] },

  // Fallback
  { path: '**', redirectTo: '' },
];
