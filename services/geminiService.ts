import { GoogleGenAI, Type, Schema } from "@google/genai";
import { FontStyle, AIAnalysisResult } from "../types";

const genAI = new GoogleGenAI({ apiKey: process.env.API_KEY });

const analysisSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    textColor: {
      type: Type.STRING,
      description: "Optimal CSS hex color for text to ensure readability against the background.",
    },
    fontFamily: {
      type: Type.STRING,
      description: "Recommended CSS font-family value based on the requested style (e.g., 'Great Vibes', 'Oswald', 'Inter').",
    },
    textShadow: {
      type: Type.STRING,
      description: "CSS text-shadow value to improve contrast (e.g., '2px 2px 4px rgba(0,0,0,0.8)'). Use 'none' if not needed.",
    },
    suggestedTextPosition: {
      type: Type.STRING,
      enum: ['top-left', 'top-center', 'top-right', 'center-left', 'center', 'center-right', 'bottom-left', 'bottom-center', 'bottom-right'],
      description: "Best region to place the text where it does not obscure the main subject.",
    },
    suggestedLogoPosition: {
      type: Type.STRING,
      enum: ['top-left', 'top-center', 'top-right', 'center-left', 'center', 'center-right', 'bottom-left', 'bottom-center', 'bottom-right'],
      description: "Best region to place the logo to balance the composition.",
    },
    fontReasoning: {
      type: Type.STRING,
      description: "Short explanation of why these styles and positions were chosen.",
    }
  },
  required: ["textColor", "fontFamily", "textShadow", "suggestedTextPosition", "suggestedLogoPosition", "fontReasoning"],
};

export const analyzeImageAndSuggestStyle = async (
  imageBase64: string,
  userText: string,
  stylePref: FontStyle
): Promise<AIAnalysisResult> => {
  try {
    const prompt = `
      You are an expert graphic designer.
      Analyze the provided background image.
      I need to overlay the text "${userText}" and a company logo on this image.
      
      The user prefers a "${stylePref}" font style.
      
      Tasks:
      1. Determine the best font color (hex) for high contrast.
      2. Choose a specific font-family from this list that matches the "${stylePref}" style and image vibe:
         - 'Great Vibes', cursive (for Script)
         - 'Oswald', sans-serif (for Bold/Impact)
         - 'Inter', sans-serif (for Modern/Regular)
         - 'Playfair Display', serif (for Elegant/Classic)
         - 'Roboto Mono', monospace (for Tech/Mono)
      3. Suggest a text-shadow if needed for readability.
      4. Find the best "negative space" or empty area in the image to place the text so it doesn't cover faces or main subjects.
      5. Suggest a balanced position for the logo.
    `;

    const response = await genAI.models.generateContent({
      model: "gemini-2.5-flash",
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: "image/jpeg", // Assuming JPEG/PNG, the API is flexible with common image types
              data: imageBase64,
            },
          },
          { text: prompt },
        ],
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: analysisSchema,
        temperature: 0.4, // Lower temperature for more consistent design rules
      },
    });

    const text = response.text;
    if (!text) throw new Error("No response from AI");

    return JSON.parse(text) as AIAnalysisResult;

  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    // Fallback if AI fails
    return {
      textColor: "#ffffff",
      fontFamily: "Inter, sans-serif",
      textShadow: "0px 2px 4px rgba(0,0,0,0.5)",
      fontReasoning: "Fallback due to connection error.",
      suggestedTextPosition: "center",
      suggestedLogoPosition: "bottom-right",
    };
  }
};

export const generateCreativeCopy = async (prompt: string): Promise<string> => {
  try {
    const result = await genAI.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `Write a short, punchy, and creative marketing headline or slogan (max 8 words) based on this topic/prompt: "${prompt}". Return ONLY the text, no quotes or explanations.`,
    });
    return result.text?.trim() || prompt;
  } catch (error) {
    console.error("Gemini Text Gen Error:", error);
    return prompt;
  }
};
