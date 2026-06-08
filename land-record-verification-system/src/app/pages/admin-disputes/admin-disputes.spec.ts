import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AdminDisputes } from './admin-disputes';

describe('AdminDisputes', () => {
  let component: AdminDisputes;
  let fixture: ComponentFixture<AdminDisputes>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminDisputes]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AdminDisputes);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
