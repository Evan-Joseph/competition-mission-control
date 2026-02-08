import React from 'react';
import { LayoutDashboard, Calendar, Trello, Settings, ShieldCheck, Plus, X } from 'lucide-react';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onOpenSettings: () => void;
  className?: string; // Allow overriding styles for mobile drawer
  onCloseMobile?: () => void; // For closing mobile drawer
}

const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab, onOpenSettings, className, onCloseMobile }) => {
  const menuItems = [
    { id: 'dashboard', label: '总览', icon: LayoutDashboard },
    { id: 'list', label: '竞赛列表', icon: Trello },
    // Timeline removed as per user request
    { id: 'calendar', label: '日历', icon: Calendar },
    { id: 'audit', label: '审查日志', icon: ShieldCheck },
  ];

  const handleTabClick = (id: string) => {
    setActiveTab(id);
    if (onCloseMobile) onCloseMobile();
  };

  return (
    <aside className={`flex flex-col h-full bg-[#16201c] border-r border-[#283933] flex-shrink-0 transition-all ${className || 'hidden md:flex w-64'}`}>
      <div className="p-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center text-emerald-400">
            <ShieldCheck size={20} strokeWidth={2.5} />
            </div>
            <div>
            <h1 className="text-white font-bold tracking-wide text-lg">极客战队</h1>
            <p className="text-[#9db9b0] text-xs">竞赛规划 V3</p>
            </div>
        </div>
        {onCloseMobile && (
            <button onClick={onCloseMobile} className="md:hidden text-[#9db9b0] hover:text-white">
                <X size={24} />
            </button>
        )}
      </div>

      <nav className="flex-1 px-4 space-y-2 mt-4">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => handleTabClick(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group ${
                isActive
                  ? 'bg-[#2beead] text-[#111816] font-bold shadow-[0_0_15px_rgba(43,238,173,0.2)]'
                  : 'text-[#9db9b0] hover:bg-[#1c2723] hover:text-white'
              }`}
            >
              <Icon size={20} className={isActive ? 'text-[#111816]' : 'text-[#9db9b0] group-hover:text-white'} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="p-4 mt-auto">
        <button className="w-full flex items-center justify-center gap-2 bg-[#1c2723] hover:bg-[#25332e] text-white py-3 rounded-xl transition-colors border border-[#283933]">
          <Plus size={18} />
          <span className="text-sm font-medium">新建项目</span>
        </button>
        <button 
          onClick={() => {
              onOpenSettings();
              if (onCloseMobile) onCloseMobile();
          }}
          className="w-full mt-2 flex items-center gap-3 px-4 py-3 rounded-xl text-[#9db9b0] hover:text-white transition-colors"
        >
          <Settings size={20} />
          <span className="text-sm">设置</span>
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
