import React, { useState, useRef, useEffect } from 'react';
import { Upload, FileVideo, CheckCircle, Loader2, AlertCircle, PlayCircle, X, Download, Settings, Trash2, Link as LinkIcon, HelpCircle, AlertTriangle, Activity } from 'lucide-react';
import { AssignmentType, StudentSubmission, UploadStatus } from '../types';
import { uploadFileToScript, downloadRenamedFile, testScriptConnection } from '../services/drive';

// Embedded default script URL provided by user
const DEFAULT_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzdgPUTiq6_kx_bbZhq7-Q1e_psl_J5-mUKWJ-_d7nztXPyP-Fs6bYTUZ3R0czT5Vqt/exec";
// User requested 50MB
const MAX_FILE_SIZE_MB = 50;
// Threshold where we warn user
const WARNING_SIZE_MB = 25;

export const SubmissionForm: React.FC = () => {
  const [formData, setFormData] = useState<StudentSubmission>({
    firstName: '',
    lastName: '',
    section: '',
    assignmentType: AssignmentType.NAIL_CARE,
    file: null
  });

  // Settings State
  const [scriptUrl, setScriptUrl] = useState<string>(DEFAULT_SCRIPT_URL);
  const [showSettings, setShowSettings] = useState(false);
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testMessage, setTestMessage] = useState('');

  // Status & Progress
  const [status, setStatus] = useState<UploadStatus>({
    state: 'idle',
    message: ''
  });
  const [progress, setProgress] = useState(0);

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load configs from local storage
  useEffect(() => {
    const savedScriptUrl = localStorage.getItem('google_script_url');
    if (savedScriptUrl) {
        setScriptUrl(savedScriptUrl);
    } 
  }, []);

  const handleScriptUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.trim();
    setScriptUrl(val);
    localStorage.setItem('google_script_url', val);
    setTestStatus('idle'); // Reset test status on change
  };

  const restoreDefaultScript = () => {
    setScriptUrl(DEFAULT_SCRIPT_URL);
    localStorage.removeItem('google_script_url'); // clear override
    setTestStatus('idle');
  };

  const runConnectionTest = async () => {
    if (!scriptUrl) return;
    setTestStatus('testing');
    setTestMessage('Pinging Google Script...');
    try {
        await testScriptConnection(scriptUrl);
        setTestStatus('success');
        setTestMessage('Connection Successful! Script is ready.');
    } catch (err: any) {
        setTestStatus('error');
        setTestMessage(err.message || 'Connection failed.');
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      
      // Validation: Type
      if (!file.type.startsWith('video/')) {
        setStatus({ state: 'error', message: 'Please upload a valid video file (MP4, WebM).' });
        return;
      }

      // Validation: Size
      const fileSizeMB = file.size / (1024 * 1024);
      if (fileSizeMB > MAX_FILE_SIZE_MB) {
        setStatus({ 
            state: 'error', 
            message: `File is too large (${fileSizeMB.toFixed(1)}MB). Limit is ${MAX_FILE_SIZE_MB}MB.` 
        });
        return;
      }

      setFormData(prev => ({ ...prev, file }));
      setPreviewUrl(URL.createObjectURL(file));
      setStatus({ state: 'idle', message: '' });
      setProgress(0);
    }
  };

  const clearFile = () => {
    setFormData(prev => ({ ...prev, file: null }));
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setStatus({ state: 'idle', message: '' });
    setProgress(0);
  };

  const generateRenamedFilename = () => {
    const ext = formData.file?.name.split('.').pop() || 'mp4';
    const safeFirst = formData.firstName.trim();
    const safeLast = formData.lastName.trim();
    const safeSection = formData.section.trim();
    return `${formData.assignmentType}_${safeSection}_${safeFirst}_${safeLast}.${ext}`.replace(/[\\/:"*?<>|]/g, '');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.file || !formData.firstName || !formData.lastName || !formData.section) {
      setStatus({ state: 'error', message: 'Please fill in all fields and attach a video.' });
      return;
    }

    const renamedFile = generateRenamedFilename();
    const canUpload = !!scriptUrl;
    
    setStatus({ 
      state: 'uploading', 
      message: canUpload 
        ? `Preparing upload...` 
        : `Preparing "${renamedFile}" for submission...`
    });
    setProgress(0);

    try {
        if (scriptUrl) {
            // Updated to pass the progress callback
            await uploadFileToScript(formData.file, renamedFile, scriptUrl, (percent) => {
                setProgress(percent);
                setStatus(prev => ({ 
                    ...prev, 
                    state: 'uploading',
                    message: `Uploading: ${percent}%` 
                }));
            });
            
            setStatus({
                state: 'success',
                message: 'Submission successful! File uploaded.',
                renamedFileName: renamedFile
            });
        } else {
            // Should not happen unless user clears default URL manually
            await new Promise(resolve => setTimeout(resolve, 800));
            downloadRenamedFile(formData.file, renamedFile);
            setStatus({
                state: 'success',
                message: 'File renamed and downloaded.',
                renamedFileName: renamedFile
            });
        }
    } catch (error: any) {
        console.error("Upload error", error);
        
        let errorMsg = error.message || "Unknown error";
        let detailedMsg = `Auto-upload failed. File downloaded for manual submission.`;
        
        // Detection logic
        if (errorMsg.includes("Failed to fetch") || errorMsg.includes("NetworkError")) {
             errorMsg = "Connection Error";
             detailedMsg = "Could not connect to Google Drive. Check internet or Script permissions.";
        } else if (errorMsg.includes("Init failed") || errorMsg.includes("Invalid action") || errorMsg.includes("pahintulot") || errorMsg.includes("Authorization") || errorMsg.includes("Permission Error")) {
             errorMsg = "Script Permission Error";
             detailedMsg = "Deploy a NEW VERSION in Google Script Editor (Manage Deployments -> Edit -> New Version).";
        }
        
        // Fallback
        downloadRenamedFile(formData.file, renamedFile);
        
        setStatus({
            state: 'error', // Use error state to warn user clearly
            message: `${errorMsg}. ${detailedMsg}`,
            renamedFileName: renamedFile
        });
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
    setProgress(0);
  };

  if (status.state === 'success') {
    return (
      <div className="bg-white rounded-2xl shadow-xl p-6 sm:p-8 max-w-2xl w-full mx-auto animate-fade-in">
        <div className="flex flex-col items-center text-center space-y-4">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center text-green-600">
            <CheckCircle size={32} />
          </div>
          <h2 className="text-2xl font-bold text-gray-900">Submission Complete</h2>
          
          <div className="bg-green-50 border border-green-200 p-4 rounded-lg text-left text-sm text-green-800 w-full">
             <p className="font-semibold text-center">Video successfully uploaded!</p>
             <p className="text-center mt-1 text-green-700">Your teacher has received your file.</p>
          </div>

          <div className="bg-gray-50 p-6 rounded-lg w-full text-left space-y-3 border border-gray-100">
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Submitted File</p>
              <p className="text-sm text-gray-700 font-bold mt-1 break-all">{status.renamedFileName}</p>
            </div>
          </div>

          <button 
            onClick={resetForm}
            className="mt-6 px-6 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors font-medium w-full sm:w-auto"
          >
            Submit Another Video
          </button>
        </div>
      </div>
    );
  }

  const hasConfig = !!scriptUrl;
  const fileSizeMB = formData.file ? formData.file.size / (1024 * 1024) : 0;
  const isLargeFileWarning = fileSizeMB > WARNING_SIZE_MB;

  return (
    <div className="bg-white rounded-2xl shadow-xl overflow-hidden max-w-2xl w-full mx-auto relative">
      <div className="absolute top-4 right-4 z-10">
        <button 
            onClick={() => setShowSettings(!showSettings)}
            className={`p-2 transition-colors rounded-full ${hasConfig ? 'text-white bg-teal-500/20 hover:bg-teal-500/30' : 'bg-red-500 text-white shadow-lg animate-bounce'}`}
            title="Configure Upload Settings"
        >
            <Settings size={18} />
            {hasConfig && <span className="absolute top-2 right-2 w-2 h-2 bg-green-400 rounded-full border-2 border-teal-600"></span>}
        </button>
      </div>

      <div className="bg-gradient-to-r from-teal-500 to-emerald-600 p-6 text-white">
        <h2 className="text-xl font-bold">Upload Assignment</h2>
        <p className="text-teal-100 text-sm">Grade 8 • Wellness & Beauty Care</p>
      </div>

      {showSettings && (
          <div className="bg-slate-50 border-b border-slate-200 animate-in slide-in-from-top-2">
              <div className="flex border-b border-slate-200">
                  <button 
                    className="flex-1 py-3 text-xs font-bold uppercase tracking-wide bg-white text-teal-600 border-b-2 border-teal-600"
                  >
                    <LinkIcon size={14} className="inline mr-1 mb-0.5" /> Configuration
                  </button>
              </div>

             <div className="p-4 bg-white space-y-4">
                <div className="bg-amber-50 p-3 rounded-lg border border-amber-200 text-xs text-amber-900">
                    <p className="font-bold flex items-center mb-1"><HelpCircle size={14} className="mr-1"/> Fix "Permission" Errors</p>
                    <p>If Test Connection fails with "Permission Error", you must update the deployment version.</p>
                    
                    <div className="mt-2 bg-white p-2 rounded border border-amber-200 font-mono text-[10px] overflow-x-auto h-32 select-all">
{`function doPost(e) {
  var FOLDER_ID = "1DF2vqZrluAWcj7upY-FD7W1P23TlfUuI"; 
  try {
    var req = JSON.parse(e.postData.contents);
    if (req.action === "test") {
       return ContentService.createTextOutput(JSON.stringify({ status: "success", message: "Connected" }));
    }
    if (req.action === "init") {
      var url = "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable";
      var meta = { name: req.filename, mimeType: req.mimeType, parents: [FOLDER_ID] };
      var token = ScriptApp.getOAuthToken();
      var resp = UrlFetchApp.fetch(url, { method: "post", contentType: "application/json", payload: JSON.stringify(meta), headers: { "Authorization": "Bearer " + token } });
      return ContentService.createTextOutput(JSON.stringify({ status: "success", url: resp.getAllHeaders()["Location"] }));
    }
    if (req.action === "chunk") {
      var data = Utilities.base64Decode(req.base64);
      var blob = Utilities.newBlob(data);
      var resp = UrlFetchApp.fetch(req.uploadUrl, { method: "put", payload: blob, headers: { "Content-Range": req.range }, muteHttpExceptions: true });
      return ContentService.createTextOutput(JSON.stringify({ status: "success" }));
    }
  } catch (err) { return ContentService.createTextOutput(JSON.stringify({ status: "error", message: err.toString() })); }
}

// !!! IMPORTANT: RUN THIS FUNCTION ONCE TO AUTHORIZE !!!
function doSetup() {
  DriveApp.getRootFolder();
  UrlFetchApp.fetch("https://www.google.com");
  console.log("Permissions granted! Now DEPLOY as 'New Deployment'.");
}`}
                    </div>
                    
                    <ul className="list-disc ml-4 mt-2 space-y-1 text-amber-800">
                        <li><strong>Step 1:</strong> Save code & Run <code>doSetup</code> function (Review Permissions).</li>
                        <li><strong>Step 2:</strong> Click <strong>Deploy</strong> &rarr; <strong>Manage deployments</strong>.</li>
                        <li><strong>Step 3:</strong> Click <strong>Edit</strong> (Pencil Icon).</li>
                        <li><strong>Step 4:</strong> Version: Select <strong>"New version"</strong> (Required).</li>
                        <li><strong>Step 5:</strong> Click <strong>Deploy</strong>.</li>
                    </ul>
                </div>

                <div className="flex flex-col space-y-2">
                    <div className="flex space-x-2">
                        <input 
                            type="text"
                            value={scriptUrl}
                            onChange={handleScriptUrlChange}
                            placeholder="Paste Web App URL (https://script.google.com/...)"
                            className="flex-grow text-sm p-2 border border-slate-300 rounded focus:ring-2 focus:ring-teal-500 outline-none text-slate-500"
                        />
                        {scriptUrl && scriptUrl !== DEFAULT_SCRIPT_URL && (
                            <button onClick={restoreDefaultScript} className="px-3 py-2 bg-slate-100 text-slate-600 rounded hover:bg-slate-200 text-xs font-semibold whitespace-nowrap" title="Reset">
                                Reset Default
                            </button>
                        )}
                    </div>
                    
                    <div className="flex items-center space-x-2">
                        <button 
                            onClick={runConnectionTest}
                            disabled={testStatus === 'testing' || !scriptUrl}
                            className={`flex items-center justify-center px-4 py-2 rounded text-xs font-bold uppercase tracking-wide transition-colors ${
                                testStatus === 'success' ? 'bg-green-100 text-green-700' :
                                testStatus === 'error' ? 'bg-red-100 text-red-700' :
                                'bg-teal-600 text-white hover:bg-teal-700'
                            }`}
                        >
                            {testStatus === 'testing' ? <Loader2 size={14} className="animate-spin mr-1"/> : <Activity size={14} className="mr-1"/>}
                            {testStatus === 'testing' ? 'Testing...' : 'Test Connection'}
                        </button>
                        
                        {testMessage && (
                            <span className={`text-xs ${testStatus === 'error' ? 'text-red-600 font-bold' : 'text-green-600'}`}>
                                {testMessage}
                            </span>
                        )}
                    </div>
                </div>
             </div>
          </div>
      )}

      <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-6">
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
              className="border-2 border-dashed border-gray-300 rounded-xl p-8 flex flex-col items-center justify-center cursor-pointer hover:border-teal-500 hover:bg-teal-50 transition-all group active:scale-95"
            >
              <div className="w-12 h-12 bg-teal-100 text-teal-600 rounded-full flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                <Upload size={20} />
              </div>
              <p className="text-gray-900 font-medium">Click to upload video</p>
              <p className="text-gray-500 text-sm mt-1">MP4, WebM (Max {MAX_FILE_SIZE_MB}MB)</p>
            </div>
          ) : (
            <div className={`bg-gray-50 rounded-xl p-4 border ${isLargeFileWarning ? 'border-amber-300 bg-amber-50' : 'border-gray-200'}`}>
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center space-x-3 overflow-hidden">
                  <div className="bg-teal-100 p-2 rounded-lg text-teal-700 flex-shrink-0">
                    <FileVideo size={24} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{formData.file.name}</p>
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
              
              {isLargeFileWarning && (
                <div className="flex items-start space-x-2 text-xs text-amber-800 bg-amber-100 p-2 rounded mb-3">
                    <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
                    <span>Large files are uploaded in chunks. This may take a minute.</span>
                </div>
              )}
              
              {previewUrl && (
                <div className="relative rounded-lg overflow-hidden bg-black aspect-video group mb-3">
                  <video src={previewUrl} controls className="w-full h-full object-contain" />
                </div>
              )}
              
              <div className="flex items-center text-xs text-teal-700 bg-teal-50 p-2 rounded border border-teal-100">
                <CheckCircle size={14} className="mr-2 flex-shrink-0" />
                <span className="truncate">Will be saved as: <strong>{generateRenamedFilename()}</strong></span>
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
          <div className="p-4 bg-red-50 text-red-700 rounded-lg flex flex-col text-sm border border-red-100">
            <div className="flex items-start">
                <AlertCircle size={16} className="mr-2 mt-0.5 flex-shrink-0" />
                <div className="space-y-2">
                    <p className="font-bold">{status.message.split('.')[0]}.</p>
                    <p>{status.message.split('.').slice(1).join('.')}</p>
                    {/* Only show permission hint if it's NOT a size error */}
                    {!status.message.includes("Too Large") && (
                        <p className="text-xs text-red-500 mt-2">
                            * Please Run <strong>Test Connection</strong> in settings to debug.
                        </p>
                    )}
                </div>
            </div>
          </div>
        )}

        {status.state === 'uploading' && (
           <div className="space-y-2">
              <div className="p-4 bg-blue-50 text-blue-700 rounded-lg flex items-center justify-between text-sm animate-pulse">
                <div className="flex items-center">
                    <Loader2 size={16} className="mr-2 animate-spin" />
                    <span>{status.message}</span>
                </div>
                <span className="font-bold">{progress}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2.5">
                <div className="bg-teal-600 h-2.5 rounded-full transition-all duration-300" style={{ width: `${progress}%` }}></div>
              </div>
           </div>
        )}

        <button
          type="submit"
          disabled={status.state === 'uploading'}
          className="w-full bg-slate-900 text-white font-semibold py-3 rounded-xl shadow-lg hover:bg-slate-800 focus:ring-4 focus:ring-slate-200 transition-all disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
        >
          {status.state === 'uploading' ? (
            <>
              <Loader2 className="animate-spin" size={20} />
              <span>Processing...</span>
            </>
          ) : (
            <>
              {scriptUrl ? <Upload size={20} /> : <Download size={20} />}
              <span>{scriptUrl ? 'Submit Assignment' : 'Process & Download'}</span>
            </>
          )}
        </button>
      </form>
    </div>
  );
};