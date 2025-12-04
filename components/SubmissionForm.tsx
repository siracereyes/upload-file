
import React, { useState, useRef, useEffect } from 'react';
import { Upload, FileVideo, CheckCircle, Loader2, AlertCircle, PlayCircle, X, Download, Settings, ExternalLink, Copy, Trash2 } from 'lucide-react';
import { AssignmentType, StudentSubmission, UploadStatus } from '../types';
import { analyzeSubmission } from '../services/gemini';
import { uploadFileToDrive, downloadRenamedFile } from '../services/drive';

const GOOGLE_DRIVE_FOLDER_ID = "1DF2vqZrluAWcj7upY-FD7W1P23TlfUuI";
const REQUIRED_SCOPE = "https://www.googleapis.com/auth/drive.file";

export const SubmissionForm: React.FC = () => {
  const [formData, setFormData] = useState<StudentSubmission>({
    firstName: '',
    lastName: '',
    section: '',
    assignmentType: AssignmentType.NAIL_CARE,
    file: null
  });

  const [accessToken, setAccessToken] = useState<string>('');
  const [showSettings, setShowSettings] = useState(false);

  const [status, setStatus] = useState<UploadStatus>({
    state: 'idle',
    message: ''
  });

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load token from local storage on mount
  useEffect(() => {
    const savedToken = localStorage.getItem('google_drive_token');
    if (savedToken) {
      setAccessToken(savedToken);
    }
  }, []);

  const handleTokenChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Sanitize input: Remove whitespace and surrounding quotes that might be pasted by accident
    const rawValue = e.target.value;
    const cleanToken = rawValue.trim().replace(/^["']|["']$/g, '');
    
    setAccessToken(cleanToken);
    localStorage.setItem('google_drive_token', cleanToken);
  };

  const clearToken = () => {
    setAccessToken('');
    localStorage.removeItem('google_drive_token');
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      // Basic validation
      if (!file.type.startsWith('video/')) {
        setStatus({ state: 'error', message: 'Please upload a valid video file (MP4, WebM, etc.).' });
        return;
      }
      
      setFormData(prev => ({ ...prev, file }));
      setPreviewUrl(URL.createObjectURL(file));
      setStatus({ state: 'idle', message: '' });
    }
  };

  const clearFile = () => {
    setFormData(prev => ({ ...prev, file: null }));
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setStatus({ state: 'idle', message: '' });
  };

  const generateRenamedFilename = () => {
    // Format: "Video Upload_Section_First Name_Last Name"
    // Using AssignmentType as "Video Upload" value
    const ext = formData.file?.name.split('.').pop() || 'mp4';
    const safeFirst = formData.firstName.trim();
    const safeLast = formData.lastName.trim();
    const safeSection = formData.section.trim();
    
    // Ensure filename is clean for file systems
    return `${formData.assignmentType}_${safeSection}_${safeFirst}_${safeLast}.${ext}`.replace(/[\\/:"*?<>|]/g, '');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.file || !formData.firstName || !formData.lastName || !formData.section) {
      setStatus({ state: 'error', message: 'Please fill in all fields and attach a video.' });
      return;
    }

    const renamedFile = generateRenamedFilename();
    
    // Step 1: AI Analysis
    setStatus({ state: 'analyzing', message: 'Verifying assignment content with AI Teacher...' });
    
    let feedback = "";
    try {
        feedback = await analyzeSubmission(
            formData.file, 
            formData.assignmentType, 
            `${formData.firstName} ${formData.lastName}`
        );
    } catch (err) {
        console.error("Analysis failed", err);
        feedback = "AI Analysis unavailable.";
    }

    // Step 2: Upload or Download
    setStatus({ 
      state: 'uploading', 
      message: accessToken 
        ? `Uploading "${renamedFile}" to Drive...` 
        : `Preparing "${renamedFile}" for submission...`,
      aiFeedback: feedback
    });

    try {
        if (accessToken) {
            // Attempt Real API Upload if token exists
            await uploadFileToDrive(formData.file, renamedFile, GOOGLE_DRIVE_FOLDER_ID, accessToken);
            setStatus({
                state: 'success',
                message: 'Submission successful! File uploaded to Drive.',
                renamedFileName: renamedFile,
                aiFeedback: feedback
            });
        } else {
            // Fallback: Simulate processing time then Trigger Download
            await new Promise(resolve => setTimeout(resolve, 1500));
            downloadRenamedFile(formData.file, renamedFile);
            setStatus({
                state: 'success',
                message: 'File renamed and downloaded.',
                renamedFileName: renamedFile,
                aiFeedback: feedback
            });
        }
    } catch (error: any) {
        console.error("Upload error", error);
        
        // Check if error is auth related
        if (error.message.includes('401') || error.message.includes('403') || error.message.includes('invalid authentication credentials')) {
           setStatus({
              state: 'error',
              message: 'Access Token expired or invalid. Please check for extra spaces or quotes in Settings.'
           });
        } else {
           // Fallback to download on other errors
           downloadRenamedFile(formData.file, renamedFile);
           setStatus({
               state: 'success',
               message: `Auto-upload failed (${error.message}). File downloaded instead.`,
               renamedFileName: renamedFile,
               aiFeedback: feedback
           });
        }
    }
  };

  const resetForm = () => {
    setFormData({
      firstName: '',
      lastName: '',
      section: '',
      assignmentType: AssignmentType.NAIL_CARE,
      file: null
    });
    clearFile();
    setStatus({ state: 'idle', message: '' });
  };

  if (status.state === 'success') {
    return (
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-2xl w-full mx-auto animate-fade-in">
        <div className="flex flex-col items-center text-center space-y-4">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center text-green-600">
            <CheckCircle size={32} />
          </div>
          <h2 className="text-2xl font-bold text-gray-800">
             {accessToken ? "Submission Complete" : "File Ready for Submission"}
          </h2>
          
          <div className="bg-amber-50 border border-amber-200 p-4 rounded-lg text-left text-sm text-amber-800 w-full flex items-start">
             <AlertCircle size={16} className="mt-0.5 mr-2 flex-shrink-0" />
             <div>
                {!accessToken ? (
                    <>
                        <p className="font-bold">Important Step Required:</p>
                        <p className="mt-1">Since we don't have direct access to the teacher's drive, your file has been <strong>renamed and downloaded to your device</strong>.</p>
                        <p className="mt-2">Please drag and drop <strong>{status.renamedFileName}</strong> into the Google Drive folder.</p>
                    </>
                ) : (
                    <p>File successfully uploaded to the specified Google Drive folder.</p>
                )}
             </div>
          </div>

          <div className="bg-gray-50 p-6 rounded-lg w-full text-left space-y-3 border border-gray-100">
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Renamed File</p>
              <p className="text-sm text-gray-700 font-bold mt-1 break-all">{status.renamedFileName}</p>
            </div>
            
             <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Destination Folder ID</p>
              <div className="flex items-center justify-between mt-1">
                 <span className="text-sm font-mono text-gray-600 bg-gray-200 px-1 rounded">{GOOGLE_DRIVE_FOLDER_ID}</span>
              </div>
            </div>

            {status.aiFeedback && (
              <div className="pt-2 border-t border-gray-200 mt-2">
                <p className="text-xs font-semibold text-purple-600 uppercase tracking-wider mb-1">Teacher AI Feedback</p>
                <p className="text-sm text-gray-700 italic">"{status.aiFeedback}"</p>
              </div>
            )}
          </div>

          <button 
            onClick={resetForm}
            className="mt-6 px-6 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors font-medium"
          >
            Submit Another Video
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-xl overflow-hidden max-w-2xl w-full mx-auto relative">
      <div className="absolute top-4 right-4 z-10">
        <button 
            onClick={() => setShowSettings(!showSettings)}
            className={`p-2 transition-colors rounded-full ${accessToken ? 'text-white bg-teal-500/20 hover:bg-teal-500/30' : 'text-teal-100 hover:text-white'}`}
            title="Configuration"
        >
            <Settings size={18} />
            {accessToken && <span className="absolute top-2 right-2 w-2 h-2 bg-green-400 rounded-full border-2 border-teal-600"></span>}
        </button>
      </div>

      <div className="bg-gradient-to-r from-teal-500 to-emerald-600 p-6 text-white">
        <h2 className="text-xl font-bold">Upload Assignment</h2>
        <p className="text-teal-100 text-sm">Grade 8 • Wellness & Beauty Care</p>
      </div>

      {showSettings && (
          <div className="bg-slate-100 p-4 border-b border-slate-200 animate-in slide-in-from-top-2">
              <div className="flex justify-between items-center mb-2">
                  <label className="text-xs font-bold text-slate-600 uppercase">Developer Settings (Access Token)</label>
                  <a href="https://developers.google.com/oauthplayground" target="_blank" rel="noreferrer" className="flex items-center text-[10px] text-blue-600 hover:underline">
                      Open OAuth Playground <ExternalLink size={10} className="ml-1"/>
                  </a>
              </div>
              
              <div className="bg-white p-2 rounded border border-slate-200 mb-3">
                  <p className="text-[10px] text-slate-500 mb-1">1. In OAuth Playground, input this Scope:</p>
                  <div className="flex items-center bg-slate-50 p-1 rounded border border-slate-100">
                      <code className="text-[10px] text-slate-700 flex-grow font-mono truncate">{REQUIRED_SCOPE}</code>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1">2. Click "Authorize APIs" -> "Exchange authorization code for tokens"</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">3. Copy "Access token" and paste below (ensure no quotes):</p>
              </div>

              <div className="flex space-x-2">
                <input 
                    type="password"
                    value={accessToken}
                    onChange={handleTokenChange}
                    placeholder="Paste Access Token (starts with ya29...)"
                    className="flex-grow text-sm p-2 border border-slate-300 rounded focus:ring-2 focus:ring-teal-500 outline-none"
                />
                {accessToken && (
                    <button onClick={clearToken} className="px-3 py-2 bg-red-100 text-red-600 rounded hover:bg-red-200 transition-colors" title="Clear Token">
                        <Trash2 size={16} />
                    </button>
                )}
              </div>
              {accessToken && <p className="text-[10px] text-green-600 mt-1 font-medium">Token saved in browser storage.</p>}
          </div>
      )}

      <form onSubmit={handleSubmit} className="p-8 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700 block">First Name</label>
            <input
              type="text"
              name="firstName"
              required
              value={formData.firstName}
              onChange={handleInputChange}
              className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none transition-all"
              placeholder="e.g. Maria"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700 block">Last Name</label>
            <input
              type="text"
              name="lastName"
              required
              value={formData.lastName}
              onChange={handleInputChange}
              className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none transition-all"
              placeholder="e.g. Santos"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700 block">Section</label>
            <select
              name="section"
              required
              value={formData.section}
              onChange={handleInputChange}
              className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none transition-all bg-white"
            >
              <option value="" disabled>Select Section</option>
              <option value="CALLALILY">CALLALILY</option>
              <option value="ANTHURIUM">ANTHURIUM</option>
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700 block">Video Upload Type</label>
            <select
              name="assignmentType"
              value={formData.assignmentType}
              onChange={handleInputChange}
              className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none transition-all bg-white"
            >
              <option value={AssignmentType.NAIL_CARE}>Nail Care</option>
              <option value={AssignmentType.ACUPRESSURE}>Acupressure Massage</option>
            </select>
          </div>
        </div>

        <div className="space-y-2 pt-2">
          <label className="text-sm font-medium text-gray-700 block mb-1">Assignment Video</label>
          
          {!formData.file ? (
            <div 
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-gray-300 rounded-xl p-8 flex flex-col items-center justify-center cursor-pointer hover:border-teal-500 hover:bg-teal-50 transition-all group"
            >
              <div className="w-12 h-12 bg-teal-100 text-teal-600 rounded-full flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                <Upload size={20} />
              </div>
              <p className="text-gray-900 font-medium">Click to upload video</p>
              <p className="text-gray-500 text-sm mt-1">MP4, WebM (Max 50MB for AI Review)</p>
            </div>
          ) : (
            <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center space-x-3">
                  <div className="bg-teal-100 p-2 rounded-lg text-teal-700">
                    <FileVideo size={24} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900 truncate max-w-[200px]">{formData.file.name}</p>
                    <p className="text-xs text-gray-500">{(formData.file.size / (1024 * 1024)).toFixed(2)} MB</p>
                  </div>
                </div>
                <button 
                  type="button"
                  onClick={clearFile}
                  className="text-gray-400 hover:text-red-500 transition-colors p-1"
                >
                  <X size={20} />
                </button>
              </div>
              
              {previewUrl && (
                <div className="relative rounded-lg overflow-hidden bg-black aspect-video group">
                  <video src={previewUrl} controls className="w-full h-full object-contain" />
                </div>
              )}
              
              <div className="mt-3 flex items-center text-xs text-amber-600 bg-amber-50 p-2 rounded border border-amber-100">
                <AlertCircle size={14} className="mr-2 flex-shrink-0" />
                <span className="truncate">Rename: <strong>{generateRenamedFilename()}</strong></span>
              </div>
            </div>
          )}
          
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept="video/*"
            className="hidden"
          />
        </div>

        {status.state === 'error' && (
          <div className="p-4 bg-red-50 text-red-700 rounded-lg flex items-center text-sm">
            <AlertCircle size={16} className="mr-2" />
            {status.message}
          </div>
        )}

        {status.state === 'analyzing' && (
           <div className="p-4 bg-purple-50 text-purple-700 rounded-lg flex items-center text-sm animate-pulse">
             <Loader2 size={16} className="mr-2 animate-spin" />
             {status.message}
           </div>
        )}

        {status.state === 'uploading' && (
           <div className="p-4 bg-blue-50 text-blue-700 rounded-lg flex items-center text-sm animate-pulse">
             <Loader2 size={16} className="mr-2 animate-spin" />
             {status.message}
           </div>
        )}

        <button
          type="submit"
          disabled={status.state === 'analyzing' || status.state === 'uploading'}
          className="w-full bg-slate-900 text-white font-semibold py-3 rounded-xl shadow-lg hover:bg-slate-800 focus:ring-4 focus:ring-slate-200 transition-all disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
        >
          {status.state === 'analyzing' || status.state === 'uploading' ? (
            <>
              <Loader2 className="animate-spin" size={20} />
              <span>Processing...</span>
            </>
          ) : (
            <>
              {accessToken ? <Upload size={20} /> : <Download size={20} />}
              <span>{accessToken ? 'Submit Assignment' : 'Process & Download for Upload'}</span>
            </>
          )}
        </button>
      </form>
    </div>
  );
};
