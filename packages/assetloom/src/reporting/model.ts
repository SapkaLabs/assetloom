export type ReportAssetStatus =
  | 'valid'
  | 'modified'
  | 'missing'
  | 'untracked'
  | 'invalid';

export interface ReportMedia {
  readonly kind: 'image' | 'text' | 'binary';
  readonly mimeType: string;
  readonly dataUrl?: string;
  readonly text?: string;
}

export interface ReportSource {
  readonly path: string;
  readonly name: string;
  readonly bytes?: number;
  readonly sha256?: string;
  readonly media?: ReportMedia;
}

export interface ReportOutput {
  readonly taskId: string;
  readonly label: string;
  readonly path: string;
  readonly target: string;
  readonly operation: string;
  readonly format?: string;
  readonly expectedFormat?: string;
  readonly width?: number;
  readonly height?: number;
  readonly expectedWidth?: number;
  readonly expectedHeight?: number;
  readonly hasAlpha?: boolean;
  readonly bytes?: number;
  readonly expectedSha256?: string;
  readonly actualSha256?: string;
  readonly status: ReportAssetStatus;
  readonly managed: boolean;
  readonly media?: ReportMedia;
}

export interface ReportResource {
  readonly id: string;
  readonly title: string;
  readonly type: string;
  readonly targets: readonly string[];
  readonly config: unknown;
  readonly sources: readonly ReportSource[];
  readonly outputs: readonly ReportOutput[];
  readonly issues: number;
}

export interface ReportTargetOutputs {
  readonly outputs: readonly ReportOutput[];
  readonly issues: number;
}

export interface ReportModel {
  readonly configurationName: string;
  readonly description?: string;
  readonly fingerprint: string;
  readonly configurationFiles: readonly string[];
  readonly targets: readonly string[];
  readonly resources: readonly ReportResource[];
  readonly targetOutputs: ReportTargetOutputs;
  readonly effectiveConfiguration: string;
  readonly sources: number;
  readonly outputs: number;
  readonly validOutputs: number;
  readonly issues: number;
}
