import { Component, HostListener, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ApplicationDraftService } from './services/application-draft.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected readonly title = signal('land-record-verification-system');

  constructor(private applicationDraftService: ApplicationDraftService) {}

  @HostListener('window:beforeunload', ['$event'])
  warnBeforeBrowserLeave(event: BeforeUnloadEvent): void {
    if (!this.applicationDraftService.hasInProgressDraft()) {
      return;
    }

    event.preventDefault();
    event.returnValue = this.applicationDraftService.discardWarningMessage;
  }

  @HostListener('window:pagehide')
  clearDraftAfterBrowserLeave(): void {
    if (this.applicationDraftService.hasInProgressDraft()) {
      this.applicationDraftService.clearDraft();
    }
  }
}
