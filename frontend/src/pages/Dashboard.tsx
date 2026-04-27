import { useEffect, useState, useMemo } from 'react';
import {
  PieChart, Pie, Cell, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';
import { ShieldAlert, ShieldCheck, AlertTriangle, Activity } from 'lucide-react';
import { getDashboard, getScans, getScan, DashboardStats, FindingSummary, ScanResult } from '../api/client';

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#dc2626',
  high:     '#f97316',
  medium:   '#eab308',
  low:      '#3b82f6',
  informational: '#6b7280',
};

const SEVERITY_LABELS: Record<string, string> = {
  critical: '심각',
  high:     '높음',
  medium:   '중간',
  low:      '낮음',
  informational: '정보',
};

const STATUS_BADGE: Record<string, string> = {
  FAIL: 'bg-red-100 text-red-700',
  PASS: 'bg-green-100 text-green-700',
  ERROR: 'bg-gray-100 text-gray-700',
};

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [latestScan, setLatestScan] = useState<ScanResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedAccount, setSelectedAccount] = useState<string>('all');
  const [selectedRegion, setSelectedRegion] = useState<string>('all');

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchAll = async () => {
    try {
      const [dashRes, scansRes] = await Promise.all([getDashboard(), getScans()]);
      setStats(dashRes.data);

      const completed = scansRes.data
        .filter(s => s.status === 'completed')
        .sort((a, b) => {
          const ta = a.completed_at ?? a.started_at ?? '';
          const tb = b.completed_at ?? b.started_at ?? '';
          return tb.localeCompare(ta);
        });

      if (completed.length > 0) {
        const fullScan = await getScan(completed[0].scan_id);
        setLatestScan(fullScan.data);
      }
    } catch (e) {
      console.error('대시보드 로드 실패:', e);
    } finally {
      setLoading(false);
    }
  };

  // 필터 적용된 top_failed_checks
  const filteredTopFailed = useMemo<FindingSummary[]>(() => {
    if (!stats) return [];
    return stats.top_failed_checks.filter(f => {
      const accountOk = selectedAccount === 'all' || f.account_id === selectedAccount;
      const regionOk = selectedRegion === 'all' || f.region === selectedRegion;
      return accountOk && regionOk;
    });
  }, [stats, selectedAccount, selectedRegion]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!stats || stats.total_checks === 0) {
    return (
      <div className="text-center py-20">
        <ShieldAlert className="mx-auto h-16 w-16 text-gray-300 mb-4" />
        <p className="text-gray-500 text-lg">아직 스캔 결과가 없습니다.</p>
        <p className="text-gray-400 mt-1">상단의 "새 스캔 실행" 버튼으로 시작하세요.</p>
      </div>
    );
  }

  // 심각도 파이 차트 데이터
  const severityData = Object.entries(stats.severity_breakdown)
    .filter(([, v]) => v > 0)
    .map(([key, value]) => ({
      name: SEVERITY_LABELS[key] || key,
      value,
      color: SEVERITY_COLORS[key] || '#999',
    }));

  // 서비스별 실패 바 차트 데이터
  const serviceData = Object.entries(stats.service_breakdown)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8)
    .map(([name, failed]) => ({ name, failed }));

  const passRate = stats.total_checks > 0
    ? Math.round((stats.passed / stats.total_checks) * 100)
    : 0;

  return (
    <div className="space-y-6">
      {/* 마지막 스캔 시간 */}
      {stats.last_scan_at && (
        <p className="text-sm text-gray-500">
          마지막 스캔: {new Date(stats.last_scan_at).toLocaleString('ko-KR')}
        </p>
      )}

      {/* 필터 바 */}
      <div className="bg-white rounded-xl shadow-sm border px-5 py-4 flex flex-wrap items-center gap-4">
        {/* Account 드롭다운 */}
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-600 whitespace-nowrap">계정</label>
          <select
            value={selectedAccount}
            onChange={e => setSelectedAccount(e.target.value)}
            className="text-sm border rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            <option value="all">전체</option>
            {(latestScan?.account_ids ?? []).map(id => (
              <option key={id} value={id}>{id}</option>
            ))}
          </select>
        </div>

        {/* Region 드롭다운 */}
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-600 whitespace-nowrap">리전</label>
          <select
            value={selectedRegion}
            onChange={e => setSelectedRegion(e.target.value)}
            className="text-sm border rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            <option value="all">전체</option>
            {(latestScan?.regions ?? []).map(r => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>

        {/* Compliance 표시 (읽기 전용) */}
        {latestScan?.compliance && (
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-600 whitespace-nowrap">컴플라이언스</label>
            <span className="text-sm px-2.5 py-1 bg-blue-50 text-blue-700 rounded-lg border border-blue-200">
              {latestScan.compliance} <span className="text-blue-400 text-xs">(스캔 설정)</span>
            </span>
          </div>
        )}
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          icon={<Activity className="h-6 w-6 text-blue-600" />}
          label="전체 점검"
          value={stats.total_checks}
          bg="bg-blue-50"
        />
        <StatCard
          icon={<ShieldCheck className="h-6 w-6 text-green-600" />}
          label="통과"
          value={`${stats.passed} (${passRate}%)`}
          bg="bg-green-50"
        />
        <StatCard
          icon={<ShieldAlert className="h-6 w-6 text-red-600" />}
          label="실패"
          value={stats.failed}
          bg="bg-red-50"
        />
        <StatCard
          icon={<AlertTriangle className="h-6 w-6 text-yellow-600" />}
          label="오류"
          value={stats.error_count}
          bg="bg-yellow-50"
        />
      </div>

      {/* 차트 영역 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 심각도별 파이 차트 */}
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h3 className="text-base font-semibold text-gray-800 mb-4">심각도별 분포</h3>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie
                data={severityData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={90}
                label={({ name, percent }) =>
                  `${name} ${(percent * 100).toFixed(0)}%`
                }
              >
                {severityData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip formatter={(v) => [`${v}건`, '']} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* 서비스별 실패 바 차트 */}
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h3 className="text-base font-semibold text-gray-800 mb-4">서비스별 실패 현황</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={serviceData} layout="vertical">
              <XAxis type="number" tick={{ fontSize: 12 }} />
              <YAxis dataKey="name" type="category" width={80} tick={{ fontSize: 12 }} />
              <Tooltip formatter={(v) => [`${v}건`, '실패']} />
              <Bar dataKey="failed" fill="#f97316" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 주요 실패 항목 */}
      <div className="bg-white rounded-xl shadow-sm border">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h3 className="text-base font-semibold text-gray-800">주요 실패 항목</h3>
          {(selectedAccount !== 'all' || selectedRegion !== 'all') && (
            <span className="text-xs text-gray-400">
              필터 적용됨 — {filteredTopFailed.length}건
            </span>
          )}
        </div>
        <div className="divide-y">
          {filteredTopFailed.length > 0 ? (
            filteredTopFailed.slice(0, 10).map((f, i) => (
              <FindingRow key={i} finding={f} />
            ))
          ) : (
            <p className="text-sm text-gray-400 text-center py-8">선택한 필터에 해당하는 실패 항목이 없습니다.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon, label, value, bg,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  bg: string;
}) {
  return (
    <div className={`${bg} rounded-xl p-4 flex items-center gap-4`}>
      <div className="shrink-0">{icon}</div>
      <div>
        <p className="text-xs text-gray-500 font-medium">{label}</p>
        <p className="text-xl font-bold text-gray-800">{value}</p>
      </div>
    </div>
  );
}

function FindingRow({ finding }: { finding: FindingSummary }) {
  const [expanded, setExpanded] = useState(false);
  const badge = SEVERITY_COLORS[finding.severity] || '#999';
  const statusClass = STATUS_BADGE[finding.status] || 'bg-gray-100 text-gray-700';

  return (
    <div className="px-6 py-4 cursor-pointer hover:bg-gray-50"
         onClick={() => setExpanded(!expanded)}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className="inline-block w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: badge }}
            />
            <span className="text-sm font-medium text-gray-800 truncate">
              {finding.check_title_ko || finding.check_title}
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            {finding.service_name.toUpperCase()} · {finding.region || '전체'} · {finding.check_id}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusClass}`}>
            {finding.status === 'FAIL' ? '실패' : finding.status === 'PASS' ? '통과' : finding.status}
          </span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
            {SEVERITY_LABELS[finding.severity] || finding.severity}
          </span>
        </div>
      </div>

      {expanded && (
        <div className="mt-3 text-sm text-gray-600 space-y-2">
          {(finding.description_ko || finding.description) && (
            <p>
              <span className="font-medium">설명: </span>
              {finding.description_ko || finding.description}
            </p>
          )}
          {(finding.remediation_ko || finding.remediation) && (
            <p>
              <span className="font-medium text-blue-600">조치방법: </span>
              {finding.remediation_ko || finding.remediation}
            </p>
          )}
          {finding.resource_arn && (
            <p className="text-xs text-gray-400 font-mono">{finding.resource_arn}</p>
          )}
        </div>
      )}
    </div>
  );
}
