
import React, { useState, useRef, useEffect } from 'react';
import { Upload, FileVideo, CheckCircle, Loader2, AlertCircle, PlayCircle, X, Download, Settings, Trash2, Copy, Link as LinkIcon } from 'lucide-react';
import { AssignmentType, StudentSubmission, UploadStatus } from '../types';
import { uploadFileToScript, downloadRenamedFile } from '../services/drive';

// Embedded default script URL provided by user
const DEFAULT_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbx4hkTeCOkBhfCDksFY4TOjQtoC5gwqNfp66uk4wTnSyadsl6_pbBkFWyp_coQBebuQ/exec";

export const SubmissionForm: React.FC = () => {
  const [formData, setFormData] = useState<StudentSubmission>({
    firstName: '',
    lastName: '',
    section: '',
    assignmentType: AssignmentType.NAIL_CARE,
    file: null
  });

  // Settings State
  // Initialize with the default embedded URL
  const [scriptUrl, setScriptUrl] = useState<string>(DEFAULT_SCRIPT_URL);
  const [showSettings, setShowSettings] = useState(false);

  const [status, setStatus] = useState<UploadStatus>({
    state: 'idle',
    message: ''
  });

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load configs from local storage (allow overrides if user changed it)
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
  };

  const clearScriptUrl = () => {
    setScriptUrl('');
    localStorage.removeItem('google_script_url');
  };

  const restoreDefaultScript = () => {
    setScriptUrl(DEFAULT_SCRIPT_URL);
    localStorage.removeItem('google_script_url'); // clear override
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
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
        ? `Uploading "${renamedFile}"...` 
        : `Preparing "${renamedFile}" for submission...`
    });

    try {
        if (scriptUrl) {
            await uploadFileToScript(formData.file, renamedFile, scriptUrl);
            setStatus({
                state: 'success',
                message: 'Submission successful! File uploaded via Secure Link.',
                renamedFileName: renamedFile
            });
        } else {
            // Fallback: Download if no script url (shouldn't happen with default)
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
        
        // Fallback on error
        downloadRenamedFile(formData.file, renamedFile);
        
        let userMessage = `Auto-upload failed. File downloaded for manual submission.`;
        
        setStatus({
            state: 'success', 
            message: userMessage,
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
  };

  // The Google Apps Script code to display to the user (optional now, since it's embedded)
  const GAS_CODE = `function doPost(e) {
  // Set your Folder ID inside the script
  var folderId = "YOUR_FOLDER_ID_HERE";
  
  try {
    var folder = DriveApp.getFolderById(folderId);
    var data = JSON.parse(e.postData.contents);
    var blob = Utilities.newBlob(Utilities.base64Decode(data.bytes), data.mimeType, data.filename);
    var file = folder.createFile(blob);
    
    return ContentService.createTextOutput(JSON.stringify({ 
      status: "success", 
      id: file.getId(), 
      url: file.getUrl() 
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ 
      status: "error", 
      message: err.toString() 
    })).setMimeType(ContentService.MimeType.JSON);
  }
}`;

  if (status.state === 'success') {
    return (
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-2xl w-full mx-auto animate-fade-in">
        <div className="flex flex-col items-center text-center space-y-4">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center text-green-600">
            <CheckCircle size={32} />
          </div>
          <h2 className="text-2xl font-bold text-gray-800">
             {status.message.includes("Submission successful") ? "Submission Complete" : "File Ready for Submission"}
          </h2>
          
          <div className="bg-amber-50 border border-amber-200 p-4 rounded-lg text-left text-sm text-amber-800 w-full flex items-start">
             <AlertCircle size={16} className="mt-0.5 mr-2 flex-shrink-0" />
             <div>
                {!status.message.includes("Submission successful") ? (
                    <>
                        <p className="font-bold">Action Required:</p>
                        <p className="mt-1">{status.message}</p>
                        <p className="mt-2">Please drag and drop <strong>{status.renamedFileName}</strong> into the Google Drive folder manually.</p>
                    </>
                ) : (
                    <p>File successfully uploaded to the teacher's folder.</p>
                )}
             </div>
          </div>

          <div className="bg-gray-50 p-6 rounded-lg w-full text-left space-y-3 border border-gray-100">
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Renamed File</p>
              <p className="text-sm text-gray-700 font-bold mt-1 break-all">{status.renamedFileName}</p>
            </div>
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

  const hasConfig = !!scriptUrl;

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
                    <LinkIcon size={14} className="inline mr-1 mb-0.5" /> Backend Configuration
                  </button>
              </div>

             <div className="p-4 bg-white">
                <p className="text-xs text-slate-600 mb-3">
                    <strong>Status:</strong> {scriptUrl === DEFAULT_SCRIPT_URL ? <span className="text-green-600 font-bold">System Default Link Active</span> : "Custom Link Active"}
                </p>
                
                {scriptUrl !== DEFAULT_SCRIPT_URL && (
                    <div className="bg-amber-50 p-2 mb-3 rounded border border-amber-200 text-xs text-amber-800 flex justify-between items-center">
                        <span>You are using a custom script URL.</span>
                        <button onClick={restoreDefaultScript} className="text-amber-700 underline font-semibold">Restore Default</button>
                    </div>
                )}
                
                <div className="bg-slate-100 p-3 rounded border border-slate-200 text-[10px] space-y-2 mb-3">
                    <p className="font-semibold text-slate-700">Backend Connection:</p>
                    <p>This system uses a secure Google Apps Script to handle file uploads safely.</p>
                </div>
                
                <div className="flex space-x-2">
                    <input 
                        type="text"
                        value={scriptUrl}
                        onChange={handleScriptUrlChange}
                        placeholder="Paste Web App URL (https://script.google.com/...)"
                        className="flex-grow text-sm p-2 border border-slate-300 rounded focus:ring-2 focus:ring-teal-500 outline-none text-slate-500"
                    />
                    {scriptUrl && scriptUrl !== DEFAULT_SCRIPT_URL && (
                        <button onClick={clearScriptUrl} className="px-3 py-2 bg-red-100 text-red-600 rounded hover:bg-red-200" title="Clear URL">
                            <Trash2 size={16} />
                        </button>
                    )}
                </div>
             </div>
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
              <p className="text-gray-500 text-sm mt-1">MP4, WebM</p>
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

        {status.state === 'uploading' && (
           <div className="p-4 bg-blue-50 text-blue-700 rounded-lg flex items-center text-sm animate-pulse">
             <Loader2 size={16} className="mr-2 animate-spin" />
             {status.message}
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
              <span>{scriptUrl ? 'Submit Assignment' : 'Process & Download for Upload'}</span>
            </>
          )}
        </button>
      </form>
    </div>
  );
};
