import { GoogleGenAI, Type, Schema } from "@google/genai";
import { AIAnalysisResult } from "../types";

const genAI = new GoogleGenAI({ apiKey: process.env.API_KEY });

const designSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    textContent: {
      type: Type.STRING,
      description: "Creative, short, punchy headline or text content generated based on the user's prompt (max 6-8 words).",
    },
    textColor: {
      type: Type.STRING,
      description: "Optimal CSS hex color for text to ensure readability against the background.",
    },
    fontFamily: {
      type: Type.STRING,
      description: "Recommended CSS font-family value. Choose based on the mood: 'Great Vibes' (Elegant/Script), 'Oswald' (Bold/Impact), 'Inter' (Modern), 'Playfair Display' (Classic), 'Roboto Mono' (Tech).",
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
      description: "Short explanation of the design choices.",
    }
  },
  required: ["textContent", "textColor", "fontFamily", "textShadow", "suggestedTextPosition", "suggestedLogoPosition", "fontReasoning"],
};

export const generateDesign = async (
  imageBase64: string,
  userPrompt: string,
  styleImageBase64?: string | null
): Promise<AIAnalysisResult> => {
  try {
    let promptText = `
      You are an expert graphic designer and copywriter.
      Analyze the provided background image (first image).
      
      User Request: "${userPrompt}"
      
      Tasks:
      1. Write a creative, short headline or slogan based on the User Request.
      2. Choose the best font style (Script, Bold, Modern, etc.) that matches the text and image vibe.
      3. Determine the best font color (hex) for high contrast.
      4. Suggest a text-shadow if needed.
      5. Find the best "negative space" in the image to place the text.
      6. Suggest a balanced position for a logo.
    `;

    const parts: any[] = [
      { inlineData: { mimeType: "image/jpeg", data: imageBase64 } }
    ];

    if (styleImageBase64) {
      promptText += "\nAlso, analyze the second image provided (Style Reference). Try to match the font style (serif/sans/script) and color palette from this reference image in your suggestions.";
      parts.push({ inlineData: { mimeType: "image/jpeg", data: styleImageBase64 } });
    }

    parts.push({ text: promptText });

    const response = await genAI.models.generateContent({
      model: "gemini-2.5-flash",
      contents: { parts },
      config: {
        responseMimeType: "application/json",
        responseSchema: designSchema,
        temperature: 0.5, 
      },
    });

    const text = response.text;
    if (!text) throw new Error("No response from AI");

    return JSON.parse(text) as AIAnalysisResult;

  } catch (error) {
    console.error("Gemini Design Error:", error);
    return {
      textContent: userPrompt || "New Design",
      textColor: "#ffffff",
      fontFamily: "Inter, sans-serif",
      textShadow: "0px 2px 4px rgba(0,0,0,0.5)",
      fontReasoning: "Fallback due to connection error.",
      suggestedTextPosition: "center",
      suggestedLogoPosition: "bottom-right",
    };
  }
};

export const generateSticker = async (prompt: string): Promise<string | null> => {
  try {
    const response = await genAI.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [
          {
            text: `Generate a high quality, isolated sticker-style illustration of: ${prompt}. The background must be SOLID WHITE. Do NOT use transparency pattern/checkerboard.`,
          },
        ],
      },
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
    return null;
  } catch (error) {
    console.error("Gemini Image Gen Error:", error);
    return null;
  }
};

export const generateTypographyImage = async (prompt: string, styleImageBase64?: string | null): Promise<string | null> => {
  try {
    const parts: any[] = [];
    
    let textPrompt = `Create a high-quality, artistic typography design image for the text: "${prompt}". 
    The text should be the main focus. 
    CRITICAL: The background MUST be a SOLID WHITE COLOR. Do NOT generate a checkerboard or transparent pattern.
    The style should be creative, eye-catching, and legible.`;

    if (styleImageBase64) {
      textPrompt += ` Use the provided image as a visual style reference (colors, texture, vibe) for the text effect.`;
      parts.push({ inlineData: { mimeType: "image/jpeg", data: styleImageBase64 } });
    }

    parts.push({ text: textPrompt });

    const response = await genAI.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: { parts },
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
    return null;
  } catch (error) {
    console.error("Gemini Typography Error:", error);
    return null;
  }
};