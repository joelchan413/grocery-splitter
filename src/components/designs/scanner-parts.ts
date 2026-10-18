import type { ReactNode } from 'react';

// Both presentations receive the same controls, so changing designs never resets a scan.
export interface ScannerParts {
  onChoosePhotos: () => void;
  payer: ReactNode;
  upload: ReactNode;
  samples: ReactNode;
  error: ReactNode;
}
