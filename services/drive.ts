
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
