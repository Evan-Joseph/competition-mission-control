import React, { useState } from 'react';
import { Competition, FileItem } from '../types';
import { MOCK_FILES, MOCK_LOGS } from '../constants';
import { X, MoreHorizontal, UserPlus, Clock, Layout, FileText, Activity, PenTool, UploadCloud, File as FileIcon } from 'lucide-react';
import Whiteboard from './Whiteboard';

interface DetailProps {
  competition: Competition;
  onClose: () => void;
}

const CompetitionDetail: React.FC<DetailProps> = ({ competition, onClose }) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'whiteboard' | 'files' | 'activity'>('overview');
  const [files, setFiles] = useState<FileItem[]>(MOCK_FILES);

  // Filter logs for this competition (simple string matching for prototype)
  const activityLogs = MOCK_LOGS.filter(log => log.target.includes(competition.name.substring(0, 4)) || log.target === competition.name);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
       {/* Backdrop */}
       <div className="absolute inset-0 bg-[#000]/60 backdrop-blur-sm" onClick={onClose}></div>

       {/* Drawer */}
       <div className="relative w-full md:w-[85%] lg:w-[80%] h-full bg-[#16201c] border-l border-[#283933] shadow-2xl flex flex-col animate-slide-in-right">
          
          {/* Header */}
          <div className="h-auto min-h-[80px] border-b border-[#283933] bg-[#111816] flex flex-col flex-shrink-0 z-10">
             <div className="flex items-center justify-between px-6 pt-5 pb-2">
                <div>
                   <h1 className="text-2xl font-bold text-white flex items-center gap-3">
                      {competition.name}
                      <span className={`px-2 py-0.5 rounded-full text-xs font-bold border ${
                          competition.registered 
                           ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                           : 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                      }`}>
                        {competition.registered ? '已报名' : '规划中'}
                      </span>
                   </h1>
                   <div className="flex items-center gap-4 mt-2 text-sm text-[#9db9b0]">
                      <span className="flex items-center gap-1"><Clock size={14}/> 提交截止: {competition.submission_deadline_at || '待定'}</span>
                      <span>·</span>
                      <span>ID: {competition.id.toUpperCase()}</span>
                   </div>
                </div>
                
                <div className="flex items-center gap-3">
                   <div className="flex -space-x-2 mr-4">
                      {competition.team_members.map(m => (
                         <img key={m.id} src={m.avatar} alt={m.name} className="w-8 h-8 rounded-full border-2 border-[#111816]" />
                      ))}
                      <button className="w-8 h-8 rounded-full bg-[#283933] text-[#9db9b0] flex items-center justify-center border-2 border-[#111816] text-xs hover:text-white hover:bg-[#3b544b]">+</button>
                   </div>
                   <button className="flex items-center gap-2 h-9 px-4 rounded-lg bg-[#2beead] text-[#111816] font-bold text-sm hover:bg-[#2beead]/90 transition-colors">
                      <UserPlus size={16} /> 邀请协作
                   </button>
                   <div className="w-px h-6 bg-[#283933] mx-1"></div>
                   <button onClick={onClose} className="p-2 rounded-lg text-[#9db9b0] hover:text-white hover:bg-[#283933]">
                      <X size={20} />
                   </button>
                </div>
             </div>

             {/* Tabs */}
             <div className="flex px-6 gap-8 mt-4">
                {[
                  { id: 'overview', label: '概览', icon: Layout },
                  { id: 'whiteboard', label: '画板', icon: PenTool },
                  { id: 'files', label: '文件', icon: FileText },
                  { id: 'activity', label: '动态', icon: Activity },
                ].map(tab => (
                   <button
                     key={tab.id}
                     onClick={() => setActiveTab(tab.id as any)}
                     className={`pb-3 text-sm font-medium flex items-center gap-2 relative transition-colors ${
                        activeTab === tab.id ? 'text-white' : 'text-[#9db9b0] hover:text-white'
                     }`}
                   >
                     <tab.icon size={16} />
                     {tab.label}
                     {activeTab === tab.id && (
                        <span className="absolute bottom-0 left-0 w-full h-0.5 bg-[#2beead] shadow-[0_0_8px_rgba(43,238,173,0.6)]"></span>
                     )}
                   </button>
                ))}
             </div>
          </div>

          {/* Content */}
          <div className="flex-1 bg-[#111816] relative overflow-hidden">
             {activeTab === 'whiteboard' && <Whiteboard />}
             
             {activeTab === 'overview' && (
                <div className="p-8 max-w-4xl overflow-y-auto h-full pb-24">
                   <div className="grid grid-cols-3 gap-6">
                      <div className="col-span-2 space-y-6">
                         <div className="bg-[#1c2723] rounded-xl border border-[#283933] p-6">
                            <h3 className="text-lg font-bold text-white mb-4">项目进度</h3>
                            <div className="w-full bg-[#111816] rounded-full h-2 mb-2">
                               <div className="bg-emerald-500 h-2 rounded-full w-[65%]"></div>
                            </div>
                            <div className="flex justify-between text-xs text-[#9db9b0]">
                               <span>报名阶段</span>
                               <span className="text-white">提交材料 (65%)</span>
                               <span>结果公布</span>
                            </div>
                         </div>
                         
                         <div className="bg-[#1c2723] rounded-xl border border-[#283933] p-6">
                            <div className="flex justify-between items-center mb-4">
                               <h3 className="text-lg font-bold text-white">备注与说明</h3>
                               <button className="text-xs text-[#2beead]">编辑</button>
                            </div>
                            <p className="text-[#9db9b0] text-sm leading-relaxed">
                               本周重点是完成前端原型的交互逻辑梳理，特别是 Whiteboard 组件的实时同步逻辑。<br/><br/>
                               需要确认 API 接口文档是否已经更新到 V2 版本。
                            </p>
                         </div>
                      </div>
                      <div className="space-y-6">
                         <div className="bg-[#1c2723] rounded-xl border border-[#283933] p-6">
                            <h3 className="text-sm font-bold text-white mb-4 uppercase tracking-wider">关键链接</h3>
                            <ul className="space-y-3">
                               <li className="flex items-center gap-2 text-sm text-[#2beead] hover:underline cursor-pointer">
                                  <div className="w-1 h-1 rounded-full bg-[#2beead]"></div> 官方网站入口
                               </li>
                               <li className="flex items-center gap-2 text-sm text-[#2beead] hover:underline cursor-pointer">
                                  <div className="w-1 h-1 rounded-full bg-[#2beead]"></div> 往届获奖作品集
                               </li>
                            </ul>
                         </div>
                      </div>
                   </div>
                </div>
             )}

             {activeTab === 'files' && (
                <div className="p-8 h-full overflow-y-auto">
                   <div className="border-2 border-dashed border-[#283933] rounded-2xl p-8 flex flex-col items-center justify-center text-[#9db9b0] hover:border-[#2beead] hover:text-[#2beead] transition-colors cursor-pointer mb-8 bg-[#1c2723]/30">
                      <UploadCloud size={48} className="mb-4" />
                      <p className="font-bold">点击或拖拽上传文件</p>
                      <p className="text-xs opacity-60 mt-1">支持 PDF, Word, PNG, JPG (Max 50MB)</p>
                   </div>
                   
                   <div className="space-y-3">
                      {files.map(file => (
                         <div key={file.id} className="flex items-center p-4 bg-[#1c2723] border border-[#283933] rounded-xl hover:border-[#9db9b0] transition-colors group">
                            <div className="w-10 h-10 rounded-lg bg-[#283933] flex items-center justify-center text-white mr-4">
                               <FileIcon size={20} />
                            </div>
                            <div className="flex-1 min-w-0">
                               <h4 className="text-white font-bold text-sm truncate">{file.name}</h4>
                               <p className="text-xs text-[#9db9b0] mt-0.5">{file.size} · {file.uploaded_by.name} · {file.uploaded_at}</p>
                            </div>
                            <button className="opacity-0 group-hover:opacity-100 px-3 py-1.5 text-xs font-bold text-[#111816] bg-[#2beead] rounded-lg transition-all">
                               下载
                            </button>
                         </div>
                      ))}
                   </div>
                </div>
             )}

             {activeTab === 'activity' && (
                <div className="p-8 h-full overflow-y-auto">
                   <div className="space-y-8 relative pl-2">
                     <div className="absolute left-[7px] top-2 bottom-2 w-[2px] bg-[#283933]"></div>
                     {activityLogs.length > 0 ? activityLogs.map((log, idx) => (
                       <div key={log.id} className="relative pl-8">
                         <div className={`absolute left-0 top-1.5 w-3.5 h-3.5 rounded-full border-2 z-10 bg-[#1c2723] ${
                            idx === 0 ? 'border-emerald-400 bg-emerald-400/20' : 'border-[#9db9b0]'
                         }`}></div>
                         <div className="flex flex-col gap-1">
                           <p className="text-sm text-white">
                             <span className="font-bold text-emerald-400">{log.user.name}</span> {log.action === 'create' ? '创建了' : log.action === 'update' ? '更新了' : log.action === 'upload' ? '上传了' : '评论了'} 
                           </p>
                           <div className="bg-[#1c2723] border border-[#283933] p-3 rounded-lg mt-1">
                             <p className="text-xs text-[#9db9b0]">{log.details}</p>
                           </div>
                           <span className="text-[10px] text-[#9db9b0]/60 mt-0.5">{log.timestamp}</span>
                         </div>
                       </div>
                     )) : (
                        <div className="pl-8 text-[#9db9b0] italic">暂无相关动态</div>
                     )}
                   </div>
                </div>
             )}
          </div>
       </div>
    </div>
  );
};

export default CompetitionDetail;
