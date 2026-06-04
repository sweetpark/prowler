import { useState, useEffect } from 'react';
import { LayoutDashboard, PlayCircle, History, Languages, AlertCircle, ListChecks } from 'lucide-react';
import Dashboard from './pages/Dashboard';
import ScanPage from './pages/ScanPage';
import ScanHistory from './pages/ScanHistory';
import CheckList from './pages/CheckList';
import { getConfig, ServerConfig } from './api/client';

type Page = 'dashboard' | 'scan' | 'history' | 'checks';

export default function App() {
  const [page, setPage] = useState<Page>('dashboard');
  const [config, setConfig] = useState<ServerConfig | null>(null);

  useEffect(() => {
    getConfig()
      .then((res) => setConfig(res.data))
      .catch(() => setConfig({ translation_enabled: false, claude_model: null, available_providers: ['aws'] }));
  }, []);

  const PAGE_META: Record<Page, { title: string; desc: string }> = {
    dashboard: {
      title: '클라우드 보안 현황',
      desc: config?.translation_enabled ? '최근 스캔 결과를 한국어로 확인하세요' : '최근 스캔 결과를 확인하세요 (영문 모드)',
    },
    scan: {
      title: 'Prowler 스캔 실행',
      desc: config?.translation_enabled ? '보안 점검을 실행하고 한국어 결과를 확인하세요' : '보안 점검을 실행하세요 (한국어 번역 비활성화)',
    },
    history: {
      title: '스캔 이력',
      desc: '저장된 전체 스캔 결과 목록입니다',
    },
    checks: {
      title: '점검 항목 목록',
      desc: '프레임워크 및 서비스별 점검 항목을 확인하세요',
    },
  };
  const { title: pageTitle, desc: pageDesc } = PAGE_META[page];

  return (
    <div className="min-h-screen bg-gray-50">
      {config && !config.translation_enabled && (
        <div className="bg-amber-50 border-b border-amber-200">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-2 flex items-center gap-2 text-sm text-amber-700">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <span>
              <strong>번역 비활성화</strong> — ANTHROPIC_API_KEY가 설정되지 않아 영문 결과가 표시됩니다.
              번역 기능을 사용하려면 <code className="bg-amber-100 px-1 rounded">.env</code>에 API 키를 추가하세요.
            </span>
          </div>
        </div>
      )}

      <header className="bg-white border-b shadow-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <img src="/logo.png" alt="SK m&service" className="h-8 w-auto" />
              <span className="text-sm text-gray-400 border-l pl-3">보안 대시보드</span>
            </div>
              {config && (
                <span className={`ml-2 flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${
                  config.translation_enabled
                    ? 'bg-green-100 text-green-700'
                    : 'bg-gray-100 text-gray-500'
                }`}>
                  <Languages className="h-3 w-3" />
                  {config.translation_enabled ? `KO (${config.claude_model})` : 'EN'}
                </span>
              )}
            </div>

            <nav className="flex gap-1">
              <NavButton
                icon={<LayoutDashboard className="h-4 w-4" />}
                label="대시보드"
                active={page === 'dashboard'}
                onClick={() => setPage('dashboard')}
              />
              <NavButton
                icon={<PlayCircle className="h-4 w-4" />}
                label="스캔 실행"
                active={page === 'scan'}
                onClick={() => setPage('scan')}
              />
              <NavButton
                icon={<History className="h-4 w-4" />}
                label="스캔 이력"
                active={page === 'history'}
                onClick={() => setPage('history')}
              />
              <NavButton
                icon={<ListChecks className="h-4 w-4" />}
                label="점검 항목"
                active={page === 'checks'}
                onClick={() => setPage('checks')}
              />
            </nav>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-gray-900">{pageTitle}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{pageDesc}</p>
        </div>

        {page === 'dashboard' && <Dashboard onNavigate={setPage} />}
        {page === 'scan' && (
          <ScanPage
            translationEnabled={config?.translation_enabled ?? true}
            availableProviders={config?.available_providers ?? ['aws']}
          />
        )}
        {page === 'history' && <ScanHistory />}
        {page === 'checks' && <CheckList />}
      </main>
    </div>
  );
}

function NavButton({
  icon, label, active, onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
        active
          ? 'bg-blue-600 text-white'
          : 'text-gray-600 hover:bg-gray-100'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
