import React, { useState } from 'react';
import { MOCK_COMPETITIONS } from '../constants';
import { Competition } from '../types';
import { Calendar, MoreHorizontal, Filter, Search, Award, TrendingUp, Users, CheckCircle2, Circle } from 'lucide-react';

interface ListProps {
  onOpenDetail: (comp: Competition) => void;
}

const CompetitionList: React.FC<ListProps> = ({ onOpenDetail }) => {
  const [viewFilter, setViewFilter] = useState<'all' | 'active'>('all');
  const [searchTerm, setSearchTerm] = useState('');

  const filteredCompetitions = MOCK_COMPETITIONS.filter(c => {
    const matchesFilter = viewFilter === 'active' ? c.registered : true;
    const matchesSearch = c.name.toLowerCase().includes(searchTerm.toLowerCase()) || c.tags.some(t => t.toLowerCase().includes(searchTerm.toLowerCase()));
    return matchesFilter && matchesSearch;
  });

  const thisWeek = filteredCompetitions.filter(c => new Date(c.registration_deadline_at) < new Date('2023-11-01'));
  const future = filteredCompetitions.filter(c => new Date(c.registration_deadline_at) >= new Date('2023-11-01'));

  // Logic: Map status to discrete steps instead of arbitrary percentage
  // Steps: 1.筹备 2.组队 3.报名 4.备赛 5.提交
  const getStage = (comp: Competition) => {
      // Mock logic based on data fields
      if (comp.status_text.includes('提交') || comp.status_text.includes('完结')) return 5;
      if (comp.status_text.includes('刷题') || comp.status_text.includes('准备') || comp.status_text.includes('初赛')) return 4;
      if (comp.registered) return 3;
      if (comp.team_members.length > 1) return 2;
      return 1;
  };

  const STAGES = ['筹备', '组队', '报名', '备赛', '提交'];

  return (
    <div className="p-8 max-w-6xl mx-auto w-full animate-fade-in pb-24">
       <div className="flex flex-col md:flex-row justify-between items-end mb-8 gap-4">
         <div>
             <h1 className="text-3xl font-bold text-white mb-2">竞赛列表</h1>
             <p className="text-[#9db9b0]">统一管理赛事生命周期，从立项到最终提交。</p>
         </div>
         
         <div className="flex items-center gap-3 w-full md:w-auto">
           <div className="relative flex-1 md:w-64">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9db9b0]"><Search size={16}/></span>
              <input 
                type="text" 
                placeholder="搜索项目..."
                className="w-full bg-[#1c2723] border border-[#283933] rounded-xl py-2 pl-9 pr-4 text-sm text-white focus:outline-none focus:border-[#2beead] transition-all"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
           </div>
           
           <button 
             onClick={() => setViewFilter(viewFilter === 'all' ? 'active' : 'all')}
             className={`px-4 py-2 border rounded-xl text-sm font-medium transition-colors flex items-center gap-2 whitespace-nowrap ${
               viewFilter === 'active' 
                 ? 'bg-[#2beead] text-[#111816] border-[#2beead]' 
                 : 'bg-[#1c2723] border-[#283933] text-white hover:border-[#2beead]'
             }`}
           >
             <Filter size={14} /> {viewFilter === 'active' ? '只看进行中' : '全部项目'}
           </button>
         </div>
       </div>

       <div className="space-y-10">
          {/* Active / High Priority */}
          {thisWeek.length > 0 && (
            <div>
              <h3 className="text-sm font-bold text-[#9db9b0] uppercase tracking-wider mb-4 pl-1 flex items-center gap-2">
                 <TrendingUp size={16} /> 进行中 / 需关注
              </h3>
              <div className="grid grid-cols-1 gap-4">
                 {thisWeek.map(comp => {
                    const currentStage = getStage(comp);
                    
                    return (
                        <div 
                        key={comp.id} 
                        className="group bg-[#1c2723] border border-[#283933] rounded-2xl p-6 flex flex-col md:flex-row items-start md:items-center gap-6 hover:border-[#9db9b0] transition-colors cursor-pointer"
                        onClick={() => onOpenDetail(comp)}
                        >
                        {/* Date Badge */}
                        <div className="flex flex-col items-center justify-center w-16 h-16 bg-[#16201c] rounded-xl border border-[#283933] shrink-0 group-hover:border-[#2beead] transition-colors shadow-sm">
                            <span className="text-xs text-[#9db9b0] font-bold uppercase">{comp.registration_deadline_at.slice(5, 7)}月</span>
                            <span className="text-2xl text-white font-bold">{comp.registration_deadline_at.slice(8, 10)}</span>
                        </div>
                        
                        {/* Info Block */}
                        <div className="flex-1 min-w-0 w-full">
                            <div className="flex flex-col md:flex-row md:items-center gap-3 mb-3">
                                <h4 className="text-xl font-bold text-white truncate">{comp.name}</h4>
                                <div className="flex flex-wrap gap-2">
                                    {comp.tags.map(tag => (
                                        <span key={tag} className="px-2 py-0.5 rounded text-[10px] font-medium bg-[#111816] text-[#9db9b0] border border-[#283933]">{tag}</span>
                                    ))}
                                </div>
                            </div>

                            {/* New Phase Stepper Logic */}
                            <div className="flex flex-col gap-2">
                                <div className="flex items-center gap-1 w-full max-w-md">
                                    {STAGES.map((label, idx) => {
                                        const stepNum = idx + 1;
                                        const isCompleted = stepNum <= currentStage;
                                        const isCurrent = stepNum === currentStage;
                                        
                                        return (
                                            <div key={idx} className="flex-1 flex flex-col gap-1 group/step">
                                                <div className={`h-1.5 rounded-full transition-all duration-500 ${
                                                    isCompleted ? 'bg-emerald-500' : 'bg-[#283933]'
                                                } ${isCurrent ? 'shadow-[0_0_8px_rgba(16,185,129,0.5)]' : ''}`}></div>
                                            </div>
                                        );
                                    })}
                                </div>
                                <div className="flex items-center justify-between max-w-md text-xs">
                                    <span className="text-emerald-400 font-bold">当前阶段: {STAGES[currentStage - 1]}</span>
                                    <span className="text-[#9db9b0]">{comp.status_text}</span>
                                </div>
                            </div>
                        </div>

                        {/* Team & Meta */}
                        <div className="flex flex-row md:flex-col items-center md:items-end justify-between w-full md:w-auto gap-4 md:gap-2 pl-0 md:pl-6 md:border-l border-[#283933]">
                             <div className="flex -space-x-2 shrink-0">
                                {comp.team_members.map(m => (
                                    <img key={m.id} src={m.avatar} className="w-8 h-8 rounded-full border-2 border-[#1c2723]" alt={m.name} title={m.name} />
                                ))}
                                {comp.team_members.length === 0 && (
                                    <div className="w-8 h-8 rounded-full bg-[#283933] border-2 border-[#1c2723] flex items-center justify-center">
                                        <Users size={14} className="text-[#9db9b0]"/>
                                    </div>
                                )}
                            </div>
                            <span className={`text-xs px-2 py-1 rounded font-bold ${
                                comp.registered ? 'bg-emerald-500/10 text-emerald-400' : 'bg-blue-500/10 text-blue-400'
                            }`}>
                                {comp.registered ? '已报名' : '未报名'}
                            </span>
                        </div>
                        </div>
                    );
                 })}
              </div>
            </div>
          )}

          {/* Future Planning */}
          {future.length > 0 && (
            <div>
              <h3 className="text-sm font-bold text-[#9db9b0] uppercase tracking-wider mb-4 pl-1 flex items-center gap-2">
                 <Calendar size={16} /> 远期规划
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 {future.map(comp => (
                    <div 
                      key={comp.id} 
                      className="group bg-[#1c2723]/50 border border-[#283933] rounded-2xl p-5 flex items-center gap-4 hover:bg-[#1c2723] hover:border-[#9db9b0] transition-colors cursor-pointer"
                      onClick={() => onOpenDetail(comp)}
                    >
                       <div className="flex flex-col items-center justify-center w-12 h-12 bg-[#16201c] rounded-lg border border-[#283933] shrink-0 opacity-70">
                          <Award size={20} className="text-[#9db9b0]" />
                       </div>
                       
                       <div className="flex-1 min-w-0">
                          <h4 className="text-base font-bold text-white truncate opacity-90">{comp.name}</h4>
                          <div className="flex items-center gap-2 mt-1">
                             <span className="w-1.5 h-1.5 rounded-full bg-[#283933]"></span>
                             <p className="text-sm text-[#9db9b0] truncate">预计报名: {comp.registration_deadline_at}</p>
                          </div>
                       </div>

                       <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                          <MoreHorizontal size={20} className="text-[#9db9b0]" />
                       </div>
                    </div>
                 ))}
              </div>
            </div>
          )}
          
          {filteredCompetitions.length === 0 && (
              <div className="py-20 text-center">
                  <div className="w-16 h-16 bg-[#1c2723] rounded-full flex items-center justify-center mx-auto mb-4 text-[#9db9b0]">
                      <Search size={32} />
                  </div>
                  <h3 className="text-white font-bold mb-1">未找到相关竞赛</h3>
                  <p className="text-[#9db9b0]">尝试更换搜索关键词或筛选条件</p>
              </div>
          )}
       </div>
    </div>
  );
};

export default CompetitionList;
