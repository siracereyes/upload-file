export enum AssignmentType {
  NAIL_CARE = 'Nail Care',
  ACUPRESSURE = 'Acupressure Massage'
}

export interface StudentSubmission {
  firstName: string;
  lastName: string;
  section: string;
  assignmentType: AssignmentType;
  file: File | null;
}

export interface UploadStatus {
  state: 'idle' | 'analyzing' | 'uploading' | 'success' | 'error';
  message: string;
  renamedFileName?: string;
  aiFeedback?: string;
}
