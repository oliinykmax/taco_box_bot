import { testGemini } from "./gemini";
import { GoogleGenerativeAI } from "@google/generative-ai";
import "dotenv/config";

async function runTest() {
  console.log("🚀 Testing Gemini API integration...");

  const success = await testGemini();

  if (success) {
    console.log("✅ Success! Gemini API is working correctly.");
  } else {
    console.log("❌ Failure!");
    console.log("Checking available models for your API key...");
    
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      try {
        const genAI = new GoogleGenerativeAI(apiKey);
        // SDK doesn't have a direct listModels in all versions, 
        // but we can try to output more error details if needed.
        console.log("Ensure you have created the API key in Google AI Studio (aistudio.google.com).");
      } catch (err) {
        console.error("Could not list models:", err);
      }
    }
  }
}

runTest();
