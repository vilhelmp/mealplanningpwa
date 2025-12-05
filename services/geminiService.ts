import { GoogleGenAI, Type } from "@google/genai";
import { Recipe, Nutrition, Ingredient, ShoppingItem } from '../types';
import { storage } from './storage';

interface ParseInput {
  text?: string;
  fileData?: string; // base64
  mimeType?: string;
}

// Helper: Call OpenAI Chat Completion
const callOpenAI = async (
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  jsonMode: boolean = false,
  imageInput?: { data: string, mimeType: string }
): Promise<string> => {
  const messages: any[] = [
    { role: "system", content: systemPrompt }
  ];

  const userContent: any[] = [{ type: "text", text: userPrompt }];

  if (imageInput) {
    userContent.push({
      type: "image_url",
      image_url: {
        url: `data:${imageInput.mimeType};base64,${imageInput.data}`
      }
    });
  }

  messages.push({ role: "user", content: userContent });

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: messages,
        response_format: jsonMode ? { type: "json_object" } : undefined,
        temperature: 0.7
      })
    });

    if (!response.ok) {
        const err = await response.json();
        throw new Error(`OpenAI Error: ${err.error?.message || response.statusText}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  } catch (error) {
    console.error("OpenAI API Call Error:", error);
    throw error;
  }
};

// Helper: Call OpenAI Image Generation (DALL-E 3)
const callOpenAIImage = async (apiKey: string, prompt: string): Promise<string | null> => {
    try {
        const response = await fetch("https://api.openai.com/v1/images/generations", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: "dall-e-3",
                prompt: prompt,
                n: 1,
                size: "1024x1024",
                response_format: "b64_json"
            })
        });

        if (!response.ok) throw new Error("OpenAI Image Gen failed");
        
        const data = await response.json();
        if (data.data && data.data.length > 0) {
            return `data:image/png;base64,${data.data[0].b64_json}`;
        }
        return null;
    } catch (error) {
        console.error("OpenAI Image Error:", error);
        return null;
    }
};


export const parseRecipeWithAI = async (input: ParseInput): Promise<Omit<Recipe, 'id' | 'images' | 'version'>> => {
  const settings = await storage.getSettings();
  const provider = settings.ai_provider || 'gemini';

  const promptText = `
    Extract a structured recipe from the provided content (text or document). 
    If the content is just a name of a dish, generate a plausible recipe for it.
    Use Metric units (kg, g, dl, tbsp, tsp) where possible.
    Infer the cuisine type (e.g., Italian, French, Asian, Mexican, Nordic, etc.).
  `;

  if (provider === 'openai' && settings.openai_api_key) {
      const systemPrompt = `You are a structured data extractor. You must extract recipe data and output valid JSON matching this schema:
      {
        "title": "string",
        "description": "string",
        "cuisine": "string",
        "servings_default": "number",
        "instructions": ["string"],
        "ingredients": [
            { "item_name": "string", "quantity": "number", "unit": "string", "category": "string (Produce, Dairy, Meat, Pantry, Bakery, Frozen, Other)" }
        ]
      }`;
      
      const res = await callOpenAI(
          settings.openai_api_key, 
          systemPrompt, 
          input.text || promptText, 
          true,
          (input.fileData && input.mimeType) ? { data: input.fileData, mimeType: input.mimeType } : undefined
      );
      return JSON.parse(res) as Omit<Recipe, 'id' | 'images' | 'version'>;
  }

  // Fallback to Gemini
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const modelId = "gemini-2.5-flash";

  let contents;
  if (input.fileData && input.mimeType) {
    contents = {
      parts: [
        { inlineData: { mimeType: input.mimeType, data: input.fileData } },
        { text: input.text ? `${promptText}\n\nAdditional context: "${input.text}"` : promptText }
      ]
    };
  } else {
    contents = { parts: [{ text: `${promptText}\n\nText to parse: "${input.text || ''}"` }] }
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
            instructions: { type: Type.ARRAY, items: { type: Type.STRING } },
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
  const settings = await storage.getSettings();
  const provider = settings.ai_provider || 'gemini';
  const prompt = `Professional food photography of ${title}. ${description}. High resolution, appetizing, studio lighting, 4k.`;

  if (provider === 'openai' && settings.openai_api_key) {
      return await callOpenAIImage(settings.openai_api_key, prompt);
  }

  // Fallback to Gemini
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-image",
      contents: { parts: [{ text: prompt }] },
      config: { imageConfig: { aspectRatio: "16:9" } }
    });

    if (response.candidates?.[0]?.content?.parts) {
        for (const part of response.candidates[0].content.parts) {
            if (part.inlineData?.mimeType && part.inlineData?.data) {
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
  const settings = await storage.getSettings();
  const provider = settings.ai_provider || 'gemini';
  const ingredientsList = ingredients.map(i => `${i.quantity} ${i.unit} ${i.item_name}`).join(', ');
  
  const prompt = `
    Based on the following ingredients list for a recipe: ${ingredientsList}.
    Estimate the nutritional values PER 100g of the final cooked dish.
    
    IMPORTANT CONSTRAINTS:
    1. The 'fat' value MUST be approximately equal to the sum of 'saturated_fat' and 'unsaturated_fat'.
    2. If 'Salt', 'Sodium' or similar is listed in the ingredients, the 'salt' field MUST NOT be 0. Estimate it based on the quantity (e.g. 1 tsp salt is approx 6g salt).
    3. Return raw numbers only (no units).
  `;

  if (provider === 'openai' && settings.openai_api_key) {
      const systemPrompt = `Return JSON only: { "calories": number, "protein": number, "carbs": number, "sugar": number, "fat": number, "saturated_fat": number, "unsaturated_fat": number, "fiber": number, "salt": number }`;
      const res = await callOpenAI(settings.openai_api_key, systemPrompt, prompt, true);
      return JSON.parse(res) as Nutrition;
  }

  // Fallback to Gemini
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            calories: { type: Type.NUMBER },
            protein: { type: Type.NUMBER },
            carbs: { type: Type.NUMBER },
            sugar: { type: Type.NUMBER },
            fat: { type: Type.NUMBER },
            saturated_fat: { type: Type.NUMBER },
            unsaturated_fat: { type: Type.NUMBER },
            fiber: { type: Type.NUMBER },
            salt: { type: Type.NUMBER },
          },
          required: ["calories", "protein", "carbs", "sugar", "fat", "saturated_fat", "unsaturated_fat", "fiber", "salt"]
        }
      }
    });
    const jsonText = response.text;
    if (!jsonText) throw new Error("No response");
    return JSON.parse(jsonText) as Nutrition;
  } catch (error) {
    console.error("Nutrition Error:", error);
    throw error;
  }
};

export const summarizeFeedback = async (title: string, comments: string[]): Promise<string> => {
    if (!comments || comments.length === 0) return "";
    const settings = await storage.getSettings();
    const provider = settings.ai_provider || 'gemini';
    
    const prompt = `Summarize comments for recipe "${title}". Identify pros/cons. Max 3 sentences. Comments: ${comments.map(c => `- "${c}"`).join('\n')}`;

    if (provider === 'openai' && settings.openai_api_key) {
        return await callOpenAI(settings.openai_api_key, "You are a helpful assistant.", prompt, false);
    }

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt
        });
        return response.text || "Could not summarize.";
    } catch (error) {
        return "Failed to summarize.";
    }
};

export const refineInstructions = async (title: string, ingredients: string[], currentInstructions: string[], modification: 'detailed' | 'simple'): Promise<string[]> => {
  const settings = await storage.getSettings();
  const provider = settings.ai_provider || 'gemini';
  const ingredientsList = ingredients.join(', ');
  
  const prompt = `
    Rewrite cooking instructions for "${title}" to be ${modification}.
    Constraint: Use ONLY these ingredients: ${ingredientsList}.
    Current: ${currentInstructions.join('\n')}
    Return a JSON array of strings.
  `;

  if (provider === 'openai' && settings.openai_api_key) {
       const systemPrompt = `Return a JSON object with a key "instructions" containing an array of strings. Example: { "instructions": ["Step 1", "Step 2"] }`;
       const res = await callOpenAI(settings.openai_api_key, systemPrompt, prompt, true);
       const parsed = JSON.parse(res);
       return Array.isArray(parsed) ? parsed : (parsed.instructions || []);
  }

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
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
    console.error("Refine Error:", error);
    throw error;
  }
};

export const suggestNewDishes = async (favorites: string[]): Promise<string[]> => {
    const settings = await storage.getSettings();
    const provider = settings.ai_provider || 'gemini';
    const context = favorites.length > 0 ? `Favorites: ${favorites.join(', ')}` : `Healthy family dinners.`;
    const prompt = `${context}. Suggest 5 new dinner dishes. Return JSON array of strings.`;

    if (provider === 'openai' && settings.openai_api_key) {
        const systemPrompt = `Return JSON: { "suggestions": ["Dish 1", "Dish 2"] }`;
        const res = await callOpenAI(settings.openai_api_key, systemPrompt, prompt, true);
        const parsed = JSON.parse(res);
        return Array.isArray(parsed) ? parsed : (parsed.suggestions || []);
    }

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
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
        console.error("Suggestion Error:", error);
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
    const settings = await storage.getSettings();
    const provider = settings.ai_provider || 'gemini';
    
    const prompt = `
        Analyze recipe "${recipe.title}". Context: ${householdContext}.
        Suggest ONE improvement. Return JSON with motivation and full updated ingredients/instructions.
        Schema: { motivation: string, changes: { title_suffix: string, ingredients: [ {item_name, quantity, unit, category} ], instructions: [string] } }
        Current ingredients: ${recipe.ingredients.map(i => i.item_name).join(', ')}.
    `;

    if (provider === 'openai' && settings.openai_api_key) {
        const systemPrompt = `You are a creative chef. Output valid JSON matching the schema provided in the prompt.`;
        const res = await callOpenAI(settings.openai_api_key, systemPrompt, prompt, true);
        return JSON.parse(res) as ImprovementSuggestion;
    }

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
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
                                title_suffix: { type: Type.STRING },
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
                                instructions: { type: Type.ARRAY, items: { type: Type.STRING } }
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
        console.error("Improvement Error:", error);
        return null;
    }
}

// --- Translation Services ---

export const translateRecipe = async (recipe: Recipe, targetLang: string): Promise<Recipe> => {
    const settings = await storage.getSettings();
    const provider = settings.ai_provider || 'gemini';
    
    const prompt = `
      Translate this recipe content to the language code: "${targetLang}".
      IMPORTANT:
      1. Translate 'title', 'description', 'cuisine', 'instructions'.
      2. Translate ingredient 'item_name' and 'unit'.
      3. DO NOT translate 'category' (keep it exactly as is: Produce, Dairy, Meat, etc).
      4. Keep numbers and structure identical.
      
      Recipe JSON: ${JSON.stringify({
          title: recipe.title,
          description: recipe.description,
          cuisine: recipe.cuisine,
          instructions: recipe.instructions,
          ingredients: recipe.ingredients
      })}
    `;

    // Reusing logic from above, but forcing return of partial Recipe
    if (provider === 'openai' && settings.openai_api_key) {
        const systemPrompt = `You are a translator. Return valid JSON only matching the input structure.`;
        const res = await callOpenAI(settings.openai_api_key, systemPrompt, prompt, true);
        const translated = JSON.parse(res);
        return { ...recipe, ...translated, lang: targetLang };
    }

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        title: { type: Type.STRING },
                        description: { type: Type.STRING },
                        cuisine: { type: Type.STRING },
                        instructions: { type: Type.ARRAY, items: { type: Type.STRING } },
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
                        }
                    },
                    required: ["title", "description", "instructions", "ingredients"]
                }
            }
        });
        const translated = JSON.parse(response.text || '{}');
        return { ...recipe, ...translated, lang: targetLang };
    } catch (error) {
        console.error("Translation Error:", error);
        return recipe; // Return original on fail
    }
};

export const translateShoppingItems = async (items: ShoppingItem[], targetLang: string): Promise<ShoppingItem[]> => {
    if (items.length === 0) return items;
    const settings = await storage.getSettings();
    const provider = settings.ai_provider || 'gemini';

    // Minify input to save tokens
    const simplifiedItems = items.map(i => ({ id: i.id, n: i.item_name, u: i.unit }));
    
    const prompt = `
        Translate these shopping items to language code: "${targetLang}".
        Input format: { id: number, n: name, u: unit }
        Output format: Array of { id: number, item_name: string, unit: string }
        Keep IDs matching.
        Items: ${JSON.stringify(simplifiedItems)}
    `;

    try {
        let translatedData: any[] = [];

        if (provider === 'openai' && settings.openai_api_key) {
             const systemPrompt = `Return JSON array.`;
             const res = await callOpenAI(settings.openai_api_key, systemPrompt, prompt, true);
             const parsed = JSON.parse(res);
             translatedData = Array.isArray(parsed) ? parsed : (parsed.items || []);
        } else {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            const response = await ai.models.generateContent({
                model: "gemini-2.5-flash",
                contents: prompt,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                id: { type: Type.NUMBER },
                                item_name: { type: Type.STRING },
                                unit: { type: Type.STRING }
                            },
                            required: ["id", "item_name", "unit"]
                        }
                    }
                }
            });
            translatedData = JSON.parse(response.text || '[]');
        }

        // Merge back
        return items.map(original => {
            const translated = translatedData.find((t: any) => t.id === original.id);
            if (translated) {
                return { ...original, item_name: translated.item_name, unit: translated.unit, lang: targetLang };
            }
            return original;
        });

    } catch (error) {
        console.error("Shopping List Translation Error", error);
        return items;
    }
};

export const translateStrings = async (strings: string[], targetLang: string): Promise<string[]> => {
    if (strings.length === 0) return strings;
    const settings = await storage.getSettings();
    const provider = settings.ai_provider || 'gemini';

    const prompt = `Translate these strings to language code: "${targetLang}": ${JSON.stringify(strings)}`;

    try {
        if (provider === 'openai' && settings.openai_api_key) {
             const systemPrompt = `Return JSON array of strings.`;
             const res = await callOpenAI(settings.openai_api_key, systemPrompt, prompt, true);
             const parsed = JSON.parse(res);
             return Array.isArray(parsed) ? parsed : strings;
        } else {
             const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
             const response = await ai.models.generateContent({
                model: "gemini-2.5-flash",
                contents: prompt,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING }
                    }
                }
            });
            return JSON.parse(response.text || '[]');
        }
    } catch (e) {
        return strings;
    }
}

export const generateInterfaceTranslations = async (targetLang: string, baseTranslations: any): Promise<any> => {
    const settings = await storage.getSettings();
    const provider = settings.ai_provider || 'gemini';

    // We can't send huge JSON in one go reliably if it's too big, but the current UI strings are small enough (< 2k tokens)
    const prompt = `
        Translate the following UI strings keys and values to the language with code: "${targetLang}".
        Return a single JSON object with the same keys.
        Input JSON: ${JSON.stringify(baseTranslations)}
    `;

    if (provider === 'openai' && settings.openai_api_key) {
        const systemPrompt = `Return JSON object matching input keys.`;
        const res = await callOpenAI(settings.openai_api_key, systemPrompt, prompt, true);
        return JSON.parse(res);
    }

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    // Since we don't have a rigid schema for arbitrary keys, we just ask for JSON object
    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: {
                responseMimeType: "application/json"
            }
        });
        const jsonText = response.text;
        if (!jsonText) throw new Error("No response");
        return JSON.parse(jsonText);
    } catch (e) {
        console.error("Interface Translation Error", e);
        throw e;
    }
};
