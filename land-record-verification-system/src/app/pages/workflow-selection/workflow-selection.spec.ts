import { ComponentFixture, TestBed } from '@angular/core/testing';

import { WorkflowSelection } from './workflow-selection';

describe('WorkflowSelection', () => {
  let component: WorkflowSelection;
  let fixture: ComponentFixture<WorkflowSelection>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WorkflowSelection]
    })
    .compileComponents();

    fixture = TestBed.createComponent(WorkflowSelection);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
