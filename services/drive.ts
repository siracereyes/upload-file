
import { StudentSubmission } from "../types";

/**
 * Helper: Convert Blob/File to Base64
 */
const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(blob);
    reader.onload = () => {
      const result = reader.result as string;
      // Remove 'data:video/mp4;base64,' prefix
      resolve(result.split(',')[1]);
    };
    reader.onerror = (err) => reject(err);
  });
};

export const testScriptConnection = async (scriptUrl: string): Promise<boolean> => {
    const response = await fetch(scriptUrl, {
        method: 'POST',
        body: JSON.stringify({ action: "test" })
    });
    const json = await response.json();
    if (json.status !== 'success') {
        throw new Error(json.message || 'Script error');
    }
    return true;
};

/**
 * Uploads a file via a Google Apps Script Proxy to Google Drive Resumable Upload API.
 * This method is robust for large files (100MB+) as it streams chunks.
 */
export const uploadFileToScript = async (
  file: File,
  renamedFileName: string,
  scriptUrl: string,
  onProgress?: (percentage: number) => void
): Promise<any> => {
  
  // Use 5MB chunks. This is small enough to avoid GAS memory limits (50MB)
  // while large enough to be efficient.
  const CHUNK_SIZE = 5 * 1024 * 1024; 
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

  // --- STEP 1: INITIALIZE UPLOAD SESSION ---
  // We ask the script to get a Resumable Upload URL from Drive API
  const initResponse = await fetch(scriptUrl, {
      method: 'POST',
      body: JSON.stringify({
          action: "init",
          filename: renamedFileName,
          mimeType: file.type
      })
  });

  // Handle HTML error pages (e.g. from 404 or 403) that might come back as 200 OK from redirects
  const contentType = initResponse.headers.get("content-type");
  if (contentType && contentType.includes("text/html")) {
      throw new Error("Script Permission Error: Received HTML instead of JSON. Ensure script is deployed to 'Anyone'.");
  }

  const initJson = await initResponse.json();
  if (initJson.status !== 'success' || !initJson.url) {
      throw new Error(initJson.message || "Failed to initialize upload session");
  }

  const uploadUrl = initJson.url;

  // --- STEP 2: UPLOAD CHUNKS ---
  for (let i = 0; i < totalChunks; i++) {
    const start = i * CHUNK_SIZE;
    const end = Math.min(file.size, start + CHUNK_SIZE);
    const chunkBlob = file.slice(start, end);
    
    // Convert chunk to base64 so GAS can receive it
    const base64 = await blobToBase64(chunkBlob);

    // Calculate Content-Range header for Drive API
    // Format: bytes start-end/total
    const rangeHeader = `bytes ${start}-${end - 1}/${file.size}`;

    const chunkPayload = {
      action: "chunk",
      uploadUrl: uploadUrl, // The GAS will PUT to this URL
      base64: base64,
      range: rangeHeader
    };

    // Retry logic for stability
    let retries = 3;
    let chunkSuccess = false;
    let lastError;

    while (retries > 0 && !chunkSuccess) {
        try {
            const response = await fetch(scriptUrl, {
                method: 'POST',
                // Removed 'mode: cors' to allow simple POST (GAS handles CORS)
                body: JSON.stringify(chunkPayload),
            });

            if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);

            const json = await response.json();
            if (json.status === 'error') throw new Error(json.message);

            chunkSuccess = true;
        } catch (err) {
            console.warn(`Chunk ${i+1}/${totalChunks} failed, retrying...`, err);
            lastError = err;
            retries--;
            if (retries > 0) await new Promise(r => setTimeout(r, 2000));
        }
    }

    if (!chunkSuccess) {
        throw lastError || new Error("Upload failed after retries");
    }

    // Update Progress
    if (onProgress) {
        const progress = Math.round(((i + 1) / totalChunks) * 100);
        onProgress(progress);
    }
  }

  return { status: 'success' };
};

/**
 * Triggers a browser download of the file with the new name.
 * Fallback for when API upload is not possible.
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
