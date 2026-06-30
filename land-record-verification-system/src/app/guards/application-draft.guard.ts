import { inject } from '@angular/core';
import { CanDeactivateFn } from '@angular/router';
import { ApplicationDraftService } from '../services/application-draft.service';

const normalNextSteps: Record<string, string> = {
  '/workflow-selection': '/application-form',
  '/application-form': '/document-upload',
  '/document-upload': '/payment',
  '/payment': '/application-summary',
  '/application-summary': '/application-status',
};

const unguardedNextRoutes = new Set([
  '/user-dashboard',
  '/verification',
  '/notifications',
  '/application-status',
  '/login',
  '/',
]);

function normalizeUrl(url: string): string {
  const path = url.split('?')[0].split('#')[0];
  return path.endsWith('/') && path.length > 1 ? path.slice(0, -1) : path;
}

export const applicationDraftGuard: CanDeactivateFn<unknown> = (
  _component,
  _currentRoute,
  currentState,
  nextState
) => {
  const draftService = inject(ApplicationDraftService);
  const currentUrl = normalizeUrl(currentState.url);
  const nextUrl = normalizeUrl(nextState?.url || '');
  const currentRawUrl = currentState.url || '';
  const nextRawUrl = nextState?.url || '';

  if (normalNextSteps[currentUrl] === nextUrl) {
    return true;
  }

  if (currentUrl === '/payment' && currentRawUrl.includes('verificationLogId=')) {
    return true;
  }

  if (nextUrl === '/payment' && nextRawUrl.includes('verificationLogId=')) {
    return true;
  }

  if (unguardedNextRoutes.has(nextUrl)) {
    return true;
  }

  return draftService.confirmDiscardInProgress();
};
