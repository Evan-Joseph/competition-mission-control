import React, { useState, useMemo, useRef, useEffect } from 'react';
import { MOCK_COMPETITIONS } from '../constants';
import { Competition } from '../types';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Filter, Flag, Diamond, CalendarClock } from 'lucide-react';

interface TimelineProps {
  onOpenDetail: (comp: Competition) => void;
}

// Helper: Calculate days between dates
const getDaysDiff = (start: Date, end: Date) => {
  return Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
};

const TimelineView: React.FC<TimelineProps> = ({ onOpenDetail }) => {
  // 1. Define View Range (Fixed window for prototype: Oct 1, 2023 - Jan 31, 2024)
  const START_DATE = useMemo(() => new Date('2023-10-01'), []);
  const END_DATE = useMemo(() => new Date('2024-01-31'), []);
  const TOTAL_DAYS = getDaysDiff(START_DATE, END_DATE);
  
  // 2. Zoom State (Pixels per day)
  const [pixelsPerDay, setPixelsPerDay] = useState(30); // Default zoom
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // 3. Generate Calendar Header Data
  const calendarMonths = useMemo(() => {
    const months = [];
    let curr = new Date(START_DATE);
    while (curr <= END_DATE) {
      months.push({
        name: curr.toLocaleString('default', { month: 'short', year: 'numeric' }),
        days: new Date(curr.getFullYear(), curr.getMonth() + 1, 0).getDate(),
        date: new Date(curr)
      });
      curr.setMonth(curr.getMonth() + 1);
    }
    return months;
  }, [START_DATE, END_DATE]);

  // 4. Calculate Position for a specific date string
  const getPosition = (dateStr: string | null) => {
    if (!dateStr) return -1;
    const date = new Date(dateStr);
    const daysFromStart = getDaysDiff(START_DATE, date);
    return daysFromStart * pixelsPerDay;
  };

  // 5. Scroll to "Today" on mount
  useEffect(() => {
    if (scrollContainerRef.current) {
        const todayPos = getPosition(new Date().toISOString().split('T')[0]);
        // Center it roughly
        scrollContainerRef.current.scrollLeft = Math.max(0, todayPos - 400);
    }
  }, [pixelsPerDay]); // Re-scroll when zoom changes

  const handleZoomIn = () => setPixelsPerDay(prev => Math.min(prev + 10, 100));
  const handleZoomOut = () => setPixelsPerDay(prev => Math.max(prev - 10, 10));

  // Mock "Today" for visual reference (Oct 24th based on other components)
  const TODAY_STR = '2023-10-24';
  const currentPos = getPosition(TODAY_STR);

  return (
    <div className="flex flex-col h-full bg-[#111816] text-white animate-fade-in select-none">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#283933] bg-[#16201c] flex-shrink-0 z-30">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <CalendarClock className="text-emerald-400" size={24} />
            <h2 className="text-xl font-bold">竞赛甘特图</h2>
          </div>
          <div className="hidden md:flex items-center gap-4 text-xs font-medium text-[#9db9b0] ml-6 bg-[#111816] px-3 py-1.5 rounded-lg border border-[#283933]">
             <span className="flex items-center gap-1.5"><Diamond size={12} className="text-blue-400 fill-blue-400/20"/> 报名截止</span>
             <span className="w-px h-3 bg-[#283933]"></span>
             <span className="flex items-center gap-1.5"><Flag size={12} className="text-rose-400 fill-rose-400/20"/> 提交作品</span>
             <span className="w-px h-3 bg-[#283933]"></span>
             <span className="flex items-center gap-1.5"><div className="w-3 h-1.5 rounded-full bg-emerald-500/30 border border-emerald-500/50"></div> 备赛周期</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
           <div className="flex items-center bg-[#1c2723] rounded-lg border border-[#283933] p-0.5">
             <button onClick={handleZoomOut} disabled={pixelsPerDay <= 10} className="p-1.5 hover:bg-[#283933] rounded text-[#9db9b0] hover:text-white disabled:opacity-30 transition-colors"><ZoomOut size={16}/></button>
             <span className="px-2 text-xs font-mono text-[#9db9b0] w-12 text-center">{Math.round(pixelsPerDay / 30 * 100)}%</span>
             <button onClick={handleZoomIn} disabled={pixelsPerDay >= 100} className="p-1.5 hover:bg-[#283933] rounded text-[#9db9b0] hover:text-white disabled:opacity-30 transition-colors"><ZoomIn size={16}/></button>
           </div>
        </div>
      </div>

      {/* Main Gantt Area */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left Sidebar (Task Names) - Sticky */}
        <div className="w-64 border-r border-[#283933] bg-[#16201c] z-20 shadow-[4px_0_24px_rgba(0,0,0,0.5)] flex-shrink-0 flex flex-col">
          <div className="h-12 border-b border-[#283933] px-4 flex items-center bg-[#1c2723]">
            <span className="text-xs font-bold text-[#9db9b0] uppercase tracking-wider">项目列表</span>
          </div>
          <div className="flex-1 overflow-hidden">
            {MOCK_COMPETITIONS.map((comp, idx) => (
              <div 
                key={comp.id} 
                className={`h-16 px-4 flex flex-col justify-center border-b border-[#283933]/30 hover:bg-[#1c2723] cursor-pointer transition-colors group ${
                    idx % 2 === 0 ? 'bg-[#16201c]' : 'bg-[#141d19]'
                }`}
                onClick={() => onOpenDetail(comp)}
              >
                <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-white truncate group-hover:text-emerald-400 transition-colors">{comp.name}</span>
                </div>
                <span className="text-xs text-[#9db9b0] truncate mt-0.5">{comp.type} · {comp.status_text}</span>
              </div>
            ))}
            {/* Empty rows filler */}
            {Array.from({length: 10}).map((_, i) => (
                <div key={i} className="h-16 border-b border-[#283933]/10 bg-transparent"></div>
            ))}
          </div>
        </div>

        {/* Right Timeline Grid - Scrollable */}
        <div className="flex-1 overflow-auto bg-[#111816] relative custom-scrollbar" ref={scrollContainerRef}>
           <div style={{ width: TOTAL_DAYS * pixelsPerDay, minWidth: '100%' }}>
                
                {/* 1. Calendar Header (Sticky Top) */}
                <div className="sticky top-0 z-10 flex h-12 bg-[#16201c] border-b border-[#283933]">
                    {calendarMonths.map((month, idx) => (
                        <div key={idx} className="flex-shrink-0 border-r border-[#283933]/50" style={{ width: month.days * pixelsPerDay }}>
                            <div className="px-2 py-1 text-xs font-bold text-[#9db9b0] bg-[#1c2723] sticky left-0">{month.name}</div>
                            <div className="flex items-end h-full pb-1">
                                {Array.from({length: month.days}).map((_, d) => (
                                    <div key={d} className="flex-1 text-center border-r border-[#283933]/30 h-3 flex items-end justify-center">
                                        {(d + 1) % 7 === 1 && <span className="text-[9px] text-[#5c7066] leading-none mb-1">{d + 1}</span>}
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>

                {/* 2. Grid Lines & Today Marker */}
                <div className="absolute inset-0 top-12 pointer-events-none">
                    {/* Vertical Lines for each week */}
                    {Array.from({length: Math.ceil(TOTAL_DAYS / 7)}).map((_, i) => (
                        <div 
                            key={i} 
                            className="absolute top-0 bottom-0 border-r border-[#283933]/10" 
                            style={{ left: i * 7 * pixelsPerDay, width: pixelsPerDay * 7 }}
                        ></div>
                    ))}
                    {/* Today Marker */}
                    {currentPos > 0 && (
                        <div 
                            className="absolute top-0 bottom-0 border-l-2 border-emerald-500/50 z-0 flex flex-col items-center"
                            style={{ left: currentPos }}
                        >
                            <div className="bg-emerald-500 text-[#111816] text-[9px] font-bold px-1.5 py-0.5 rounded-b shadow-lg transform translate-y-[-2px]">
                                TODAY
                            </div>
                        </div>
                    )}
                </div>

                {/* 3. Task Rows */}
                <div className="relative pt-0">
                    {MOCK_COMPETITIONS.map((comp, idx) => {
                        const regPos = getPosition(comp.registration_deadline_at);
                        const subPos = getPosition(comp.submission_deadline_at);
                        const hasReg = regPos > 0;
                        const hasSub = subPos > 0;
                        
                        // If we have both, we draw a bar. If only one, we draw just the icon.
                        // If subPos is missing, assume a default duration for visualization or just end at view edge
                        const barStart = hasReg ? regPos : (hasSub ? subPos - 100 : 0);
                        const barWidth = hasSub ? (subPos - barStart) : 100;

                        return (
                            <div 
                                key={comp.id} 
                                className={`h-16 border-b border-[#283933]/30 relative hover:bg-[#1c2723]/30 transition-colors group ${
                                    idx % 2 === 0 ? '' : 'bg-[#141d19]/30'
                                }`}
                                onClick={() => onOpenDetail(comp)}
                            >
                                {/* The Connection Bar (Prep Phase) */}
                                {hasReg && hasSub && (
                                    <div 
                                        className="absolute top-1/2 -translate-y-1/2 h-2 bg-emerald-500/20 rounded-full border border-emerald-500/30"
                                        style={{ left: barStart, width: barWidth }}
                                    ></div>
                                )}

                                {/* Registration Diamond */}
                                {hasReg && (
                                    <div 
                                        className="absolute top-1/2 -translate-y-1/2 z-10 group-hover:scale-125 transition-transform cursor-pointer"
                                        style={{ left: regPos - 7 }} // Center the 14px icon
                                        title={`报名截止: ${comp.registration_deadline_at}`}
                                    >
                                        <div className="w-3.5 h-3.5 rotate-45 bg-[#111816] border-2 border-blue-400 shadow-sm"></div>
                                        <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-[9px] bg-blue-500/20 text-blue-300 px-1 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap transition-opacity">
                                            报名
                                        </span>
                                    </div>
                                )}

                                {/* Submission Flag */}
                                {hasSub && (
                                    <div 
                                        className="absolute top-1/2 -translate-y-1/2 z-10 group-hover:scale-125 transition-transform cursor-pointer"
                                        style={{ left: subPos - 1 }} 
                                        title={`提交截止: ${comp.submission_deadline_at}`}
                                    >
                                        <Flag size={14} className="text-rose-400 fill-rose-400" />
                                        <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-[9px] bg-rose-500/20 text-rose-300 px-1 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap transition-opacity">
                                            提交
                                        </span>
                                        {/* Vertical Drop Line for deadline */}
                                        <div className="absolute top-3 left-[6px] w-px h-[200px] bg-rose-500/20 pointer-events-none opacity-0 group-hover:opacity-100"></div>
                                    </div>
                                )}

                                {/* Label if bar is long enough */}
                                {hasReg && hasSub && barWidth > 100 && (
                                    <div 
                                        className="absolute top-1/2 -translate-y-1/2 text-[10px] font-bold text-emerald-500/70 pointer-events-none select-none text-center truncate px-2"
                                        style={{ left: barStart, width: barWidth }}
                                    >
                                        备赛冲刺期 ({Math.round(barWidth / pixelsPerDay)}天)
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
           </div>
        </div>
      </div>
    </div>
  );
};

export default TimelineView;
