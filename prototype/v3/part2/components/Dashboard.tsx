import React from 'react';
import { ArrowRight, AlertTriangle, CheckCircle2, Clock, MoreHorizontal, CalendarDays } from 'lucide-react';
import { MOCK_COMPETITIONS, MOCK_LOGS } from '../constants';
import { Competition } from '../types';

interface DashboardProps {
  onOpenDetail: (comp: Competition) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ onOpenDetail }) => {
  const upcoming = MOCK_COMPETITIONS.filter(c => c.registered && new Date(c.submission_deadline_at || '') > new Date());
  
  return (
    <div className="p-6 md:p-10 space-y-8 animate-fade-in pb-20">
      <header className="flex justify-between items-end">
        <div>
          <p className="text-[#9db9b0] text-sm mb-1 font-medium">10月 24日, 星期二</p>
          <h2 className="text-3xl text-white font-bold">早安, 队长 👋</h2>
        </div>
        <div className="hidden md:block">
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-sm border border-emerald-500/20">
            <CheckCircle2 size={14} /> 本周效率稳步提升
          </span>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Focus Card */}
        <div className="lg:col-span-2 rounded-2xl bg-[#1c2723] border border-[#283933] p-6 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 rounded-full blur-3xl -mr-16 -mt-16 group-hover:bg-emerald-500/10 transition-all duration-700"></div>
          
          <div className="relative z-10 h-full flex flex-col justify-between">
            <div className="flex justify-between items-center mb-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-500/20 rounded-lg text-emerald-400">
                  <Clock size={20} />
                </div>
                <h3 className="text-xl font-bold text-white">今日首要任务</h3>
              </div>
              <span className="text-xs font-mono text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded border border-emerald-500/20 animate-pulse">
                进行中
              </span>
            </div>

            <div 
              className="bg-[#16201c] border border-[#283933] rounded-xl p-5 flex flex-col md:flex-row items-start md:items-center gap-5 cursor-pointer hover:border-emerald-500/50 transition-colors shadow-lg"
              onClick={() => onOpenDetail(MOCK_COMPETITIONS[0])}
            >
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                   <h4 className="text-white font-bold text-lg">提交创新创业大赛初稿</h4>
                </div>
                <p className="text-[#9db9b0] text-sm">关联: 校园外卖平台优化</p>
                
                {/* Discrete Phase Indicator instead of Percentage */}
                <div className="flex items-center gap-2 mt-3">
                    <span className="text-xs font-bold text-[#9db9b0]">当前阶段:</span>
                    <span className="text-xs font-bold px-2 py-0.5 bg-emerald-500 text-[#111816] rounded">备赛冲刺</span>
                </div>
              </div>

              <div className="flex flex-col items-end gap-1 w-full md:w-auto border-t md:border-t-0 md:border-l border-[#283933] pt-3 md:pt-0 md:pl-5">
                 <span className="text-[10px] text-[#9db9b0] uppercase tracking-wider">剩余时间</span>
                 <div className="text-2xl font-bold text-white font-mono">7<span className="text-sm text-[#9db9b0]">小时</span></div>
              </div>
            </div>

            <div className="mt-5">
               <p className="text-xs font-bold text-[#9db9b0] uppercase tracking-wider mb-2">待办子任务</p>
               <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
                  <div className="min-w-[180px] p-3 rounded-xl bg-[#16201c] border border-dashed border-[#283933] hover:border-emerald-500/30 hover:bg-[#1c2723] transition-all cursor-pointer flex items-center gap-3 group/item">
                     <div className="w-4 h-4 rounded-full border-2 border-[#9db9b0] group-hover/item:border-emerald-500 transition-colors"></div>
                     <span className="text-sm text-[#9db9b0] group-hover/item:text-white">校对 PPT 第四章</span>
                  </div>
                  <div className="min-w-[180px] p-3 rounded-xl bg-[#16201c] border border-dashed border-[#283933] hover:border-emerald-500/30 hover:bg-[#1c2723] transition-all cursor-pointer flex items-center gap-3 group/item">
                     <div className="w-4 h-4 rounded-full border-2 border-[#9db9b0] group-hover/item:border-emerald-500 transition-colors"></div>
                     <span className="text-sm text-[#9db9b0] group-hover/item:text-white">导出 PDF 版本</span>
                  </div>
               </div>
            </div>
          </div>
        </div>

        {/* Risk / Alerts Widget */}
        <div className="rounded-2xl bg-gradient-to-br from-[#1c2723] to-[#1d1818] border border-[#283933] p-6 relative overflow-hidden flex flex-col justify-between">
           <div className="absolute top-0 right-0 p-4 opacity-5">
             <AlertTriangle size={120} />
           </div>
           
           <div>
             <div className="flex items-center gap-2 mb-4 text-rose-400">
               <AlertTriangle size={20} />
               <h3 className="font-bold">紧急提醒</h3>
             </div>
             
             <div className="flex items-baseline gap-1 mb-2">
                <span className="text-5xl font-bold text-white tracking-tighter">1</span>
                <span className="text-[#9db9b0] font-medium">天剩余</span>
             </div>
             <p className="text-white font-bold text-lg mb-1">ACM-ICPC 报名截止</p>
             <p className="text-[#9db9b0] text-sm leading-relaxed">需要确认全员学籍验证。</p>
           </div>

           <button 
             className="w-full mt-6 py-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 font-bold text-sm hover:bg-rose-500/20 transition-all flex items-center justify-center gap-2"
             onClick={() => onOpenDetail(MOCK_COMPETITIONS[2])}
           >
             立即处理 <ArrowRight size={16} />
           </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Recent Activity */}
        <div className="rounded-2xl bg-[#1c2723] border border-[#283933] p-6">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-bold text-white">最近动态</h3>
            <button className="text-[#9db9b0] hover:text-white text-sm">查看全部</button>
          </div>
          
          <div className="space-y-6 relative pl-2">
            <div className="absolute left-[7px] top-2 bottom-2 w-[2px] bg-[#283933]"></div>
            
            {MOCK_LOGS.slice(0, 3).map((log, idx) => (
              <div key={log.id} className="relative pl-6">
                <div className={`absolute left-0 top-1.5 w-3.5 h-3.5 rounded-full border-2 z-10 bg-[#1c2723] ${
                   idx === 0 ? 'border-emerald-400' : 'border-[#9db9b0]'
                }`}></div>
                <div className="flex flex-col gap-1">
                  <p className="text-sm text-white">
                    <span className="font-bold text-emerald-400">{log.user.name}</span> {log.action === 'create' ? '创建了' : log.action === 'update' ? '更新了' : '评论了'} <span className="font-medium text-white/90">{log.target}</span>
                  </p>
                  <p className="text-xs text-[#9db9b0] font-medium">{log.details}</p>
                  <span className="text-[10px] text-[#9db9b0]/60 mt-0.5">{log.timestamp}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Coming Up */}
        <div className="rounded-2xl bg-[#1c2723] border border-[#283933] p-6">
          <div className="flex justify-between items-center mb-6">
             <h3 className="text-lg font-bold text-white">日程概览</h3>
             <CalendarDays size={18} className="text-[#9db9b0]"/>
          </div>
          <div className="space-y-3">
             {upcoming.map(comp => (
               <div key={comp.id} className="flex items-center gap-4 p-3 rounded-xl bg-[#16201c] border border-[#283933] hover:border-[#9db9b0] transition-colors cursor-pointer" onClick={() => onOpenDetail(comp)}>
                  <div className="w-12 h-12 rounded-lg bg-[#1c2723] flex flex-col items-center justify-center border border-[#283933]">
                     <span className="text-[10px] text-emerald-400 font-bold uppercase">{new Date(comp.submission_deadline_at!).toLocaleString('default', { month: 'short' })}</span>
                     <span className="text-lg text-white font-bold leading-none">{new Date(comp.submission_deadline_at!).getDate()}</span>
                  </div>
                  <div className="flex-1">
                    <h4 className="text-sm font-bold text-white truncate">{comp.name}</h4>
                    <p className="text-xs text-[#9db9b0] mt-0.5">{comp.status_text}</p>
                  </div>
                  <div className="flex -space-x-2">
                    {comp.team_members.map(m => (
                      <img key={m.id} src={m.avatar} className="w-6 h-6 rounded-full border border-[#16201c]" alt={m.name} />
                    ))}
                  </div>
               </div>
             ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
