import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const applicantGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const currentUser = authService.getCurrentUser();

  if (!currentUser || !authService.getAccessToken()) {
    return router.createUrlTree(['/login']);
  }

  if (authService.isApplicant(currentUser)) {
    return true;
  }

  return router.parseUrl(authService.getDashboardRoute(currentUser));
};

export const adminGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const currentUser = authService.getCurrentUser();

  if (!currentUser || !authService.getAccessToken()) {
    return router.createUrlTree(['/login']);
  }

  if (authService.isAdministrator(currentUser)) {
    return true;
  }

  return router.parseUrl(authService.getDashboardRoute(currentUser));
};
