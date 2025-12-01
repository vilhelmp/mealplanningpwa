import { GoogleGenAI, Type } from "@google/genai";
import { Recipe, Nutrition, Ingredient } from '../types';

// Initialize Gemini
// Note: In a real PWA, the API key should be proxied or user-provided if client-side.
// We assume process.env.API_KEY is available as per guidelines.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

interface ParseInput {
  text?: string;
  fileData?: string; // base64
  mimeType?: string;
}

export const parseRecipeWithAI = async (input: ParseInput): Promise<Omit<Recipe, 'id' | 'images' | 'version'>> => {
  const modelId = "gemini-2.5-flash"; // Optimized for speed and JSON structure

  const promptText = `
    Extract a structured recipe from the provided content (text or document). 
    If the content is just a name of a dish, generate a plausible recipe for it.
    Use Metric units (kg, g, dl, tbsp, tsp) where possible.
    Infer the cuisine type (e.g., Italian, French, Asian, Mexican, Nordic, etc.).
  `;

  let contents;

  if (input.fileData && input.mimeType) {
    contents = {
      parts: [
        {
          inlineData: {
            mimeType: input.mimeType,
            data: input.fileData
          }
        },
        { 
          text: input.text ? `${promptText}\n\nAdditional context: "${input.text}"` : promptText 
        }
      ]
    };
  } else {
    contents = {
      parts: [
        { text: `${promptText}\n\nText to parse: "${input.text || ''}"` }
      ]
    }
  }

  try {
    const response = await ai.models.generateContent({
      model: modelId,
      contents: contents,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            description: { type: Type.STRING },
            cuisine: { type: Type.STRING },
            servings_default: { type: Type.NUMBER },
            instructions: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            },
            ingredients: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  item_name: { type: Type.STRING },
                  quantity: { type: Type.NUMBER },
                  unit: { type: Type.STRING },
                  category: { type: Type.STRING, description: "One of: Produce, Dairy, Meat, Pantry, Bakery, Frozen, Other" }
                },
                required: ["item_name", "quantity", "unit", "category"]
              }
            }
          },
          required: ["title", "description", "cuisine", "instructions", "ingredients", "servings_default"]
        }
      }
    });

    const jsonText = response.text;
    if (!jsonText) throw new Error("No response from AI");

    return JSON.parse(jsonText) as Omit<Recipe, 'id' | 'images' | 'version'>;

  } catch (error) {
    console.error("Gemini AI Recipe Parse Error:", error);
    throw error;
  }
};

export const generateRecipeImage = async (title: string, description: string): Promise<string | null> => {
  const modelId = "gemini-2.5-flash-image";
  const prompt = `Professional food photography of ${title}. ${description}. High resolution, appetizing, studio lighting, 4k.`;

  try {
    const response = await ai.models.generateContent({
      model: modelId,
      contents: {
        parts: [{ text: prompt }]
      },
      config: {
        imageConfig: {
            aspectRatio: "16:9"
        }
      }
    });

    if (response.candidates?.[0]?.content?.parts) {
        for (const part of response.candidates[0].content.parts) {
            if (part.inlineData && part.inlineData.mimeType && part.inlineData.data) {
                 return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
            }
        }
    }
    return null;

  } catch (error) {
    console.error("Gemini AI Image Gen Error:", error);
    throw error;
  }
};

export const estimateNutrition = async (ingredients: Ingredient[]): Promise<Nutrition> => {
  const modelId = "gemini-2.5-flash";
  const ingredientsList = ingredients.map(i => `${i.quantity} ${i.unit} ${i.item_name}`).join(', ');
  
  const prompt = `
    Based on the following ingredients, estimate the nutritional values per 100g of the prepared dish.
    Ingredients: ${ingredientsList}.
    
    Return the values as raw numbers (no units).
  `;

  try {
    const response = await ai.models.generateContent({
      model: modelId,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            calories: { type: Type.NUMBER, description: "Energy in kcal per 100g" },
            protein: { type: Type.NUMBER, description: "Protein in grams per 100g" },
            carbs: { type: Type.NUMBER, description: "Total carbohydrates in grams per 100g" },
            sugar: { type: Type.NUMBER, description: "Sugars in grams per 100g" },
            fat: { type: Type.NUMBER, description: "Total fat in grams per 100g" },
            saturated_fat: { type: Type.NUMBER, description: "Saturated fat in grams per 100g" },
            unsaturated_fat: { type: Type.NUMBER, description: "Unsaturated fat in grams per 100g" },
            fiber: { type: Type.NUMBER, description: "Fiber in grams per 100g" },
            salt: { type: Type.NUMBER, description: "Salt in grams per 100g" },
          },
          required: ["calories", "protein", "carbs", "sugar", "fat", "saturated_fat", "unsaturated_fat", "fiber", "salt"]
        }
      }
    });

    const jsonText = response.text;
    if (!jsonText) throw new Error("No response from AI for nutrition");
    return JSON.parse(jsonText) as Nutrition;

  } catch (error) {
    console.error("Gemini AI Nutrition Estimation Error:", error);
    throw error;
  }
};

export const simulateMealPlan = async (days: number, dietContext: string): Promise<any> => {
    // Example of a simulation tool for the "Brain" aspect
    const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `Suggest ${days} dinner meals for a family. Context: ${dietContext}. Return just a list of dish names.`,
    });
    return response.text;
};

export const summarizeFeedback = async (title: string, comments: string[]): Promise<string> => {
    if (!comments || comments.length === 0) return "";
    
    const modelId = "gemini-2.5-flash";
    const prompt = `
        Summarize the following feedback comments for the recipe "${title}". 
        Identify common themes (pros/cons) and suggestions.
        Keep it concise (max 3 sentences).
        
        Comments:
        ${comments.map(c => `- "${c}"`).join('\n')}
    `;

    try {
        const response = await ai.models.generateContent({
            model: modelId,
            contents: prompt
        });
        return response.text || "Could not summarize comments.";
    } catch (error) {
        console.error("Gemini AI Feedback Summary Error:", error);
        return "Failed to generate summary.";
    }
};

export const refineInstructions = async (title: string, ingredients: string[], currentInstructions: string[], modification: 'detailed' | 'simple'): Promise<string[]> => {
  const modelId = "gemini-2.5-flash";
  const ingredientsList = ingredients.join(', ');
  
  const prompt = `
    Rewrite the following cooking instructions for "${title}" to be ${modification === 'detailed' ? 'more detailed, explaining techniques clearly for beginners' : 'concise, short and simplified'}.
    
    CRITICAL CONSTRAINT: You must ONLY use the ingredients listed below. Do NOT add steps that require extra ingredients (like oil, butter, water, salt, spices) unless they are explicitly in the ingredient list provided.
    
    Allowed Ingredients:
    ${ingredientsList}

    Current Instructions:
    ${currentInstructions.map((s, i) => `${i + 1}. ${s}`).join('\n')}
    
    Keep the same logical flow.
  `;

  try {
    const response = await ai.models.generateContent({
      model: modelId,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: { type: Type.STRING }
        }
      }
    });

    const jsonText = response.text;
    if (!jsonText) throw new Error("No response");
    return JSON.parse(jsonText) as string[];

  } catch (error) {
    console.error("Gemini AI Instruction Refine Error:", error);
    throw error;
  }
};

export const suggestNewDishes = async (favorites: string[]): Promise<string[]> => {
    const modelId = "gemini-2.5-flash";
    
    let context = "";
    if (favorites.length > 0) {
        context = `My favorite dishes are: ${favorites.join(', ')}.`;
    } else {
        context = `I want to cook healthy, family-friendly dinners.`;
    }

    const prompt = `
      ${context}
      Suggest 5 new, distinct dinner dishes I might like based on these preferences.
      Do NOT suggest the exact same dishes I listed.
      Return ONLY a JSON array of strings, e.g. ["Dish Name 1", "Dish Name 2"].
    `;

    try {
        const response = await ai.models.generateContent({
            model: modelId,
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING }
                }
            }
        });
        
        const jsonText = response.text;
        if (!jsonText) throw new Error("No response");
        return JSON.parse(jsonText) as string[];
    } catch (error) {
        console.error("Gemini AI Suggestion Error:", error);
        return [];
    }
};

export interface ImprovementSuggestion {
    motivation: string;
    changes: {
        title_suffix?: string;
        ingredients: Ingredient[];
        instructions: string[];
    }
}

export const suggestRecipeImprovement = async (recipe: Recipe, householdContext: string): Promise<ImprovementSuggestion | null> => {
    const modelId = "gemini-2.5-flash";
    
    const ingredientsList = recipe.ingredients.map(i => `${i.quantity} ${i.unit} ${i.item_name} (${i.category})`).join(', ');
    const instructionsList = recipe.instructions.map((s, i) => `${i + 1}. ${s}`).join('\n');
    
    const prompt = `
        Analyze the recipe "${recipe.title}".
        Household Context: ${householdContext} (e.g. number of kids, adults).
        
        Suggest ONE significant improvement or variation to this recipe that fits the household context perfectly (e.g. make it healthier for kids, add more hidden veggies, make it quicker for busy parents, etc.).
        
        The suggestion MUST include a motivation explaining WHY this change is good for them.
        Return the FULL updated list of ingredients and instructions.
    `;

    try {
        const response = await ai.models.generateContent({
            model: modelId,
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        motivation: { type: Type.STRING },
                        changes: {
                            type: Type.OBJECT,
                            properties: {
                                title_suffix: { type: Type.STRING, description: "Short suffix to append to title, e.g. '(Kid Friendly)'" },
                                ingredients: {
                                    type: Type.ARRAY,
                                    items: {
                                        type: Type.OBJECT,
                                        properties: {
                                            item_name: { type: Type.STRING },
                                            quantity: { type: Type.NUMBER },
                                            unit: { type: Type.STRING },
                                            category: { type: Type.STRING }
                                        },
                                        required: ["item_name", "quantity", "unit", "category"]
                                    }
                                },
                                instructions: {
                                    type: Type.ARRAY,
                                    items: { type: Type.STRING }
                                }
                            },
                            required: ["ingredients", "instructions"]
                        }
                    },
                    required: ["motivation", "changes"]
                }
            }
        });

        const jsonText = response.text;
        if (!jsonText) throw new Error("No response");
        return JSON.parse(jsonText) as ImprovementSuggestion;
    } catch (error) {
        console.error("Gemini AI Improvement Error:", error);
        return null;
    }
}