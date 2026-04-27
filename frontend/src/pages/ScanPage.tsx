import { useEffect, useState } from 'react';
import { Play, Loader2, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { startScan, getScan, getServices, ScanResult } from '../api/client';

const SEVERITY_OPTIONS = [
  { value: 'critical', label: '심각 (Critical)' },
  { value: 'high',     label: '높음 (High)' },
  { value: 'medium',   label: '중간 (Medium)' },
  { value: 'low',      label: '낮음 (Low)' },
];

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'text-red-600',
  high: 'text-orange-500',
  medium: 'text-yellow-500',
  low: 'text-blue-500',
  informational: 'text-gray-400',
};

export default function ScanPage({ translationEnabled = true }: { translationEnabled?: boolean }) {
  const [services, setServices] = useState<string[]>([]);
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [selectedSeverity, setSelectedSeverity] = useState<string[]>([]);
  const [region, setRegion] = useState('ap-northeast-2');
  const [scanning, setScanning] = useState(false);
  const [currentScan, setCurrentScan] = useState<ScanResult | null>(null);
  const [pollInterval, setPollInterval] = useState<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    getServices().then(r => setServices(r.data.services));
    return () => { if (pollInterval) clearInterval(pollInterval); };
  }, []);

  const handleStartScan = async () => {
    setScanning(true);
    setCurrentScan(null);

    try {
      const res = await startScan({
        provider: 'aws',
        services: selectedServices.length > 0 ? selectedServices : undefined,
        severity: selectedSeverity.length > 0 ? selectedSeverity : undefined,
        region: region || undefined,
      });

      const { scan_id } = res.data;

      // 폴링 시작
      const interval = setInterval(async () => {
        const scanRes = await getScan(scan_id);
        setCurrentScan(scanRes.data);

        if (['completed', 'failed'].includes(scanRes.data.status)) {
          clearInterval(interval);
          setScanning(false);
          setPollInterval(null);
        }
      }, 3000);

      setPollInterval(interval);
    } catch (e) {
      console.error('스캔 시작 실패:', e);
      setScanning(false);
    }
  };

  const toggleService = (svc: string) => {
    setSelectedServices(prev =>
      prev.includes(svc) ? prev.filter(s => s !== svc) : [...prev, svc]
    );
  };

  const toggleSeverity = (sev: string) => {
    setSelectedSeverity(prev =>
      prev.includes(sev) ? prev.filter(s => s !== sev) : [...prev, sev]
    );
  };

  return (
    <div className="space-y-6">
      {/* 스캔 설정 */}
      <div className="bg-white rounded-xl shadow-sm border p-6">
        <h2 className="text-base font-semibold text-gray-800 mb-5">스캔 설정</h2>

        {/* 리전 */}
        <div className="mb-5">
          <label className="block text-sm font-medium text-gray-700 mb-1.5">AWS 리전</label>
          <input
            type="text"
            value={region}
            onChange={e => setRegion(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm w-48 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="ap-northeast-2"
          />
        </div>

        {/* 심각도 필터 */}
        <div className="mb-5">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            심각도 필터 <span className="text-gray-400 font-normal">(선택 안하면 전체)</span>
          </label>
          <div className="flex flex-wrap gap-2">
            {SEVERITY_OPTIONS.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => toggleSeverity(value)}
                className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                  selectedSeverity.includes(value)
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* 서비스 선택 */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            서비스 선택 <span className="text-gray-400 font-normal">(선택 안하면 전체)</span>
          </label>
          <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto p-2 border rounded-lg bg-gray-50">
            {services.map(svc => (
              <button
                key={svc}
                onClick={() => toggleService(svc)}
                className={`px-2.5 py-1 rounded text-xs border transition-colors ${
                  selectedServices.includes(svc)
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-blue-400'
                }`}
              >
                {svc}
              </button>
            ))}
          </div>
          {selectedServices.length > 0 && (
            <p className="text-xs text-blue-600 mt-1">
              선택됨: {selectedServices.join(', ')}
            </p>
          )}
        </div>

        {/* 번역 상태 안내 */}
        {!translationEnabled && (
          <div className="mb-4 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            ⚠️ 번역 기능 비활성화 — 결과가 영문으로 표시됩니다. 한국어 번역은 ANTHROPIC_API_KEY 설정 후 사용 가능합니다.
          </div>
        )}

        {/* 실행 버튼 */}
        <button
          onClick={handleStartScan}
          disabled={scanning}
          className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
        >
          {scanning ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> 스캔 중...</>
          ) : (
            <><Play className="h-4 w-4" /> 스캔 실행</>
          )}
        </button>
      </div>

      {/* 스캔 상태 / 결과 */}
      {currentScan && <ScanStatusCard scan={currentScan} translationEnabled={translationEnabled} />}
    </div>
  );
}

function ScanStatusCard({ scan, translationEnabled = true }: { scan: ScanResult; translationEnabled?: boolean }) {
  const statusConfig = {
    pending:   { icon: <Clock className="h-5 w-5 text-gray-400" />, label: '대기 중', color: 'text-gray-500' },
    running:   { icon: <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />, label: '실행 중', color: 'text-blue-600' },
    completed: { icon: <CheckCircle2 className="h-5 w-5 text-green-500" />, label: '완료', color: 'text-green-600' },
    failed:    { icon: <XCircle className="h-5 w-5 text-red-500" />, label: '실패', color: 'text-red-600' },
  };

  const cfg = statusConfig[scan.status];

  return (
    <div className="bg-white rounded-xl shadow-sm border p-6">
      <div className="flex items-center gap-3 mb-4">
        {cfg.icon}
        <div>
          <span className={`font-semibold ${cfg.color}`}>{cfg.label}</span>
          <p className="text-xs text-gray-400 font-mono mt-0.5">{scan.scan_id}</p>
        </div>
      </div>

      {scan.status === 'running' && (
        <div className="space-y-1">
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-blue-500 rounded-full animate-pulse w-2/3" />
          </div>
          <p className="text-xs text-gray-400">
            Prowler 실행 중{translationEnabled ? ' · 완료 후 한국어 번역이 진행됩니다' : ' · 결과가 영문으로 표시됩니다'}
          </p>
        </div>
      )}

      {scan.status === 'failed' && (
        <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-2">
          {scan.error_message || '알 수 없는 오류가 발생했습니다.'}
        </p>
      )}

      {scan.status === 'completed' && (
        <div className="space-y-4">
          {/* 요약 */}
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="bg-blue-50 rounded-lg py-3">
              <p className="text-2xl font-bold text-blue-700">{scan.total}</p>
              <p className="text-xs text-gray-500">전체</p>
            </div>
            <div className="bg-green-50 rounded-lg py-3">
              <p className="text-2xl font-bold text-green-700">{scan.passed}</p>
              <p className="text-xs text-gray-500">통과</p>
            </div>
            <div className="bg-red-50 rounded-lg py-3">
              <p className="text-2xl font-bold text-red-700">{scan.failed}</p>
              <p className="text-xs text-gray-500">실패</p>
            </div>
          </div>

          {/* 실패 항목 목록 */}
          {scan.findings.filter(f => f.status === 'FAIL').length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-2">
                실패 항목 {translationEnabled ? '(한국어)' : '(영문)'}
              </h4>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {scan.findings
                  .filter(f => f.status === 'FAIL')
                  .slice(0, 50)
                  .map((f, i) => (
                    <div key={i} className="text-sm border rounded-lg px-4 py-3 bg-gray-50">
                      <p className="font-medium text-gray-800">
                        {f.check_title_ko || f.check_title}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {f.service_name.toUpperCase()} · {f.region || '전체'}
                      </p>
                      {(f.remediation_ko || f.remediation) && (
                        <p className="text-xs text-blue-600 mt-1">
                          ✅ {f.remediation_ko || f.remediation}
                        </p>
                      )}
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
