import React from 'react';
import { NavLink } from 'react-router-dom';
import { PenTool, CheckCircle, FileText, MessageSquare, Settings, Feather, Quote, BookOpen, Layers, Camera, History, Code2 } from 'lucide-react';

export const Sidebar: React.FC = () => {
  const navItems = [
    { name: 'Paraphraser', path: '/', icon: PenTool },
    { name: 'Grammar Checker', path: '/grammar', icon: CheckCircle },
    { name: 'Summarizer', path: '/summarizer', icon: FileText },
    { name: 'Citation Generator', path: '/citation', icon: Quote },
    { name: 'AI Chat', path: '/chat', icon: MessageSquare },
    { name: 'Knowledge Base', path: '/knowledge', icon: BookOpen },
    { name: 'Document Viewer', path: '/documents', icon: FileText },
    { name: 'History & Memory', path: '/history', icon: History },
    { name: 'OCR & Scan', path: '/ocr', icon: Camera },
    { name: 'Agent Planner', path: '/agent', icon: Layers },
  ];

  const activeClass = "bg-primary-50 text-primary-600 dark:bg-primary-900/30 dark:text-primary-400 border-r-4 border-primary-500";
  const inactiveClass = "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-dark-surface hover:text-primary-600 dark:hover:text-primary-300 border-r-4 border-transparent";

  return (
    <aside className="w-64 bg-white dark:bg-dark-surface border-r border-slate-200 dark:border-dark-border flex flex-col h-full transition-colors duration-200 fixed left-0 top-0 z-20">
      <div className="p-6 flex items-center space-x-3">
        <div className="bg-primary-500 p-2 rounded-lg text-white">
          <Feather size={24} />
        </div>
        <h1 className="text-xl font-bold tracking-tight text-slate-800 dark:text-white">Wrytica</h1>
      </div>

      <nav className="flex-1 px-4 space-y-2 mt-4">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) => `
              flex items-center space-x-3 px-4 py-3 rounded-lg transition-all duration-200 font-medium
              ${isActive ? activeClass : inactiveClass}
            `}
          >
            <item.icon size={20} />
            <span>{item.name}</span>
          </NavLink>
        ))}
      </nav>

      <div className="p-4 border-t border-slate-200 dark:border-dark-border space-y-1">
        <NavLink
          to="/settings"
          className={({ isActive }) => `
            flex items-center space-x-3 px-4 py-3 rounded-lg transition-all duration-200 font-medium
            ${isActive ? activeClass : inactiveClass}
          `}
        >
          <Settings size={20} />
          <span>Settings</span>
        </NavLink>
        <NavLink
          to="/developer"
          className={({ isActive }) => `
            flex items-center space-x-3 px-4 py-3 rounded-lg transition-all duration-200 font-medium
            ${isActive ? activeClass : inactiveClass}
          `}
        >
          <Code2 size={20} />
          <span>Developer</span>
        </NavLink>
      </div>
    </aside>
  );
};
