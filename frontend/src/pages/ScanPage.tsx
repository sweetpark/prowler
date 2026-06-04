import { useEffect, useState } from 'react';
import { Play, Loader2, CheckCircle2, XCircle, Clock, X } from 'lucide-react';
import { startScan, getScan, getServices, getCompliances, ScanResult, ComplianceItem } from '../api/client';

const PROVIDER_META: Record<string, { label: string; regionSupported: boolean; color: string }> = {
  aws:        { label: 'Amazon Web Services (AWS)',         regionSupported: true,  color: 'bg-orange-50 border-orange-300 text-orange-800' },
  azure:      { label: 'Microsoft Azure',                  regionSupported: false, color: 'bg-blue-50 border-blue-300 text-blue-800' },
  gcp:        { label: 'Google Cloud Platform (GCP)',      regionSupported: false, color: 'bg-yellow-50 border-yellow-300 text-yellow-800' },
  oci:        { label: 'Oracle Cloud Infrastructure (OCI)',regionSupported: true,  color: 'bg-red-50 border-red-300 text-red-800' },
  kubernetes: { label: 'Kubernetes',                       regionSupported: false, color: 'bg-indigo-50 border-indigo-300 text-indigo-800' },
  m365:       { label: 'Microsoft 365',                    regionSupported: false, color: 'bg-sky-50 border-sky-300 text-sky-800' },
  github:     { label: 'GitHub',                           regionSupported: false, color: 'bg-gray-50 border-gray-400 text-gray-800' },
};

const AWS_REGIONS = [
  { value: '',               label: '전체 리전' },
  { value: 'ap-northeast-2', label: 'ap-northeast-2 (서울)' },
  { value: 'ap-northeast-1', label: 'ap-northeast-1 (도쿄)' },
  { value: 'ap-southeast-1', label: 'ap-southeast-1 (싱가포르)' },
  { value: 'ap-southeast-2', label: 'ap-southeast-2 (시드니)' },
  { value: 'ap-south-1',     label: 'ap-south-1 (뭄바이)' },
  { value: 'us-east-1',      label: 'us-east-1 (버지니아)' },
  { value: 'us-east-2',      label: 'us-east-2 (오하이오)' },
  { value: 'us-west-1',      label: 'us-west-1 (캘리포니아)' },
  { value: 'us-west-2',      label: 'us-west-2 (오레곤)' },
  { value: 'eu-west-1',      label: 'eu-west-1 (아일랜드)' },
  { value: 'eu-west-2',      label: 'eu-west-2 (런던)' },
  { value: 'eu-central-1',   label: 'eu-central-1 (프랑크푸르트)' },
  { value: 'ca-central-1',   label: 'ca-central-1 (캐나다)' },
  { value: 'sa-east-1',      label: 'sa-east-1 (상파울루)' },
];

const OCI_REGIONS = [
  { value: '',                label: '전체 리전' },
  { value: 'ap-seoul-1',      label: 'ap-seoul-1 (서울)' },
  { value: 'ap-tokyo-1',      label: 'ap-tokyo-1 (도쿄)' },
  { value: 'ap-singapore-1',  label: 'ap-singapore-1 (싱가포르)' },
  { value: 'us-ashburn-1',    label: 'us-ashburn-1 (애쉬번)' },
  { value: 'us-phoenix-1',    label: 'us-phoenix-1 (피닉스)' },
  { value: 'eu-frankfurt-1',  label: 'eu-frankfurt-1 (프랑크푸르트)' },
  { value: 'eu-amsterdam-1',  label: 'eu-amsterdam-1 (암스테르담)' },
  { value: 'uk-london-1',     label: 'uk-london-1 (런던)' },
];

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

export default function ScanPage({
  translationEnabled = true,
  availableProviders = ['aws'],
}: {
  translationEnabled?: boolean;
  availableProviders?: string[];
}) {
  const [selectedProvider, setSelectedProvider] = useState('aws');
  const [services, setServices] = useState<string[]>([]);
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [selectedSeverity, setSelectedSeverity] = useState<string[]>([]);
  const [region, setRegion] = useState('ap-northeast-2');
  const [scanning, setScanning] = useState(false);
  const [currentScan, setCurrentScan] = useState<ScanResult | null>(null);
  const [pollInterval, setPollInterval] = useState<ReturnType<typeof setInterval> | null>(null);
  const [compliancesByProvider, setCompliancesByProvider] = useState<Record<string, ComplianceItem[]>>({});
  const [selectedCompliances, setSelectedCompliances] = useState<ComplianceItem[]>([]);
  const [complianceSearch, setComplianceSearch] = useState('');

  useEffect(() => {
    getCompliances().then(r => setCompliancesByProvider(r.data.compliances));
    return () => { if (pollInterval) clearInterval(pollInterval); };
  }, []);

  useEffect(() => {
    setSelectedServices([]);
    setSelectedCompliances([]);
    setRegion(selectedProvider === 'aws' ? 'ap-northeast-2' : '');
    getServices(selectedProvider).then(r => setServices(r.data.services));
  }, [selectedProvider]);

  const handleStartScan = async () => {
    setScanning(true);
    setCurrentScan(null);

    try {
      const res = await startScan({
        provider: selectedProvider,
        services: selectedServices.length > 0 ? selectedServices : undefined,
        severity: selectedSeverity.length > 0 ? selectedSeverity : undefined,
        region: region || undefined,
        compliance: selectedCompliances.length > 0 ? selectedCompliances.map(c => c.value) : undefined,
      });

      const { scan_id } = res.data;

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

  const toggleService = (svc: string) =>
    setSelectedServices(prev => prev.includes(svc) ? prev.filter(s => s !== svc) : [...prev, svc]);

  const toggleSeverity = (sev: string) =>
    setSelectedSeverity(prev => prev.includes(sev) ? prev.filter(s => s !== sev) : [...prev, sev]);

  const toggleCompliance = (item: ComplianceItem) =>
    setSelectedCompliances(prev =>
      prev.find(c => c.value === item.value)
        ? prev.filter(c => c.value !== item.value)
        : [...prev, item]
    );

  const regionOptions = selectedProvider === 'oci' ? OCI_REGIONS : AWS_REGIONS;
  const showRegion = PROVIDER_META[selectedProvider]?.regionSupported ?? false;
  const currentProviderCompliances = compliancesByProvider[selectedProvider] ?? [];
  const filteredCompliances = currentProviderCompliances.filter(item =>
    item.label.toLowerCase().includes(complianceSearch.toLowerCase()) ||
    item.value.toLowerCase().includes(complianceSearch.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow-sm border p-6">
        <h2 className="text-base font-semibold text-gray-800 mb-5">스캔 설정</h2>

        {/* 클라우드 제공자 선택 */}
        <div className="mb-5">
          <label className="block text-sm font-medium text-gray-700 mb-2">클라우드 제공자</label>
          <div className="flex flex-wrap gap-2">
            {Object.entries(PROVIDER_META).map(([key, meta]) => {
              const isAvailable = availableProviders.includes(key);
              const isSelected = selectedProvider === key;
              return (
                <button
                  key={key}
                  onClick={() => isAvailable && setSelectedProvider(key)}
                  title={isAvailable ? meta.label : `${meta.label} — .env에 자격증명 필요`}
                  className={`px-3 py-1.5 rounded-lg text-sm border font-medium transition-colors ${
                    isSelected
                      ? `${meta.color} ring-2 ring-offset-1 ring-blue-500`
                      : isAvailable
                        ? 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'
                        : 'bg-gray-50 text-gray-300 border-gray-200 cursor-not-allowed'
                  }`}
                >
                  {key.toUpperCase()}
                  {!isAvailable && <span className="ml-1 text-xs">🔒</span>}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-gray-400 mt-1.5">
            {PROVIDER_META[selectedProvider]?.label} 선택됨
            {!PROVIDER_META[selectedProvider]?.regionSupported && selectedProvider !== 'aws' && ' · 리전 설정 불필요'}
          </p>
        </div>

        {/* 리전 (AWS / OCI만) */}
        {showRegion && (
          <div className="mb-5">
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              {selectedProvider === 'oci' ? 'OCI 리전' : 'AWS 리전'}
            </label>
            <select
              value={region}
              onChange={e => setRegion(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              {regionOptions.map(r => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>
        )}

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

        {/* 컴플라이언스 다중선택 */}
        <div className="mb-5">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            컴플라이언스 프레임워크 <span className="text-gray-400 font-normal">(선택 안하면 전체 · 다중선택 가능)</span>
          </label>

          {/* 선택된 뱃지 목록 */}
          {selectedCompliances.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {selectedCompliances.map(item => (
                <span
                  key={item.value}
                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-medium"
                >
                  {item.label}
                  <button
                    onClick={() => toggleCompliance(item)}
                    className="ml-0.5 hover:text-blue-600"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
              <button
                onClick={() => setSelectedCompliances([])}
                className="text-xs text-gray-400 hover:text-red-500 px-2 py-1 transition-colors"
              >
                전체 해제
              </button>
            </div>
          )}

          {/* 검색 + 목록 */}
          {currentProviderCompliances.length > 0 ? (
            <div className="border rounded-lg bg-gray-50 p-2">
              <input
                type="text"
                value={complianceSearch}
                onChange={e => setComplianceSearch(e.target.value)}
                placeholder="프레임워크 검색..."
                className="w-full px-2 py-1.5 text-sm border rounded mb-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              />
              <div className="max-h-40 overflow-y-auto">
                <div className="flex flex-wrap gap-1.5">
                  {filteredCompliances.map(item => {
                    const isSelected = selectedCompliances.some(c => c.value === item.value);
                    return (
                      <button
                        key={item.value}
                        onClick={() => toggleCompliance(item)}
                        className={`px-2.5 py-1 rounded text-xs border transition-colors ${
                          isSelected
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white text-gray-600 border-gray-200 hover:border-blue-400'
                        }`}
                      >
                        {item.label}
                      </button>
                    );
                  })}
                  {filteredCompliances.length === 0 && (
                    <p className="text-xs text-gray-400 py-2 px-1">검색 결과 없음</p>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <p className="text-xs text-gray-400 bg-gray-50 rounded-lg p-3 border">
              {selectedProvider} 제공자의 컴플라이언스 프레임워크 정보를 불러오는 중...
            </p>
          )}
        </div>

        {/* 서비스 선택 */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            서비스 선택{' '}
            {selectedCompliances.length > 0
              ? <span className="text-blue-500 font-normal">(컴플라이언스 결과를 선택 서비스로 필터링)</span>
              : <span className="text-gray-400 font-normal">(선택 안하면 전체)</span>
            }
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
              {selectedCompliances.length > 0
                ? `교집합 필터: ${selectedServices.join(', ')}`
                : `선택됨: ${selectedServices.join(', ')}`
              }
            </p>
          )}
        </div>

        {!translationEnabled && (
          <div className="mb-4 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            ⚠️ 번역 기능 비활성화 — 결과가 영문으로 표시됩니다. 한국어 번역은 ANTHROPIC_API_KEY 설정 후 사용 가능합니다.
          </div>
        )}

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
        {scan.provider && (
          <span className="ml-auto text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">
            {scan.provider.toUpperCase()}
          </span>
        )}
      </div>

      {scan.compliance && scan.compliance.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {scan.compliance.map(c => (
            <span key={c} className="text-xs px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full font-medium">{c}</span>
          ))}
        </div>
      )}

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
