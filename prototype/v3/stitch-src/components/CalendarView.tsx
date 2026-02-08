import React, { useState } from 'react';
import { MOCK_COMPETITIONS } from '../constants';
import { Competition } from '../types';
import { ChevronLeft, ChevronRight, Filter, Info } from 'lucide-react';

interface CalendarViewProps {
  onOpenDetail: (comp: Competition) => void;
}

const CalendarView: React.FC<CalendarViewProps> = ({ onOpenDetail }) => {
  const [currentMonth, setCurrentMonth] = useState(new Date(2023, 9)); // October 2023

  // Simple calendar generation logic
  const daysInMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate();
  const firstDay = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).getDay();
  // Adjust for Monday start (0=Sun, 1=Mon) -> (1=Mon ... 0=Sun)
  const startOffset = firstDay === 0 ? 6 : firstDay - 1;

  const days = Array.from({ length: 42 }, (_, i) => {
    const dayNum = i - startOffset + 1;
    if (dayNum > 0 && dayNum <= daysInMonth) return dayNum;
    return null;
  });

  const getEventsForDay = (day: number) => {
    if (!day) return [];
    const dateStr = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    
    return MOCK_COMPETITIONS.filter(c => 
      c.registration_deadline_at === dateStr || 
      c.submission_deadline_at === dateStr || 
      c.result_deadline_at === dateStr
    ).map(c => ({
       comp: c,
       type: c.registration_deadline_at === dateStr ? 'reg' : c.submission_deadline_at === dateStr ? 'sub' : 'res'
    }));
  };

  const handlePrev = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1));
  const handleNext = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1));

  return (
    <div className="flex flex-col h-full bg-[#111816] text-white animate-fade-in">
       {/* Toolbar */}
       <div className="flex flex-col md:flex-row items-start md:items-center justify-between px-8 py-6 border-b border-[#283933] gap-4">
         <div className="flex items-center gap-6">
           <h2 className="text-3xl font-bold tracking-tight">
             {currentMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}
           </h2>
           <div className="flex items-center bg-[#1c2723] rounded-xl border border-[#283933] p-1 shadow-sm">
              <button onClick={handlePrev} className="p-2 hover:bg-[#283933] rounded-lg text-[#9db9b0] hover:text-white transition-colors"><ChevronLeft size={20}/></button>
              <button onClick={() => setCurrentMonth(new Date())} className="px-4 text-sm font-bold text-white hover:text-[#2beead] transition-colors">今天</button>
              <button onClick={handleNext} className="p-2 hover:bg-[#283933] rounded-lg text-[#9db9b0] hover:text-white transition-colors"><ChevronRight size={20}/></button>
           </div>
         </div>
         
         <div className="flex items-center gap-4">
             {/* Legend */}
             <div className="flex gap-4 text-xs font-medium bg-[#1c2723] px-3 py-1.5 rounded-lg border border-[#283933]">
                <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span>
                    <span className="text-[#9db9b0]">报名截止</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                    <span className="text-[#9db9b0]">作品提交</span>
                </div>
             </div>
             
             <button className="flex items-center gap-2 px-4 py-2 bg-[#1c2723] border border-[#283933] rounded-xl text-sm font-medium text-[#9db9b0] hover:text-white hover:border-[#2beead] transition-colors">
                <Filter size={16} /> 筛选
             </button>
         </div>
       </div>

       {/* Grid Header */}
       <div className="grid grid-cols-7 border-b border-[#283933] bg-[#16201c]">
          {['周一', '周二', '周三', '周四', '周五', '周六', '周日'].map(d => (
            <div key={d} className="py-3 text-center text-xs font-bold text-[#9db9b0] uppercase tracking-wider">
              {d}
            </div>
          ))}
       </div>

       {/* Grid Body */}
       <div className="flex-1 grid grid-cols-7 grid-rows-6 bg-[#111816]">
          {days.map((day, idx) => {
            const events = getEventsForDay(day || 0);
            const isToday = day && new Date().getDate() === day && new Date().getMonth() === currentMonth.getMonth() && new Date().getFullYear() === currentMonth.getFullYear();
            
            return (
              <div 
                key={idx} 
                className={`border-b border-r border-[#283933] p-2 min-h-[100px] relative hover:bg-[#16201c] transition-colors group flex flex-col ${!day ? 'bg-[#111816]/50' : ''}`}
              >
                 {day && (
                   <>
                     <div className="flex justify-between items-start">
                        <span className={`text-sm font-bold w-7 h-7 flex items-center justify-center rounded-full transition-all ${
                        isToday 
                        ? 'bg-[#2beead] text-[#111816] shadow-[0_0_10px_rgba(43,238,173,0.4)]' 
                        : 'text-[#9db9b0] group-hover:text-white'
                        }`}>
                        {day}
                        </span>
                        {/* Add button placeholder on hover */}
                        <button className="opacity-0 group-hover:opacity-100 p-1 hover:bg-[#283933] rounded text-[#9db9b0] transition-opacity">
                             <span className="text-xs">+</span>
                        </button>
                     </div>
                     
                     <div className="mt-2 space-y-1.5 overflow-y-auto max-h-[100px] scrollbar-hide">
                       {events.map((evt, i) => (
                         <div 
                           key={i}
                           onClick={() => onOpenDetail(evt.comp)}
                           className={`px-2 py-1.5 rounded-md text-xs font-bold border cursor-pointer transition-all hover:scale-[1.02] shadow-sm flex items-center gap-2 ${
                             evt.type === 'reg' ? 'bg-blue-500/10 text-blue-300 border-blue-500/20 hover:bg-blue-500/20' :
                             evt.type === 'sub' ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20 hover:bg-emerald-500/20' :
                             'bg-purple-500/10 text-purple-300 border-purple-500/20 hover:bg-purple-500/20'
                           }`}
                         >
                            <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                                evt.type === 'reg' ? 'bg-blue-400' : evt.type === 'sub' ? 'bg-emerald-400' : 'bg-purple-400'
                            }`}></div>
                            <span className="truncate">{evt.comp.name}</span>
                         </div>
                       ))}
                     </div>
                   </>
                 )}
              </div>
            );
          })}
       </div>
    </div>
  );
};

export default CalendarView;
