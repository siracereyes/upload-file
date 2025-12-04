import { GoogleGenAI } from "@google/genai";
import { AssignmentType } from "../types";

const GEMINI_API_KEY = process.env.API_KEY || '';

/**
 * Converts a File object to a Base64 string for Gemini consumption.
 * Note: Browser-based base64 encoding has limits. Large video files might crash.
 * We limit this check to reasonable file sizes or truncate for the demo.
 */
const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      // Remove the data URL prefix (e.g., "data:video/mp4;base64,")
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = (error) => reject(error);
  });
};

export const analyzeSubmission = async (
  file: File,
  assignmentType: AssignmentType,
  studentName: string
): Promise<string> => {
  if (!GEMINI_API_KEY) {
    console.warn("No API Key available for analysis");
    return "AI analysis skipped (No API Key).";
  }

  // Limit check for browser performance (arbitrary 20MB safety net for base64 in browser)
  if (file.size > 20 * 1024 * 1024) {
    return "Video is too large for immediate AI preview, but it will be uploaded to the teacher's folder.";
  }

  try {
    const base64Data = await fileToBase64(file);
    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    
    const prompt = `
      You are a supportive Grade 8 Wellness and Beauty Care teacher. 
      Student Name: ${studentName}
      Assignment Type: ${assignmentType}
      
      Please analyze the attached video frame(s) or video file.
      1. Verify if the video appears to be about ${assignmentType}.
      2. Provide a 2-sentence encouraging comment about their technique or effort.
      3. If it doesn't look like the correct assignment, gently warn them.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: file.type,
              data: base64Data
            }
          },
          { text: prompt }
        ]
      }
    });

    return response.text || "No feedback generated.";
  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    return "Could not generate AI preview. Proceeding with submission.";
  }
};
