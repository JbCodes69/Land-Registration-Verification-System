import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AdminApplications } from './admin-applications';

describe('AdminApplications', () => {
  let component: AdminApplications;
  let fixture: ComponentFixture<AdminApplications>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminApplications]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AdminApplications);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
