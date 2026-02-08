import React, { useState } from 'react';
import { X, Moon, Sun, Monitor, Bell, Shield, Database, Check } from 'lucide-react';

interface SettingsModalProps {
  onClose: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ onClose }) => {
  const [theme, setTheme] = useState<'light'|'dark'|'system'>('dark');
  const [deadlineNotify, setDeadlineNotify] = useState(true);
  const [weeklyReport, setWeeklyReport] = useState(false);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose}></div>
      <div className="relative bg-[#16201c] border border-[#283933] rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden animate-fade-in">
        <div className="flex justify-between items-center p-6 border-b border-[#283933]">
          <h2 className="text-xl font-bold text-white">设置</h2>
          <button onClick={onClose} className="p-2 text-[#9db9b0] hover:text-white rounded-lg hover:bg-[#283933]">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-8">
          {/* Appearance */}
          <div>
            <h3 className="text-sm font-bold text-[#9db9b0] uppercase tracking-wider mb-4">外观</h3>
            <div className="grid grid-cols-3 gap-4">
              <button 
                onClick={() => setTheme('light')}
                className={`flex flex-col items-center gap-3 p-4 rounded-xl border transition-all ${
                    theme === 'light' ? 'border-[#2beead] bg-[#1c2723] text-white' : 'border-[#283933] bg-[#111816] text-[#9db9b0] hover:border-[#2beead] hover:text-white'
                }`}
              >
                <Sun size={24} />
                <span className="text-sm font-medium">浅色</span>
                {theme === 'light' && <Check size={16} className="text-[#2beead] absolute top-2 right-2"/>}
              </button>
              <button 
                onClick={() => setTheme('dark')}
                className={`flex flex-col items-center gap-3 p-4 rounded-xl border transition-all ${
                    theme === 'dark' ? 'border-[#2beead] bg-[#1c2723] text-white' : 'border-[#283933] bg-[#111816] text-[#9db9b0] hover:border-[#2beead] hover:text-white'
                }`}
              >
                <Moon size={24} />
                <span className="text-sm font-bold">深色</span>
                {theme === 'dark' && <Check size={16} className="text-[#2beead] absolute top-2 right-2"/>}
              </button>
              <button 
                onClick={() => setTheme('system')}
                className={`flex flex-col items-center gap-3 p-4 rounded-xl border transition-all ${
                    theme === 'system' ? 'border-[#2beead] bg-[#1c2723] text-white' : 'border-[#283933] bg-[#111816] text-[#9db9b0] hover:border-[#2beead] hover:text-white'
                }`}
              >
                <Monitor size={24} />
                <span className="text-sm font-medium">跟随系统</span>
                {theme === 'system' && <Check size={16} className="text-[#2beead] absolute top-2 right-2"/>}
              </button>
            </div>
          </div>

          {/* Notifications */}
          <div>
            <h3 className="text-sm font-bold text-[#9db9b0] uppercase tracking-wider mb-4">通知策略</h3>
            <div className="space-y-3">
               <div 
                 className="flex items-center justify-between p-4 rounded-xl bg-[#111816] border border-[#283933] cursor-pointer hover:border-[#9db9b0] transition-colors"
                 onClick={() => setDeadlineNotify(!deadlineNotify)}
               >
                  <div className="flex items-center gap-3">
                     <Bell size={20} className={deadlineNotify ? "text-[#2beead]" : "text-[#9db9b0]"} />
                     <div>
                        <p className="text-white font-medium">临期强提醒</p>
                        <p className="text-xs text-[#9db9b0]">当任务剩余时间少于 24 小时</p>
                     </div>
                  </div>
                  <div className={`w-12 h-6 rounded-full relative transition-colors ${deadlineNotify ? 'bg-[#2beead]' : 'bg-[#283933]'}`}>
                     <div className={`absolute top-1 w-4 h-4 rounded-full bg-[#111816] transition-all ${deadlineNotify ? 'right-1' : 'left-1'}`}></div>
                  </div>
               </div>
               
               <div 
                 className="flex items-center justify-between p-4 rounded-xl bg-[#111816] border border-[#283933] cursor-pointer hover:border-[#9db9b0] transition-colors"
                 onClick={() => setWeeklyReport(!weeklyReport)}
               >
                  <div className="flex items-center gap-3">
                     <Shield size={20} className={weeklyReport ? "text-[#2beead]" : "text-[#9db9b0]"} />
                     <div>
                        <p className="text-white font-medium">审查日志摘要</p>
                        <p className="text-xs text-[#9db9b0]">每周一发送上周团队活动报告</p>
                     </div>
                  </div>
                  <div className={`w-12 h-6 rounded-full relative transition-colors ${weeklyReport ? 'bg-[#2beead]' : 'bg-[#283933]'}`}>
                     <div className={`absolute top-1 w-4 h-4 rounded-full bg-[#111816] transition-all ${weeklyReport ? 'right-1' : 'left-1'}`}></div>
                  </div>
               </div>
            </div>
          </div>

          {/* Data */}
          <div>
            <h3 className="text-sm font-bold text-[#9db9b0] uppercase tracking-wider mb-4">数据管理</h3>
            <button className="flex items-center gap-2 px-4 py-2 bg-[#1c2723] border border-[#283933] text-white rounded-lg text-sm font-medium hover:bg-[#283933] transition-colors active:scale-95">
               <Database size={16} /> 导出所有数据 (JSON)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
