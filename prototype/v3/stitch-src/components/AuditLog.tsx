import React, { useState } from 'react';
import { MOCK_LOGS } from '../constants';
import { Search, Filter, Download, Calendar } from 'lucide-react';

const AuditLog: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [actionFilter, setActionFilter] = useState('all');

  const filteredLogs = MOCK_LOGS.filter(log => {
    const matchesSearch = 
      log.user.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
      log.target.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.details.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesAction = actionFilter === 'all' || log.action === actionFilter;

    return matchesSearch && matchesAction;
  });

  return (
    <div className="p-8 animate-fade-in max-w-6xl mx-auto w-full">
      <div className="flex flex-col gap-6 mb-8">
        <div className="flex justify-between items-end">
          <div>
             <h1 className="text-3xl font-bold text-white mb-2">全局审查日志</h1>
             <p className="text-[#9db9b0]">系统变更追溯与安全审计中心，记录所有关键操作。</p>
          </div>
          <button className="flex items-center gap-2 px-4 py-2 bg-[#2beead] hover:bg-[#2beead]/90 text-[#111816] font-bold rounded-xl transition-colors">
            <Download size={18} /> 导出数据
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-[#1c2723] border border-[#283933] rounded-2xl p-4 mb-6 grid grid-cols-1 md:grid-cols-4 gap-4">
         <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9db9b0]"><Search size={18} /></span>
            <input 
              type="text" 
              placeholder="搜索操作人、对象或详情..." 
              className="w-full bg-[#111816] border border-[#283933] rounded-lg py-2.5 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-[#2beead]"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
         </div>
         <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9db9b0]"><Filter size={18} /></span>
            <select 
              className="w-full bg-[#111816] border border-[#283933] rounded-lg py-2.5 pl-10 pr-4 text-sm text-white appearance-none focus:outline-none focus:border-[#2beead]"
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
            >
              <option value="all">所有动作</option>
              <option value="create">创建 (Create)</option>
              <option value="update">更新 (Update)</option>
              <option value="delete">删除 (Delete)</option>
              <option value="upload">上传 (Upload)</option>
              <option value="comment">评论 (Comment)</option>
            </select>
         </div>
         <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9db9b0]"><Calendar size={18} /></span>
            <input type="date" className="w-full bg-[#111816] border border-[#283933] rounded-lg py-2.5 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-[#2beead]" />
         </div>
      </div>

      {/* Table */}
      <div className="bg-[#1c2723] border border-[#283933] rounded-2xl overflow-hidden shadow-xl">
        {filteredLogs.length > 0 ? (
          <table className="w-full text-left">
            <thead>
              <tr className="bg-[#16201c] border-b border-[#283933]">
                <th className="px-6 py-4 text-xs font-bold text-[#9db9b0] uppercase tracking-wider">时间</th>
                <th className="px-6 py-4 text-xs font-bold text-[#9db9b0] uppercase tracking-wider">操作人</th>
                <th className="px-6 py-4 text-xs font-bold text-[#9db9b0] uppercase tracking-wider">动作</th>
                <th className="px-6 py-4 text-xs font-bold text-[#9db9b0] uppercase tracking-wider">对象</th>
                <th className="px-6 py-4 text-xs font-bold text-[#9db9b0] uppercase tracking-wider">详情</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#283933]">
              {filteredLogs.map(log => (
                <tr key={log.id} className="group hover:bg-[#16201c]/50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span className="text-white text-sm font-medium">{log.timestamp.split(' ')[0]}</span>
                      <span className="text-[#9db9b0] text-xs">{log.timestamp.split(' ')[1]}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <img src={log.user.avatar} className="w-8 h-8 rounded-full border border-[#283933]" alt="" />
                      <span className="text-white text-sm font-medium">{log.user.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium border ${
                      log.action === 'create' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                      log.action === 'delete' ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' :
                      log.action === 'upload' ? 'bg-purple-500/10 text-purple-400 border-purple-500/20' :
                      'bg-blue-500/10 text-blue-400 border-blue-500/20'
                    }`}>
                      {log.action.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-white text-sm">
                     {log.target}
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-[#9db9b0] text-sm font-mono">{log.details}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="p-8 text-center text-[#9db9b0]">没有找到匹配的日志记录。</div>
        )}
      </div>
    </div>
  );
};

export default AuditLog;
