import React, { useState } from 'react';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import CompetitionList from './components/CompetitionList';
import CalendarView from './components/CalendarView';
import AuditLog from './components/AuditLog';
import CompetitionDetail from './components/CompetitionDetail';
import SettingsModal from './components/SettingsModal';
import { Competition } from './types';
import { Menu, Search, Bell } from 'lucide-react';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [selectedCompetition, setSelectedCompetition] = useState<Competition | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isNotifOpen, setIsNotifOpen] = useState(false);

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <Dashboard onOpenDetail={setSelectedCompetition} />;
      case 'list':
        return <CompetitionList onOpenDetail={setSelectedCompetition} />;
      case 'calendar':
        return <CalendarView onOpenDetail={setSelectedCompetition} />;
      case 'audit':
        return <AuditLog />;
      default:
        return <div className="p-10 text-white">Feature coming soon...</div>;
    }
  };

  return (
    <div className="flex h-screen w-full bg-[#111816] font-sans selection:bg-[#2beead] selection:text-[#111816]">
      {/* Desktop Sidebar */}
      <Sidebar 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      {/* Mobile Sidebar Overlay */}
      {isMobileMenuOpen && (
          <div className="fixed inset-0 z-50 flex md:hidden">
              <div 
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={() => setIsMobileMenuOpen(false)}
              ></div>
              <div className="relative h-full w-64 animate-slide-in-right" style={{ animationDirection: 'normal', animationName: 'slideInLeft' }}>
                 <Sidebar 
                    activeTab={activeTab} 
                    setActiveTab={setActiveTab} 
                    onOpenSettings={() => setIsSettingsOpen(true)}
                    className="w-full h-full"
                    onCloseMobile={() => setIsMobileMenuOpen(false)}
                />
              </div>
          </div>
      )}

      {/* Main Content Wrapper */}
      <main className="flex-1 flex flex-col h-full overflow-hidden relative">
        {/* Header */}
        <header className="h-16 border-b border-[#283933] bg-[#111816]/90 backdrop-blur-md flex items-center justify-between px-6 z-20 flex-shrink-0">
           <div className="flex items-center gap-4">
              <button 
                className="md:hidden text-white"
                onClick={() => setIsMobileMenuOpen(true)}
              >
                 <Menu size={24} />
              </button>
              
              {/* Global Search */}
              <div className="relative group hidden md:block">
                 <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#9db9b0] group-focus-within:text-[#2beead]">
                    <Search size={16} />
                 </div>
                 <input 
                   type="text" 
                   className="block w-64 bg-[#1c2723] text-white rounded-xl border border-[#283933] py-2 pl-10 pr-3 text-sm placeholder-[#9db9b0] focus:outline-none focus:border-[#2beead] focus:ring-1 focus:ring-[#2beead] transition-all"
                   placeholder="搜索 (Cmd+K)"
                 />
              </div>
           </div>

           <div className="flex items-center gap-4">
              <div className="relative">
                <button 
                    className={`relative text-[#9db9b0] hover:text-white transition-colors ${isNotifOpen ? 'text-white' : ''}`}
                    onClick={() => setIsNotifOpen(!isNotifOpen)}
                >
                    <Bell size={20} />
                    <span className="absolute top-0 right-0 w-2 h-2 bg-rose-500 rounded-full border-2 border-[#111816]"></span>
                </button>
                {/* Notification Dropdown */}
                {isNotifOpen && (
                    <>
                        <div className="fixed inset-0 z-10" onClick={() => setIsNotifOpen(false)}></div>
                        <div className="absolute right-0 mt-3 w-80 bg-[#1c2723] border border-[#283933] rounded-xl shadow-2xl z-20 overflow-hidden animate-fade-in">
                            <div className="px-4 py-3 border-b border-[#283933] flex justify-between items-center">
                                <h3 className="text-white font-bold text-sm">通知</h3>
                                <button className="text-xs text-[#2beead]">全部标记为已读</button>
                            </div>
                            <div className="max-h-[300px] overflow-y-auto">
                                <div className="p-4 hover:bg-[#111816] cursor-pointer transition-colors border-b border-[#283933]/50">
                                    <div className="flex justify-between items-start mb-1">
                                        <span className="text-xs font-bold text-rose-400">⚠️ 紧急提醒</span>
                                        <span className="text-[10px] text-[#9db9b0]">10分钟前</span>
                                    </div>
                                    <p className="text-white text-sm">ACM-ICPC 报名将在 24 小时后截止，请核对信息。</p>
                                </div>
                                <div className="p-4 hover:bg-[#111816] cursor-pointer transition-colors">
                                    <div className="flex justify-between items-start mb-1">
                                        <span className="text-xs font-bold text-blue-400">👋 协作邀请</span>
                                        <span className="text-[10px] text-[#9db9b0]">2小时前</span>
                                    </div>
                                    <p className="text-white text-sm">Mike Wang 邀请你加入 "Kaggle 2024" 画板。</p>
                                </div>
                            </div>
                        </div>
                    </>
                )}
              </div>
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#2beead] to-blue-500 cursor-pointer border-2 border-[#1c2723]"></div>
           </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 overflow-auto scroll-smooth bg-[#111816]">
           {renderContent()}
        </div>

        {/* Modals */}
        {selectedCompetition && (
          <CompetitionDetail 
            competition={selectedCompetition} 
            onClose={() => setSelectedCompetition(null)} 
          />
        )}

        {isSettingsOpen && (
          <SettingsModal onClose={() => setIsSettingsOpen(false)} />
        )}
        
        {/* Mobile slide in animation fix */}
        <style>{`
            @keyframes slideInLeft {
                from { transform: translateX(-100%); }
                to { transform: translateX(0); }
            }
        `}</style>
      </main>
    </div>
  );
};

export default App;
