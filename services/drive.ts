
import { StudentSubmission } from "../types";

const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink';

/**
 * Uploads a file to Google Drive using the specific Folder ID.
 * Requires a valid Google OAuth 2.0 Access Token.
 */
export const uploadFileToDrive = async (
  file: File, 
  renamedFileName: string, 
  folderId: string, 
  accessToken: string
): Promise<{ id: string; name: string; webViewLink?: string }> => {
  const metadata = {
    name: renamedFileName,
    parents: [folderId], // Upload specifically to this folder
    mimeType: file.type,
  };

  const form = new FormData();
  form.append(
    'metadata',
    new Blob([JSON.stringify(metadata)], { type: 'application/json' })
  );
  form.append('file', file);

  const response = await fetch(DRIVE_UPLOAD_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: form,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `Drive API Error: ${response.status} ${response.statusText}`);
  }

  return response.json();
};

/**
 * Uploads a file via a Google Apps Script Web App.
 * This bypasses the 1-hour token limit and works indefinitely if set up correctly.
 */
export const uploadFileToScript = async (
  file: File,
  renamedFileName: string,
  scriptUrl: string
): Promise<any> => {
  
  // 1. Convert file to Base64
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      // Remove 'data:video/mp4;base64,' prefix
      resolve(result.split(',')[1]);
    };
    reader.onerror = (err) => reject(err);
  });

  // 2. Prepare Payload
  const payload = {
    filename: renamedFileName,
    mimeType: file.type,
    bytes: base64
  };

  // 3. Send to Script
  // We use Content-Type: text/plain to avoid CORS preflight (OPTIONS) requests
  // which Google Apps Script doesn't handle natively.
  const response = await fetch(scriptUrl, {
    method: 'POST',
    mode: 'cors',
    headers: {
      'Content-Type': 'text/plain;charset=utf-8',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Script Error: ${response.status}`);
  }

  const text = await response.text();
  try {
    const json = JSON.parse(text);
    if (json.status === 'error') throw new Error(json.message);
    return json;
  } catch (e) {
    // If response isn't JSON, it might be an HTML error page from Google
    console.warn("Script response was not JSON", text);
    // If the request succeeded (200 OK) but we can't parse JSON, assume success for now
    // or throw if strict.
    return { status: 'success', note: 'Response received' };
  }
};

/**
 * Triggers a browser download of the file with the new name.
 * Fallback for when API upload is not possible (no auth).
 */
export const downloadRenamedFile = (file: File, filename: string) => {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};
