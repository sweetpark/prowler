import { useEffect, useState } from 'react';
import {
  CheckCircle2, XCircle, Clock, Loader2,
  ChevronDown, ChevronUp, RefreshCw,
  Shield, MapPin, Server, Tag, AlertTriangle,
} from 'lucide-react';
import { getScans, getScan, ScanResult, FindingSummary } from '../api/client';

const SEVERITY_COLORS: Record<string, string> = {
  critical:      '#dc2626',
  high:          '#f97316',
  medium:        '#eab308',
  low:           '#3b82f6',
  informational: '#6b7280',
};

const SEVERITY_LABELS: Record<string, string> = {
  critical:      '심각',
  high:          '높음',
  medium:        '중간',
  low:           '낮음',
  informational: '정보',
};

const STATUS_CONFIG: Record<string, { label: string; icon: React.ReactNode; badge: string }> = {
  pending:   { label: '대기 중', icon: <Clock className="h-4 w-4 text-gray-400" />,               badge: 'bg-gray-100 text-gray-600' },
  running:   { label: '실행 중', icon: <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />, badge: 'bg-blue-100 text-blue-700' },
  completed: { label: '완료',    icon: <CheckCircle2 className="h-4 w-4 text-green-500" />,        badge: 'bg-green-100 text-green-700' },
  failed:    { label: '실패',    icon: <XCircle className="h-4 w-4 text-red-500" />,               badge: 'bg-red-100 text-red-700' },
};

function formatDuration(started?: string, completed?: string): string {
  if (!started || !completed) return '-';
  const sec = Math.round((new Date(completed).getTime() - new Date(started).getTime()) / 1000);
  if (sec < 60) return `${sec}초`;
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  return rem > 0 ? `${min}분 ${rem}초` : `${min}분`;
}

// ─────────────────────────────────────────────
export default function ScanHistory() {
  const [scans, setScans]       = useState<ScanResult[]>([]);
  const [loading, setLoading]   = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detailMap, setDetailMap]   = useState<Record<string, ScanResult>>({});

  const fetchScans = async () => {
    setLoading(true);
    try {
      const res = await getScans();
      setScans(
        res.data.sort((a, b) => (b.started_at ?? '').localeCompare(a.started_at ?? '')),
      );
    } catch (e) {
      console.error('스캔 목록 로드 실패:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchScans(); }, []);

  const handleToggle = async (scanId: string) => {
    if (expandedId === scanId) { setExpandedId(null); return; }
    setExpandedId(scanId);
    if (!detailMap[scanId]) {
      const res = await getScan(scanId);
      setDetailMap(prev => ({ ...prev, [scanId]: res.data }));
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">총 {scans.length}건 · SQLite에 영구 저장됩니다</p>
        <button
          onClick={fetchScans}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-blue-600 transition-colors"
        >
          <RefreshCw className="h-4 w-4" />새로고침
        </button>
      </div>

      {scans.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-xl border">
          <Clock className="mx-auto h-14 w-14 text-gray-200 mb-3" />
          <p className="text-gray-500">스캔 이력이 없습니다.</p>
          <p className="text-gray-400 text-sm mt-1">스캔 실행 탭에서 새 스캔을 시작하세요.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {scans.map(scan => {
            const cfg        = STATUS_CONFIG[scan.status] ?? STATUS_CONFIG.pending;
            const detail     = detailMap[scan.scan_id];
            const isExpanded = expandedId === scan.scan_id;
            const passRate   = scan.total > 0 ? Math.round((scan.passed / scan.total) * 100) : 0;
            const compliances: string[] = Array.isArray(scan.compliance)
              ? scan.compliance
              : scan.compliance ? [scan.compliance as unknown as string] : [];

            return (
              <div key={scan.scan_id} className="bg-white rounded-xl border shadow-sm overflow-hidden">

                {/* ── 요약 행 ── */}
                <button
                  className="w-full px-6 py-4 flex items-center gap-4 hover:bg-gray-50 transition-colors text-left"
                  onClick={() => handleToggle(scan.scan_id)}
                >
                  {cfg.icon}

                  <div className="flex-1 min-w-0 space-y-1">
                    {/* 상태 + 컴플라이언스 태그 */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cfg.badge}`}>
                        {cfg.label}
                      </span>
                      {compliances.length === 0 && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                          전체 점검
                        </span>
                      )}
                      {compliances.slice(0, 2).map(c => (
                        <span key={c} className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium truncate max-w-[180px]">
                          {c}
                        </span>
                      ))}
                      {compliances.length > 2 && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-purple-50 text-purple-500">
                          +{compliances.length - 2}개
                        </span>
                      )}
                    </div>
                    {/* 날짜 + 리전 */}
                    <p className="text-xs text-gray-400">
                      {scan.started_at ? new Date(scan.started_at).toLocaleString('ko-KR') : '-'}
                      {scan.regions.length > 0 && ` · ${scan.regions.slice(0, 3).join(', ')}${scan.regions.length > 3 ? ` 외 ${scan.regions.length - 3}개` : ''}`}
                      <span className="font-mono ml-2 text-gray-300">{scan.scan_id.slice(0, 8)}...</span>
                    </p>
                  </div>

                  {/* 통계 */}
                  {scan.status === 'completed' && (
                    <div className="flex items-center gap-4 shrink-0 text-sm">
                      <div className="text-center"><p className="font-bold text-gray-800">{scan.total}</p><p className="text-xs text-gray-400">전체</p></div>
                      <div className="text-center"><p className="font-bold text-green-600">{scan.passed}</p><p className="text-xs text-gray-400">통과</p></div>
                      <div className="text-center"><p className="font-bold text-red-600">{scan.failed}</p><p className="text-xs text-gray-400">실패</p></div>
                      <div className="text-center w-12"><p className="font-bold text-blue-600">{passRate}%</p><p className="text-xs text-gray-400">통과율</p></div>
                    </div>
                  )}

                  {isExpanded
                    ? <ChevronUp className="h-4 w-4 text-gray-400 shrink-0" />
                    : <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />}
                </button>

                {/* ── 상세 펼침 ── */}
                {isExpanded && (
                  <div className="border-t">
                    {!detail ? (
                      <div className="flex justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
                      </div>
                    ) : detail.status === 'failed' ? (
                      <div className="px-6 py-4">
                        <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-2">
                          {detail.error_message || '알 수 없는 오류'}
                        </p>
                      </div>
                    ) : (
                      <div className="divide-y">
                        {/* 스캔 정보 패널 */}
                        <ScanInfoPanel scan={detail} compliances={compliances} />
                        {/* 점검 결과 */}
                        <div className="px-6 py-4">
                          <FindingList findings={detail.findings} />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
function ScanInfoPanel({ scan, compliances }: { scan: ScanResult; compliances: string[] }) {
  const services = Object.keys(scan.services_summary ?? {}).sort();
  const duration = formatDuration(scan.started_at, scan.completed_at);

  return (
    <div className="px-6 py-4 bg-gray-50 space-y-4">
      <h4 className="text-sm font-semibold text-gray-700">스캔 정보</h4>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* 컴플라이언스 프레임워크 */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500">
            <Shield className="h-3.5 w-3.5" />컴플라이언스 프레임워크
          </div>
          <div className="flex flex-wrap gap-1.5">
            {compliances.length > 0 ? compliances.map(c => (
              <span key={c} className="text-xs px-2.5 py-1 rounded-lg bg-purple-100 text-purple-800 border border-purple-200 font-medium">
                {c}
              </span>
            )) : (
              <span className="text-xs px-2.5 py-1 rounded-lg bg-gray-100 text-gray-500">전체 점검 (컴플라이언스 미선택)</span>
            )}
          </div>
        </div>

        {/* 점검 리전 */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500">
            <MapPin className="h-3.5 w-3.5" />점검 리전
          </div>
          <div className="flex flex-wrap gap-1.5">
            {scan.regions.length > 0 ? scan.regions.map(r => (
              <span key={r} className="text-xs px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 border border-blue-100">
                {r}
              </span>
            )) : (
              <span className="text-xs px-2.5 py-1 rounded-lg bg-gray-100 text-gray-500">전체 리전</span>
            )}
          </div>
        </div>

        {/* 점검 서비스 */}
        <div className="space-y-1.5 md:col-span-2">
          <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500">
            <Server className="h-3.5 w-3.5" />점검된 서비스 ({services.length}개)
          </div>
          <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
            {services.map(svc => {
              const data = scan.services_summary[svc];
              const hasFail = data?.failed > 0;
              return (
                <span
                  key={svc}
                  className={`text-xs px-2.5 py-1 rounded-lg border font-medium ${
                    hasFail
                      ? 'bg-red-50 text-red-700 border-red-200'
                      : 'bg-green-50 text-green-700 border-green-200'
                  }`}
                >
                  {svc.toUpperCase()}
                  {hasFail && <span className="ml-1 text-red-400">✕{data.failed}</span>}
                </span>
              );
            })}
          </div>
        </div>

        {/* 메타 정보 */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500">
            <Tag className="h-3.5 w-3.5" />계정 ID
          </div>
          <div className="flex flex-wrap gap-1.5">
            {scan.account_ids.length > 0 ? scan.account_ids.map(id => (
              <span key={id} className="text-xs px-2.5 py-1 rounded-lg bg-gray-100 text-gray-700 font-mono">
                {id}
              </span>
            )) : <span className="text-xs text-gray-400">-</span>}
          </div>
        </div>

        {/* 소요 시간 */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500">
            <AlertTriangle className="h-3.5 w-3.5" />점검 소요 시간
          </div>
          <span className="text-xs px-2.5 py-1 rounded-lg bg-gray-100 text-gray-700 inline-block">
            {duration}
          </span>
        </div>

      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
function FindingList({ findings }: { findings: FindingSummary[] }) {
  const [filter, setFilter] = useState<'ALL' | 'FAIL' | 'PASS'>('FAIL');

  const filtered = findings.filter(f => filter === 'ALL' || f.status === filter);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-gray-700">점검 결과</h4>
        <div className="flex gap-2">
          {(['FAIL', 'PASS', 'ALL'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                filter === f
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'
              }`}
            >
              {f === 'FAIL' ? `실패 (${findings.filter(x => x.status === 'FAIL').length})` :
               f === 'PASS' ? `통과 (${findings.filter(x => x.status === 'PASS').length})` :
               `전체 (${findings.length})`}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2 max-h-96 overflow-y-auto">
        {filtered.slice(0, 100).map((f, i) => <FindingRow key={i} finding={f} />)}
        {filtered.length > 100 && (
          <p className="text-xs text-gray-400 text-center py-2">상위 100건만 표시됩니다.</p>
        )}
        {filtered.length === 0 && (
          <p className="text-xs text-gray-400 text-center py-6">해당하는 항목이 없습니다.</p>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
function FindingRow({ finding }: { finding: FindingSummary }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className="text-sm border rounded-lg px-4 py-3 bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors"
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="inline-block w-2 h-2 rounded-full shrink-0 mt-0.5"
            style={{ backgroundColor: SEVERITY_COLORS[finding.severity] || '#999' }}
          />
          <p className="font-medium text-gray-800 truncate">
            {finding.check_title_ko || finding.check_title}
          </p>
        </div>
        <span className="text-xs px-2 py-0.5 rounded-full shrink-0 bg-gray-200 text-gray-600">
          {SEVERITY_LABELS[finding.severity] || finding.severity}
        </span>
      </div>
      <p className="text-xs text-gray-400 mt-0.5 ml-4">
        {finding.service_name.toUpperCase()} · {finding.region || '전체'} · {finding.check_id}
      </p>

      {expanded && (
        <div className="mt-2 ml-4 space-y-1 text-xs text-gray-600">
          {(finding.description_ko || finding.description) && (
            <p><span className="font-medium">설명: </span>{finding.description_ko || finding.description}</p>
          )}
          {(finding.remediation_ko || finding.remediation) && (
            <p><span className="font-medium text-blue-600">조치방법: </span>{finding.remediation_ko || finding.remediation}</p>
          )}
          {finding.resource_arn && (
            <p className="font-mono text-gray-400 break-all">{finding.resource_arn}</p>
          )}
        </div>
      )}
    </div>
  );
}
