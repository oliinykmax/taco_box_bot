import { GoogleGenerativeAI } from "@google/generative-ai";
import "dotenv/config";

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.warn("GEMINI_API_KEY is not defined in .env");
}

const genAI = new GoogleGenerativeAI(apiKey || "");

// Використовуємо модель gemini-3-flash-preview за запитом користувача
const model = genAI.getGenerativeModel({ 
  model: "gemini-3-flash-preview",
  generationConfig: { responseMimeType: "application/json" }
});

export interface MealEstimation {
  items: Array<{
    name: string;
    grams: number;
    calories: number;
  }>;
  total_calories: number;
  confidence: number;
}

export async function estimateCalories(mealText: string): Promise<MealEstimation | null> {
  if (!apiKey) {
    console.error("Gemini API key is missing.");
    return null;
  }

  const prompt = `
    Estimate the calories and nutritional information for the following meal description: "${mealText}".
    
    Requirements:
    1. Return ONLY a valid JSON object.
    2. Break down the meal into individual products (items).
    3. Estimate weight in grams and calories for each product.
    4. Calculate the total_calories as the sum of all item calories.
    5. Add a "confidence" field (a number between 0 and 1).
    
    JSON Structure:
    {
      "items": [
        { "name": "product name", "grams": number, "calories": number }
      ],
      "total_calories": number,
      "confidence": number
    }
    
    If the input is in Ukrainian, use Ukrainian for product names.
  `;

  try {
    console.log(`[Gemini] Estimating: "${mealText}"`);
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text().trim();
    const data = JSON.parse(text);

    if (
      data &&
      Array.isArray(data.items) &&
      typeof data.total_calories === "number" &&
      typeof data.confidence === "number"
    ) {
      console.log(`[Gemini] Success: ${data.total_calories} kcal (Confidence: ${data.confidence})`);
      return data as MealEstimation;
    }

    console.error("[Gemini] Invalid JSON structure received:", data);
    return null;
  } catch (error: any) {
    if (error.status === 429) {
      console.error("[Gemini] Quota Exceeded (429). Check your billing or wait a minute.");
    } else if (error.status === 404) {
      console.error("[Gemini] Model not found (404). Check the model name.");
    } else {
      console.error("[Gemini] Unexpected Error:", error.message || error);
    }
    return null;
  }
}

// Оновлений тест
export async function testGemini() {
  try {
    const data = await estimateCalories("2 eggs and toast");
    if (data) {
      console.log("Gemini JSON Response:", JSON.stringify(data, null, 2));
      return data.total_calories > 0;
    }
    return false;
  } catch (error) {
    console.error("Gemini Test failed:", error);
    return false;
  }
}
