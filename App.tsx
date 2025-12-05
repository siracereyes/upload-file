
import React from 'react';
import { SubmissionForm } from './components/SubmissionForm';
import { GraduationCap } from 'lucide-react';

function App() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="bg-teal-600 p-2 rounded-lg text-white">
               <GraduationCap size={24} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">EduSubmit Portal</h1>
              <p className="text-xs text-gray-500">Wellness & Beauty Care • Grade 8</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-grow flex items-center justify-center p-4 sm:p-8">
        <SubmissionForm />
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 py-6">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <p className="text-sm text-gray-500">
            © {new Date().getFullYear()} CJMR Technology
          </p>
        </div>
      </footer>
    </div>
  );
}

export default App;
