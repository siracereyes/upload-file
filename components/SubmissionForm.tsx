import React, { useState, useRef, useEffect } from 'react';
import { Upload, FileVideo, CheckCircle, Loader2, AlertCircle, PlayCircle, X, Download, Settings, Trash2, Link as LinkIcon, HelpCircle, AlertTriangle, Activity, RefreshCw } from 'lucide-react';
import { AssignmentType, StudentSubmission, UploadStatus } from '../types';
import { uploadFileToScript, downloadRenamedFile, testScriptConnection } from '../services/drive';

// New default URL provided by user
const DEFAULT_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbz84cdpDO0qbG7dKxz_R4_z-_CqNVQYJ87xbp72Fy2h2rnDaucixL3ryWW5OhCvvwUz/exec";
// User requested 50MB limit
const MAX_FILE_SIZE_MB = 50;
const WARNING_SIZE_MB = 25;

const TROUBLESHOOTING_CODE = `function doPost(e) {
  // -----------------------------------------------------------
  // CONFIGURATION: PASTE YOUR FOLDER ID BELOW
  // 1. Go to your Google Drive Folder.
  // 2. Copy the ID from the URL (folders/THIS_PART)
  // 3. Paste it inside the quotes below.
  var FOLDER_ID = "1DF2vqZrluAWcj7upY-FD7W1P23TlfUuI"; 
  // -----------------------------------------------------------

  try {
    var req = JSON.parse(e.postData.contents);
    
    // --- ACTION: TEST CONNECTION ---
    if (req.action === "test") {
      // 1. Verify Folder Access
      try {
        var folder = DriveApp.getFolderById(FOLDER_ID);
      } catch (fErr) {
        throw new Error("Folder Error: Could not find Folder with ID '" + FOLDER_ID + "'. Please check the FOLDER_ID variable in Code.gs and ensure you have access.");
      }
      
      // 2. Verify API Auth (Strict Check)
      // This forces the script to check if it has external request permissions
      var testResp = UrlFetchApp.fetch("https://www.googleapis.com/drive/v3/about?fields=user", {
        headers: { "Authorization": "Bearer " + ScriptApp.getOAuthToken() },
        muteHttpExceptions: true
      });
      
      if (testResp.getResponseCode() >= 400) {
        throw new Error("Auth Token Invalid: " + testResp.getContentText());
      }
      
      return ContentService.createTextOutput(JSON.stringify({ status: "success" }));
    }
    
    // --- ACTION: INITIALIZE UPLOAD ---
    if (req.action === "init") {
      // Verify folder exists before starting
      try {
        DriveApp.getFolderById(FOLDER_ID);
      } catch (e) {
         throw new Error("Folder ID '" + FOLDER_ID + "' not found.");
      }

      var url = "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable";
      var meta = { 
        name: req.filename, 
        mimeType: req.mimeType, 
        parents: [FOLDER_ID] 
      };
      
      var resp = UrlFetchApp.fetch(url, {
        method: "post",
        contentType: "application/json",
        payload: JSON.stringify(meta),
        headers: { "Authorization": "Bearer " + ScriptApp.getOAuthToken() },
        muteHttpExceptions: true
      });
      
      if (resp.getResponseCode() >= 400) {
         return ContentService.createTextOutput(JSON.stringify({ 
           status: "error", 
           message: "Drive Init Failed: " + resp.getContentText() 
         }));
      }
      
      return ContentService.createTextOutput(JSON.stringify({ 
        status: "success", 
        url: resp.getAllHeaders()["Location"] 
      }));
    }
    
    // --- ACTION: UPLOAD CHUNK ---
    if (req.action === "chunk") {
      var data = Utilities.base64Decode(req.base64);
      var blob = Utilities.newBlob(data);
      
      var resp = UrlFetchApp.fetch(req.uploadUrl, {
        method: "put",
        payload: blob,
        headers: { "Content-Range": req.range },
        muteHttpExceptions: true
      });
      
      var code = resp.getResponseCode();
      if (code === 308 || code === 200 || code === 201) {
        return ContentService.createTextOutput(JSON.stringify({ status: "success" }));
      } else {
        return ContentService.createTextOutput(JSON.stringify({ 
          status: "error", 
          message: "Drive API Error: " + resp.getContentText() 
        }));
      }
    }
    
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "Invalid action" }));
    
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: err.toString() }));
  }
}

function doSetup() {
  // FORCE PERMISSIONS:
  var f = DriveApp.createFile("perm_check.txt", "test");
  f.setTrashed(true);
  UrlFetchApp.fetch("https://www.google.com");
  console.log("Permissions Verified. You MUST now Deploy -> New Version.");
}`;

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
    setTestMessage('Testing permissions...');
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
    return `Video Upload_${safeSection}_${safeFirst}_${safeLast}.${ext}`.replace(/[\\/:"*?<>|]/g, '');
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
        let displayError = errorMsg;
        let detailedMsg = `Auto-upload failed. File downloaded for manual submission.`;
        
        // Detailed Detection logic
        if (errorMsg.includes("Failed to fetch") || errorMsg.includes("NetworkError")) {
             displayError = "Connection Error";
             detailedMsg = "Could not connect to Google Drive. Check internet or Script permissions.";
        } else if (errorMsg.includes("Drive Init Failed") || errorMsg.includes("Auth Token Invalid") || errorMsg.includes("Exception") || errorMsg.includes("Permission") || errorMsg.includes("Folder Error") || errorMsg.includes("Folder ID")) {
             displayError = "Script Configuration Error";
             detailedMsg = errorMsg; // Show the actual error (like Folder Not Found)
        }
        
        // Fallback
        downloadRenamedFile(formData.file, renamedFile);
        
        setStatus({
            state: 'error', // Use error state to warn user clearly
            message: `${displayError}. ${detailedMsg}`,
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

  // SUCCESS STATE
  if (status.state === 'success') {
    return (
      <div className="bg-white rounded-2xl shadow-xl p-6 sm:p-8 max-w-2xl w-full mx-auto animate-fade-in">
        <div className="flex flex-col items-center text-center space-y-4">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center text-green-600">
            <CheckCircle size={32} />
          </div>
          <h2 className="text-2xl font-bold text-gray-900">Submission Complete</h2>
          
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 w-full">
            <p className="text-green-800 font-medium">{status.message}</p>
            {status.renamedFileName && (
              <p className="text-xs text-green-600 mt-1 font-mono break-all">{status.renamedFileName}</p>
            )}
          </div>

          <button
            onClick={resetForm}
            className="mt-6 px-6 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors flex items-center space-x-2"
          >
            <RefreshCw size={18} />
            <span>Submit Another Video</span>
          </button>
        </div>
      </div>
    );
  }

  // MAIN FORM
  return (
    <div className="max-w-2xl w-full mx-auto space-y-6">
      
      {/* Settings Toggle */}
      <div className="flex justify-end">
        <button 
          onClick={() => setShowSettings(!showSettings)}
          className={`flex items-center space-x-2 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
            status.state === 'error' ? 'bg-red-100 text-red-600' : 'bg-white text-slate-500 hover:text-slate-800'
          }`}
        >
          {status.state === 'error' ? <AlertTriangle size={14} /> : <Settings size={14} />}
          <span>{status.state === 'error' ? 'Fix Settings' : 'Settings'}</span>
        </button>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div className="bg-white rounded-2xl shadow-xl p-6 animate-fade-in border border-slate-200">
             <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                    <Activity size={18} />
                    Connection Settings
                </h3>
                <button onClick={() => setShowSettings(false)} className="text-slate-400 hover:text-slate-600">
                    <X size={20} />
                </button>
             </div>

             <div className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Google Apps Script URL</label>
                    <div className="flex space-x-2">
                        <input 
                            type="text" 
                            className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono text-slate-600 focus:ring-2 focus:ring-teal-500 outline-none"
                            placeholder="https://script.google.com/..."
                            value={scriptUrl}
                            onChange={handleScriptUrlChange}
                        />
                        <button 
                            onClick={runConnectionTest}
                            disabled={testStatus === 'testing'}
                            className="px-3 py-2 bg-teal-600 text-white rounded-lg text-xs font-medium hover:bg-teal-700 disabled:opacity-50 whitespace-nowrap"
                        >
                            {testStatus === 'testing' ? <Loader2 className="animate-spin" size={14} /> : 'Test Connection'}
                        </button>
                    </div>
                    {scriptUrl !== DEFAULT_SCRIPT_URL && (
                         <button onClick={restoreDefaultScript} className="text-[10px] text-teal-600 hover:underline mt-1">
                             Restore Default URL
                         </button>
                    )}
                </div>

                {/* Test Status Message */}
                {testStatus !== 'idle' && (
                    <div className={`p-3 rounded-lg text-xs border ${
                        testStatus === 'success' ? 'bg-green-50 border-green-200 text-green-700' : 
                        testStatus === 'error' ? 'bg-red-50 border-red-200 text-red-700' : 'bg-slate-50 border-slate-200 text-slate-600'
                    }`}>
                        <div className="font-bold mb-1 flex items-center gap-2">
                            {testStatus === 'success' ? <CheckCircle size={14}/> : 
                             testStatus === 'error' ? <AlertCircle size={14}/> : <Loader2 className="animate-spin" size={14}/>}
                            {testStatus === 'success' ? 'Success' : testStatus === 'error' ? 'Test Failed' : 'Testing...'}
                        </div>
                        {testMessage}
                    </div>
                )}

                <div className="pt-4 border-t border-slate-100">
                     <h4 className="text-sm font-semibold text-slate-800 mb-2 flex items-center gap-2">
                        <HelpCircle size={14} />
                        Troubleshooting (Admins Only)
                     </h4>
                     <div className="bg-slate-50 rounded-lg p-3 text-xs text-slate-600 space-y-2">
                         <p className="font-bold text-amber-700">Important: You must set the correct FOLDER_ID below.</p>
                         <ol className="list-decimal pl-4 space-y-1">
                             <li>Copy the code below.</li>
                             <li>Go to <a href="https://script.google.com" target="_blank" rel="noopener noreferrer" className="text-teal-600 hover:underline">Google Apps Script</a>.</li>
                             <li>Paste the code into <strong>Code.gs</strong> (delete old code).</li>
                             <li><strong>UPDATE THE FOLDER_ID</strong> variable in the code with your specific Drive Folder ID.</li>
                             <li>Run <code>doSetup</code> to authorize permissions.</li>
                             <li>Click <strong>Deploy</strong> &rarr; <strong>Manage Deployments</strong>.</li>
                             <li>Click Edit (Pencil) &rarr; Version: <strong>New Version</strong> &rarr; Deploy.</li>
                         </ol>
                         <div className="relative group">
                            <textarea 
                                readOnly 
                                className="w-full h-32 p-2 bg-slate-800 text-slate-300 font-mono text-[10px] rounded border border-slate-700 mt-2 focus:outline-none"
                                value={TROUBLESHOOTING_CODE}
                            />
                            <button 
                                onClick={() => navigator.clipboard.writeText(TROUBLESHOOTING_CODE)}
                                className="absolute top-4 right-2 bg-white text-slate-900 px-2 py-1 rounded text-[10px] font-bold opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                            >
                                Copy Code
                            </button>
                         </div>
                     </div>
                </div>
             </div>
        </div>
      )}

      {/* Main Form Card */}
      <div className="bg-white rounded-2xl shadow-xl p-6 sm:p-8 animate-fade-in-up">
        <form onSubmit={handleSubmit} className="space-y-6">
          
          {/* Personal Info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">First Name</label>
              <input
                type="text"
                name="firstName"
                required
                value={formData.firstName}
                onChange={handleInputChange}
                className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none transition-all"
                placeholder="e.g. Juan"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Last Name</label>
              <input
                type="text"
                name="lastName"
                required
                value={formData.lastName}
                onChange={handleInputChange}
                className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none transition-all"
                placeholder="e.g. Dela Cruz"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Section</label>
              <select
                name="section"
                required
                value={formData.section}
                onChange={handleInputChange}
                className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none transition-all bg-white"
              >
                <option value="" disabled>Select Section</option>
                <option value="CALLALILY">CALLALILY</option>
                <option value="ANTHURIUM">ANTHURIUM</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Assignment</label>
              <div className="relative">
                <select
                  name="assignmentType"
                  value={formData.assignmentType}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none transition-all appearance-none bg-white"
                >
                  <option value={AssignmentType.NAIL_CARE}>Nail Care</option>
                  <option value={AssignmentType.ACUPRESSURE}>Acupressure Massage</option>
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                </div>
              </div>
            </div>
          </div>

          {/* Video Upload Area */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-700">Video Evidence</label>
            
            {!formData.file ? (
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-300 rounded-xl p-8 hover:bg-slate-50 transition-colors cursor-pointer group text-center"
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept="video/*"
                  className="hidden"
                />
                <div className="w-12 h-12 bg-teal-50 text-teal-600 rounded-full flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform">
                  <Upload size={24} />
                </div>
                <p className="text-sm font-medium text-slate-700">Click to upload video</p>
                <p className="text-xs text-slate-500 mt-1">MP4, WebM (Max {MAX_FILE_SIZE_MB}MB)</p>
              </div>
            ) : (
              <div className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50">
                <div className="p-3 flex items-center justify-between border-b border-slate-200 bg-white">
                  <div className="flex items-center space-x-3 overflow-hidden">
                    <div className="w-8 h-8 bg-teal-100 text-teal-600 rounded-lg flex items-center justify-center flex-shrink-0">
                      <FileVideo size={16} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-700 truncate">{formData.file.name}</p>
                      <p className={`text-xs ${
                          (formData.file.size / 1024 / 1024) > WARNING_SIZE_MB ? 'text-amber-600 font-bold' : 'text-slate-500'
                      }`}>
                        {(formData.file.size / 1024 / 1024).toFixed(1)} MB
                        {(formData.file.size / 1024 / 1024) > WARNING_SIZE_MB && ' (Large file)'}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={clearFile}
                    className="p-1 hover:bg-red-50 text-slate-400 hover:text-red-500 rounded-full transition-colors"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
                
                {previewUrl && (
                  <div className="aspect-video bg-black w-full relative group">
                    <video 
                      src={previewUrl} 
                      className="w-full h-full object-contain" 
                      controls 
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Status Messages */}
          {status.state === 'error' && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-start space-x-3 text-red-700">
              <AlertCircle className="flex-shrink-0 mt-0.5" size={20} />
              <div className="text-sm">
                 <p className="font-bold">{status.message.split('.')[0]}</p>
                 <p className="mt-1 opacity-90">{status.message.split('.').slice(1).join('.')}</p>
              </div>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={status.state === 'uploading'}
            className="w-full py-3 px-4 bg-slate-900 text-white rounded-xl font-medium hover:bg-slate-800 focus:ring-4 focus:ring-slate-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2 shadow-lg hover:shadow-xl"
          >
            {status.state === 'uploading' ? (
              <>
                <Loader2 className="animate-spin" size={20} />
                <span>{status.message || 'Processing...'}</span>
              </>
            ) : (
              <>
                <span>Submit Assignment</span>
                <CheckCircle size={20} />
              </>
            )}
          </button>
          
          {/* Progress Bar */}
          {status.state === 'uploading' && (
             <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700">
                <div className="bg-teal-600 h-2.5 rounded-full transition-all duration-300" style={{width: `${progress}%`}}></div>
             </div>
          )}

        </form>
      </div>
    </div>
  );
};