import { useState } from 'react';
import { Shield, LayoutDashboard, PlayCircle } from 'lucide-react';
import Dashboard from './pages/Dashboard';
import ScanPage from './pages/ScanPage';

type Page = 'dashboard' | 'scan';

export default function App() {
  const [page, setPage] = useState<Page>('dashboard');

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 헤더 */}
      <header className="bg-white border-b shadow-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-16">
            {/* 로고 */}
            <div className="flex items-center gap-2.5">
              <Shield className="h-7 w-7 text-blue-600" />
              <div>
                <span className="font-bold text-gray-900 text-lg">Prowler</span>
                <span className="ml-1.5 text-sm text-gray-400">보안 대시보드</span>
              </div>
            </div>

            {/* 네비게이션 */}
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
            </nav>
          </div>
        </div>
      </header>

      {/* 메인 컨텐츠 */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-gray-900">
            {page === 'dashboard' ? '클라우드 보안 현황' : 'Prowler 스캔 실행'}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {page === 'dashboard'
              ? '최근 스캔 결과를 한국어로 확인하세요'
              : '보안 점검을 실행하고 한국어 결과를 확인하세요'}
          </p>
        </div>

        {page === 'dashboard' ? <Dashboard /> : <ScanPage />}
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
