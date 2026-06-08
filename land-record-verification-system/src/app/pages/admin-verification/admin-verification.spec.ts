import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AdminVerification } from './admin-verification';

describe('AdminVerification', () => {
  let component: AdminVerification;
  let fixture: ComponentFixture<AdminVerification>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminVerification]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AdminVerification);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
