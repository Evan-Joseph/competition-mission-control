import { Competition, LogEntry, User, WhiteboardItem, FileItem } from './types';

export const CURRENT_USER: User = {
  id: 'u1',
  name: 'Alex Chen',
  avatar: 'https://i.pravatar.cc/150?u=u1',
  role: 'admin'
};

export const TEAM_MEMBERS: User[] = [
  CURRENT_USER,
  { id: 'u2', name: 'Sarah Lin', avatar: 'https://i.pravatar.cc/150?u=u2', role: 'member' },
  { id: 'u3', name: 'Mike Wang', avatar: 'https://i.pravatar.cc/150?u=u3', role: 'member' },
  { id: 'u4', name: 'Emily Zhang', avatar: 'https://i.pravatar.cc/150?u=u4', role: 'viewer' },
];

export const MOCK_FILES: FileItem[] = [
  { id: 'f1', name: '商业计划书_v3.pdf', type: 'pdf', size: '2.4 MB', uploaded_by: TEAM_MEMBERS[0], uploaded_at: '2023-10-20' },
  { id: 'f2', name: '系统架构图.png', type: 'image', size: '1.1 MB', uploaded_by: TEAM_MEMBERS[1], uploaded_at: '2023-10-21' },
  { id: 'f3', name: '答辩提纲.docx', type: 'doc', size: '500 KB', uploaded_by: TEAM_MEMBERS[0], uploaded_at: '2023-10-22' },
  { id: 'f4', name: 'Demo_Source_Code.zip', type: 'zip', size: '15.2 MB', uploaded_by: TEAM_MEMBERS[2], uploaded_at: '2023-10-23' },
];

export const MOCK_COMPETITIONS: Competition[] = [
  {
    id: 'c1',
    name: '第十五届大学生创新创业大赛',
    type: '创新创业',
    registration_deadline_at: '2023-11-15',
    submission_deadline_at: '2023-12-01',
    result_deadline_at: '2024-01-10',
    included_in_plan: true,
    registered: true,
    status_text: '初赛材料准备中',
    team_members: [TEAM_MEMBERS[0], TEAM_MEMBERS[1]],
    tags: ['国家级', 'A类']
  },
  {
    id: 'c2',
    name: 'Kaggle Titanic 算法挑战赛',
    type: '数据挖掘',
    registration_deadline_at: '2023-10-30',
    submission_deadline_at: '2023-11-05',
    result_deadline_at: null,
    included_in_plan: true,
    registered: false,
    status_text: '尚未组队',
    team_members: [TEAM_MEMBERS[0]],
    tags: ['算法', '入门']
  },
  {
    id: 'c3',
    name: 'ACM-ICPC 亚洲区域赛 (西安站)',
    type: '程序设计',
    registration_deadline_at: '2023-10-25', // Near deadline
    submission_deadline_at: '2023-10-28',
    result_deadline_at: '2023-10-29',
    included_in_plan: true,
    registered: true,
    status_text: '刷题集训阶段',
    team_members: [TEAM_MEMBERS[0], TEAM_MEMBERS[2]],
    tags: ['高强度', '线下']
  },
  {
    id: 'c4',
    name: '2024 春季数学建模美赛',
    type: '数学建模',
    registration_deadline_at: '2024-02-01',
    submission_deadline_at: '2024-02-05',
    result_deadline_at: '2024-04-15',
    included_in_plan: false,
    registered: false,
    status_text: '观望中',
    team_members: [],
    tags: ['国际级']
  }
];

export const MOCK_LOGS: LogEntry[] = [
  { id: 'l1', timestamp: '2023-10-24 14:30', user: TEAM_MEMBERS[0], action: 'update', target: '创新创业大赛', details: '更新了初赛PPT草稿' },
  { id: 'l2', timestamp: '2023-10-24 10:15', user: TEAM_MEMBERS[1], action: 'comment', target: 'ACM-ICPC', details: '标记了动态规划专题为重点' },
  { id: 'l3', timestamp: '2023-10-23 18:00', user: TEAM_MEMBERS[2], action: 'create', target: 'Kaggle 挑战', details: '创建了新的协作画板' },
  { id: 'l4', timestamp: '2023-10-23 09:20', user: TEAM_MEMBERS[0], action: 'update', target: '团队设置', details: '添加 Emily Zhang 为观察员' },
  { id: 'l5', timestamp: '2023-10-22 16:45', user: TEAM_MEMBERS[1], action: 'upload', target: '创新创业大赛', details: '上传了 系统架构图.png' },
  { id: 'l6', timestamp: '2023-10-22 11:30', user: TEAM_MEMBERS[0], action: 'delete', target: '旧版计划', details: '删除了废弃的日程表' },
];

export const MOCK_WHITEBOARD_ITEMS: WhiteboardItem[] = [
  { id: 'w1', type: 'note', content: '核心痛点：用户留存率低', x: 100, y: 100, color: '#fef08a', author: TEAM_MEMBERS[0], rotation: -2 },
  { id: 'w2', type: 'note', content: '技术方案：使用 Flutter 开发', x: 350, y: 120, color: '#bae6fd', author: TEAM_MEMBERS[1], rotation: 3 },
  { id: 'w3', type: 'text', content: '竞品分析区域', x: 100, y: 50, author: TEAM_MEMBERS[0] },
  { id: 'w4', type: 'image', content: 'image_placeholder', x: 120, y: 250, width: 200, height: 150, author: TEAM_MEMBERS[2], rotation: 1 },
];
