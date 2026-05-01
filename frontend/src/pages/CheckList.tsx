import { useEffect, useState } from 'react';
import { Search, RefreshCw, Loader2, ListChecks } from 'lucide-react';
import { getCompliances, getServices, getChecks, ComplianceItem } from '../api/client';

const PROVIDER_OPTIONS = [
  { value: 'aws',        label: 'AWS' },
  { value: 'azure',      label: 'Azure' },
  { value: 'gcp',        label: 'GCP' },
  { value: 'oci',        label: 'OCI (Oracle)' },
  { value: 'kubernetes', label: 'Kubernetes' },
  { value: 'm365',       label: 'M365' },
  { value: 'github',     label: 'GitHub' },
];

export default function CheckList() {
  const [provider, setProvider] = useState('aws');
  const [compliancesByProvider, setCompliancesByProvider] = useState<Record<string, ComplianceItem[]>>({});
  const [services, setServices] = useState<string[]>([]);
  const [selectedCompliance, setSelectedCompliance] = useState('');
  const [selectedService, setSelectedService] = useState('');
  const [checks, setChecks] = useState<string[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    getCompliances().then(r => setCompliancesByProvider(r.data.compliances));
  }, []);

  useEffect(() => {
    setSelectedCompliance('');
    setSelectedService('');
    setChecks([]);
    setTotal(null);
    getServices(provider).then(r => setServices(r.data.services));
  }, [provider]);

  const handleFetch = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await getChecks(
        provider,
        selectedCompliance || undefined,
        selectedService || undefined,
      );
      setChecks(res.data.checks);
      setTotal(res.data.total);
      if (res.data.error) setError(res.data.error);
    } catch {
      setError('점검 항목 조회 실패');
    } finally {
      setLoading(false);
    }
  };

  const currentCompliances = compliancesByProvider[provider] ?? [];
  const filteredChecks = checks.filter(c =>
    c.toLowerCase().includes(searchText.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* 필터 패널 */}
      <div className="bg-white rounded-xl shadow-sm border p-6">
        <h2 className="text-base font-semibold text-gray-800 mb-5">점검 항목 조회</h2>

        {/* 제공자 */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1.5">클라우드 제공자</label>
          <div className="flex flex-wrap gap-2">
            {PROVIDER_OPTIONS.map(p => (
              <button
                key={p.value}
                onClick={() => setProvider(p.value)}
                className={`px-3 py-1.5 rounded-lg text-sm border font-medium transition-colors ${
                  provider === p.value
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* 컴플라이언스 */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            컴플라이언스 프레임워크 <span className="text-gray-400 font-normal">(선택 안하면 전체)</span>
          </label>
          <select
            value={selectedCompliance}
            onChange={e => { setSelectedCompliance(e.target.value); setSelectedService(''); }}
            className="border rounded-lg px-3 py-2 text-sm w-full max-w-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            <option value="">전체 프레임워크</option>
            {currentCompliances.map(c => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>

        {/* 서비스 */}
        <div className="mb-5">
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            서비스 <span className="text-gray-400 font-normal">(선택 안하면 전체)</span>
          </label>
          <select
            value={selectedService}
            onChange={e => { setSelectedService(e.target.value); setSelectedCompliance(''); }}
            className="border rounded-lg px-3 py-2 text-sm w-full max-w-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            <option value="">전체 서비스</option>
            {services.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          {selectedCompliance && selectedService && (
            <p className="text-xs text-amber-600 mt-1">컴플라이언스와 서비스는 동시에 필터할 수 없습니다. 하나를 선택하면 다른 하나는 초기화됩니다.</p>
          )}
        </div>

        <button
          onClick={handleFetch}
          disabled={loading}
          className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
        >
          {loading ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> 조회 중...</>
          ) : (
            <><RefreshCw className="h-4 w-4" /> 점검 항목 조회</>
          )}
        </button>

        <p className="text-xs text-gray-400 mt-3">
          ※ 조회 시 Prowler CLI를 실행하므로 수 초가 소요될 수 있습니다.
        </p>
      </div>

      {/* 결과 */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-4 text-sm text-red-600">
          {error}
        </div>
      )}

      {total !== null && !error && (
        <div className="bg-white rounded-xl shadow-sm border">
          <div className="px-6 py-4 border-b flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <ListChecks className="h-5 w-5 text-blue-600" />
              <h3 className="text-base font-semibold text-gray-800">
                점검 항목 목록
              </h3>
              <span className="text-sm text-gray-500">
                총 <strong className="text-blue-600">{total}</strong>건
                {selectedCompliance && <span className="ml-1 text-purple-600">· {selectedCompliance}</span>}
                {selectedService && <span className="ml-1 text-green-600">· {selectedService}</span>}
              </span>
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <input
                type="text"
                value={searchText}
                onChange={e => setSearchText(e.target.value)}
                placeholder="항목 검색..."
                className="pl-8 pr-3 py-1.5 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 w-56"
              />
            </div>
          </div>

          {checks.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-12">
              조회된 점검 항목이 없습니다.
            </p>
          ) : (
            <div className="divide-y max-h-[60vh] overflow-y-auto">
              {filteredChecks.map((check, i) => {
                const parts = check.split('_');
                const service = parts[0] ?? '';
                return (
                  <div key={i} className="px-6 py-3 flex items-center gap-3 hover:bg-gray-50">
                    <span className="text-xs w-8 text-right text-gray-300 shrink-0">{i + 1}</span>
                    <span className="text-xs px-2 py-0.5 bg-blue-50 text-blue-700 rounded font-mono shrink-0">
                      {service.toUpperCase()}
                    </span>
                    <span className="text-sm font-mono text-gray-700 truncate">{check}</span>
                  </div>
                );
              })}
              {filteredChecks.length < checks.length && (
                <p className="text-xs text-gray-400 text-center py-3">
                  {filteredChecks.length}건 표시 / 전체 {checks.length}건
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
