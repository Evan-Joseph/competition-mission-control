import React, { useState, useRef, useEffect } from 'react';
import { MOCK_WHITEBOARD_ITEMS, TEAM_MEMBERS } from '../constants';
import { WhiteboardItem } from '../types';
import { MousePointer2, StickyNote, Image as ImageIcon, Type, Hand, Undo, Redo, Plus, Minus, Move, Trash2 } from 'lucide-react';

const Whiteboard: React.FC = () => {
  const [items, setItems] = useState<WhiteboardItem[]>(MOCK_WHITEBOARD_ITEMS);
  const [zoom, setZoom] = useState(100);
  const [activeTool, setActiveTool] = useState<'select' | 'hand' | 'note'>('select');
  const [cursorPos, setCursorPos] = useState({ x: 400, y: 300 });

  // Dragging Logic
  const [isDragging, setIsDragging] = useState(false);
  const [dragItemId, setDragItemId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  // Selected item state (separate from dragging)
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const handleMouseDown = (e: React.MouseEvent, id: string) => {
    if (activeTool !== 'select') return;
    e.stopPropagation();
    
    setSelectedId(id);
    const item = items.find(i => i.id === id);
    if (!item) return;

    if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const scale = zoom / 100;
        const mouseX = (e.clientX - rect.left) / scale;
        const mouseY = (e.clientY - rect.top) / scale;

        setDragOffset({ x: mouseX - item.x, y: mouseY - item.y });
        setDragItemId(id);
        setIsDragging(true);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging && dragItemId && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const scale = zoom / 100;
        const mouseX = (e.clientX - rect.left) / scale;
        const mouseY = (e.clientY - rect.top) / scale;

        setItems(prev => prev.map(item => 
           item.id === dragItemId 
             ? { ...item, x: mouseX - dragOffset.x, y: mouseY - dragOffset.y }
             : item
        ));
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    setDragItemId(null);
  };

  const handleCanvasClick = () => {
      setSelectedId(null);
  }

  const handleDeleteSelected = () => {
      if (selectedId) {
          setItems(prev => prev.filter(i => i.id !== selectedId));
          setSelectedId(null);
      }
  }

  useEffect(() => {
     // Animate fake cursor
     const interval = setInterval(() => {
        setCursorPos(prev => ({
           x: prev.x + (Math.random() - 0.5) * 50,
           y: prev.y + (Math.random() - 0.5) * 50
        }));
     }, 2000);

     // Key listener for delete
     const handleKeyDown = (e: KeyboardEvent) => {
         if (e.key === 'Backspace' || e.key === 'Delete') {
             if (selectedId) {
                 setItems(prev => prev.filter(i => i.id !== selectedId));
                 setSelectedId(null);
             }
         }
     };
     window.addEventListener('keydown', handleKeyDown);

     return () => {
         clearInterval(interval);
         window.removeEventListener('keydown', handleKeyDown);
     }
  }, [selectedId]);

  return (
    <div 
      className={`absolute inset-0 bg-[#111816] overflow-hidden ${activeTool === 'hand' ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'}`}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onMouseDown={handleCanvasClick}
      ref={containerRef}
    >
       {/* Dot Grid Background */}
       <div 
         className="absolute inset-0 opacity-20 pointer-events-none"
         style={{ 
           backgroundImage: 'radial-gradient(#3b544b 1px, transparent 1px)', 
           backgroundSize: '24px 24px',
           transform: `scale(${zoom / 100})`,
           transformOrigin: '0 0'
         }}
       ></div>

       {/* Toolbar */}
       <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-50">
         <div className="flex items-center gap-1 p-1.5 bg-[#1c2723]/90 backdrop-blur-xl border border-[#3b544b] rounded-full shadow-2xl">
            <button 
              onClick={() => setActiveTool('select')}
              className={`p-2.5 rounded-full transition-colors ${activeTool === 'select' ? 'bg-[#2beead] text-[#111816]' : 'text-[#9db9b0] hover:text-white hover:bg-[#283933]'}`}
              title="选择工具 (V)"
            >
              <MousePointer2 size={20} className="fill-current" />
            </button>
            <button 
              onClick={() => setActiveTool('hand')}
              className={`p-2.5 rounded-full transition-colors ${activeTool === 'hand' ? 'bg-[#2beead] text-[#111816]' : 'text-[#9db9b0] hover:text-white hover:bg-[#283933]'}`}
              title="漫游 (H)"
            >
              <Hand size={20} />
            </button>
            <div className="w-px h-6 bg-[#3b544b] mx-1"></div>
            <button 
              onClick={() => {
                const newItem: WhiteboardItem = {
                  id: Date.now().toString(),
                  type: 'note',
                  content: '点击编辑...',
                  x: 300, // Center-ish relative to view
                  y: 300,
                  color: ['#fef08a', '#bae6fd', '#bbf7d0', '#fbcfe8'][Math.floor(Math.random()*4)],
                  author: TEAM_MEMBERS[0]
                };
                setItems([...items, newItem]);
                setActiveTool('select');
                setSelectedId(newItem.id);
              }}
              className="p-2.5 rounded-full text-[#9db9b0] hover:text-white hover:bg-[#283933] transition-colors"
              title="添加便签"
            >
              <StickyNote size={20} />
            </button>
            <button className="p-2.5 rounded-full text-[#9db9b0] hover:text-white hover:bg-[#283933] transition-colors" title="文本 (模拟)">
              <Type size={20} />
            </button>
            <button className="p-2.5 rounded-full text-[#9db9b0] hover:text-white hover:bg-[#283933] transition-colors" title="图片 (模拟)">
              <ImageIcon size={20} />
            </button>
            
            {selectedId && (
                <>
                    <div className="w-px h-6 bg-[#3b544b] mx-1"></div>
                    <button 
                        onClick={handleDeleteSelected}
                        className="p-2.5 rounded-full text-rose-400 hover:text-white hover:bg-rose-500/20 transition-colors" 
                        title="删除选中 (Del)"
                    >
                        <Trash2 size={20} />
                    </button>
                </>
            )}

            <div className="w-px h-6 bg-[#3b544b] mx-1"></div>
            <button className="p-2.5 rounded-full text-[#9db9b0] hover:text-white hover:bg-[#283933] transition-colors">
              <Undo size={20} />
            </button>
            <button className="p-2.5 rounded-full text-[#9db9b0] hover:text-white hover:bg-[#283933] transition-colors">
              <Redo size={20} />
            </button>
         </div>
       </div>

       {/* Zoom Controls */}
       <div className="absolute bottom-8 right-8 z-50 flex items-center gap-2 bg-[#1c2723]/90 backdrop-blur border border-[#3b544b] p-1.5 rounded-lg shadow-lg">
          <button onClick={() => setZoom(z => Math.max(10, z - 10))} className="p-1 text-[#9db9b0] hover:text-white"><Minus size={16} /></button>
          <span className="text-xs font-mono text-white w-8 text-center">{zoom}%</span>
          <button onClick={() => setZoom(z => Math.min(200, z + 10))} className="p-1 text-[#9db9b0] hover:text-white"><Plus size={16} /></button>
       </div>

       {/* Canvas Content */}
       <div 
         className="absolute inset-0 origin-top-left transition-transform duration-75" 
         style={{ transform: `scale(${zoom / 100})` }}
       >
          {items.map(item => (
            <div 
              key={item.id}
              className={`absolute shadow-xl hover:shadow-2xl transition-shadow group ${activeTool === 'select' ? 'cursor-move' : ''}`}
              style={{ 
                left: item.x, 
                top: item.y,
                transform: `rotate(${item.rotation || 0}deg)`,
                zIndex: dragItemId === item.id ? 100 : (selectedId === item.id ? 50 : 1)
              }}
              onMouseDown={(e) => handleMouseDown(e, item.id)}
            >
              {item.type === 'note' && (
                <div 
                  className="w-48 h-48 p-4 text-[#111816] font-medium leading-relaxed flex flex-col relative"
                  style={{ backgroundColor: item.color, fontFamily: '"Comic Sans MS", "Chalkboard SE", sans-serif' }}
                >
                  <div className="opacity-40 mb-2 flex justify-between">
                      <StickyNote size={16} className="fill-current" />
                      {activeTool === 'select' && <Move size={14} className="opacity-0 group-hover:opacity-50" />}
                  </div>
                  <textarea 
                    className="bg-transparent w-full h-full resize-none focus:outline-none"
                    defaultValue={item.content}
                    onMouseDown={(e) => e.stopPropagation()} // Allow text selection without dragging
                  />
                  <div className="absolute bottom-2 left-2 flex items-center gap-1 opacity-60 pointer-events-none">
                     <div className="w-5 h-5 rounded-full bg-white/50 flex items-center justify-center text-[10px] font-bold">
                       {item.author.name[0]}
                     </div>
                  </div>
                  {/* Selection Ring */}
                  {selectedId === item.id && (
                    <div className="absolute inset-0 border-2 border-[#2beead] pointer-events-none animate-pulse"></div>
                  )}
                </div>
              )}
              
              {item.type === 'image' && (
                <div className="bg-white p-2 rounded-lg transform rotate-2">
                   <div className="bg-gray-200 w-48 h-32 rounded flex items-center justify-center text-gray-400">
                     <ImageIcon size={32} />
                   </div>
                   <div className="absolute -top-3 -right-3 bg-red-500 text-white text-[10px] px-2 py-0.5 rounded shadow">关键截图</div>
                </div>
              )}

              {item.type === 'text' && (
                <div className="text-white text-2xl font-bold border border-dashed border-transparent hover:border-[#2beead] p-2 rounded">
                  {item.content}
                </div>
              )}
            </div>
          ))}

          {/* Fake Collaborator Cursor */}
          <div 
            className="absolute transition-all duration-1000 ease-in-out z-40 pointer-events-none"
            style={{ left: cursorPos.x, top: cursorPos.y }}
          >
             <MousePointer2 size={24} className="text-pink-500 fill-pink-500" />
             <div className="ml-5 -mt-2 bg-pink-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded shadow whitespace-nowrap">
               Sarah Lin
             </div>
          </div>
       </div>
    </div>
  );
};

export default Whiteboard;
