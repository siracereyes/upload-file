
import { StudentSubmission } from "../types";

/**
 * Uploads a file via a Google Apps Script Web App using Chunking.
 * This splits large files (up to 100MB) into smaller requests to avoid
 * Google's 50MB payload limit per request.
 */
export const uploadFileToScript = async (
  file: File,
  renamedFileName: string,
  scriptUrl: string,
  onProgress?: (percentage: number) => void
): Promise<any> => {
  
  // Chunk size: 20MB. 
  // 20MB * ~1.33 (Base64 overhead) = ~26.6MB payload. 
  // This is safely under the 50MB GAS limit.
  const CHUNK_SIZE = 20 * 1024 * 1024; 
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
  let fileId = null;

  for (let i = 0; i < totalChunks; i++) {
    const start = i * CHUNK_SIZE;
    const end = Math.min(file.size, start + CHUNK_SIZE);
    const chunkBlob = file.slice(start, end);
    
    // 1. Convert Chunk to Base64
    const base64Data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(chunkBlob);
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
      base64Data: base64Data,
      chunkIndex: i,
      totalChunks: totalChunks,
      fileId: fileId // Passed to link chunks to the same file
    };

    // 3. Send Chunk with Retry Logic
    // Large uploads can be flaky, so we retry a chunk if it fails network-wise
    let retries = 3;
    let chunkSuccess = false;
    let lastError;

    while (retries > 0 && !chunkSuccess) {
        try {
            const response = await fetch(scriptUrl, {
                method: 'POST',
                mode: 'cors',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify(payload),
            });

            if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);

            const text = await response.text();
            let json;
            try {
                json = JSON.parse(text);
            } catch (e) {
                // If we can't parse JSON but got 200 OK, it might be a silent success or HTML error
                // We'll throw to be safe unless it's the last chunk
                throw new Error("Invalid server response (not JSON)");
            }

            if (json.status === 'error') throw new Error(json.message);

            // Capture fileId from the first chunk response
            if (i === 0 && json.fileId) {
                fileId = json.fileId;
            }

            chunkSuccess = true;
        } catch (err) {
            lastError = err;
            retries--;
            if (retries > 0) {
                // Wait 2 seconds before retrying
                await new Promise(r => setTimeout(r, 2000));
            }
        }
    }

    if (!chunkSuccess) {
        throw lastError || new Error("Upload failed after retries");
    }

    // 4. Update Progress
    if (onProgress) {
        const progress = Math.round(((i + 1) / totalChunks) * 100);
        onProgress(progress);
    }
  }

  return { status: 'success' };
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
