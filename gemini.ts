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

  const makeRequest = async (attempt: number): Promise<MealEstimation | null> => {
    try {
      console.log(`[Gemini] Attempt ${attempt} for: "${mealText}"`);
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
        console.log(`[Gemini] Success on attempt ${attempt}: ${data.total_calories} kcal`);
        return data as MealEstimation;
      }

      console.error(`[Gemini] Invalid JSON structure on attempt ${attempt}:`, data);
      return null;
    } catch (error: any) {
      console.error(`[Gemini] Error on attempt ${attempt}:`, error.message || error);
      return null;
    }
  };

  // Перша спроба
  let result = await makeRequest(1);
  
  // Якщо не вдалося, пробуємо ще раз через 1 секунду
  if (!result) {
    console.log("[Gemini] Retrying in 1 second...");
    await new Promise(resolve => setTimeout(resolve, 1000));
    result = await makeRequest(2);
  }

  return result;
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
