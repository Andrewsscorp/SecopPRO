import { User } from 'lucide-react';

export default function Header() {
  return (
    <header className="h-20 bg-white border-b border-gray-100 flex items-center justify-end px-8">
      <div className="flex items-center gap-3 cursor-pointer hover:bg-gray-50 p-2 rounded-lg transition-colors">
        <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center text-gray-500">
          <User className="w-5 h-5" />
        </div>
        <span className="text-sm font-medium text-gray-700">Usuario</span>
        <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>
    </header>
  );
}
