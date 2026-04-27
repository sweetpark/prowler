import axios from 'axios';

// Docker 배포 시 nginx가 /api/ 프록시 처리 → 빈 문자열(상대경로)
// 로컬 개발 시 VITE_API_URL=http://localhost:8000 (.env.local에 설정)
const BASE_URL = import.meta.env.VITE_API_URL ?? '';

export const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

export interface ScanRequest {
  provider?: string;
  services?: string[];
  checks?: string[];
  severity?: string[];
  region?: string;
  compliance?: string;
}

export interface FindingSummary {
  check_id: string;
  check_title: string;
  check_title_ko?: string;
  service_name: string;
  severity: string;
  status: string;
  resource_id?: string;
  resource_arn?: string;
  region?: string;
  description?: string;
  description_ko?: string;
  remediation?: string;
  remediation_ko?: string;
  account_id?: string;
  namespace?: string;
  cluster?: string;
}

export interface ScanResult {
  scan_id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  provider: string;
  started_at?: string;
  completed_at?: string;
  error_message?: string;
  total: number;
  passed: number;
  failed: number;
  error_count: number;
  findings: FindingSummary[];
  services_summary: Record<string, Record<string, number>>;
  severity_summary: Record<string, number>;
  compliance?: string;
  account_ids: string[];
  regions: string[];
}

export interface ComplianceItem {
  value: string;
  label: string;
}

export interface DashboardStats {
  last_scan_id?: string;
  last_scan_at?: string;
  total_checks: number;
  passed: number;
  failed: number;
  error_count: number;
  severity_breakdown: Record<string, number>;
  service_breakdown: Record<string, number>;
  top_failed_checks: FindingSummary[];
}

export interface ServerConfig {
  translation_enabled: boolean;
  claude_model: string | null;
}

// API 함수들
export const getConfig = () =>
  api.get<ServerConfig>('/api/config');

export const startScan = (req: ScanRequest) =>
  api.post<{ scan_id: string; message: string }>('/api/scan', req);

export const getScan = (scanId: string) =>
  api.get<ScanResult>(`/api/scan/${scanId}`);

export const getDashboard = () =>
  api.get<DashboardStats>('/api/dashboard');

export const getServices = () =>
  api.get<{ services: string[] }>('/api/services');

export const getScans = () =>
  api.get<ScanResult[]>('/api/scans');

export const getCompliances = () =>
  api.get<{ compliances: Record<string, ComplianceItem[]> }>('/api/compliances');
