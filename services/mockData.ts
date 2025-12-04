import { Recipe, MealPlanItem, ShoppingItem, AppSettings, Language, MealType, Ingredient, SHOPPING_CATEGORIES } from '../types';

export const INITIAL_SETTINGS: AppSettings = {
  language: 'en',
  default_adults: 2,
  default_kids: 1,
  pantry_staples: ["Salt", "Pepper", "Olive Oil", "Water", "Sugar", "Flour", "Oil", "Butter"],
  custom_staples: {},
  stores: [
      {
          id: 1,
          name: "Default Store",
          category_order: [...SHOPPING_CATEGORIES]
      }
  ],
  ai_provider: 'gemini',
  openai_api_key: '',
  custom_languages: {}
};

export const MOCK_RECIPES: Recipe[] = [
  {
    id: 1,
    title: "Swedish Meatballs (Köttbullar)",
    description: "Classic meatballs with mashed potatoes, cream sauce, and lingonberries.",
    cuisine: "Swedish",
    images: ["https://picsum.photos/400/300?random=1"],
    servings_default: 4,
    version: 1,
    history: [],
    lang: 'en',
    translations: {},
    instructions: [
      "Mix mince, onion, egg, and breadcrumbs.",
      "Roll into balls and fry in butter.",
      "Make sauce with cream and beef stock.",
      "Serve with potatoes and jam."
    ],
    ingredients: [
      { item_name: "Ground Beef/Pork Mix", quantity: 500, unit: "g", category: "Meat" },
      { item_name: "Cream", quantity: 2, unit: "dl", category: "Dairy" },
      { item_name: "Potatoes", quantity: 800, unit: "g", category: "Produce" },
      { item_name: "Lingonberry Jam", quantity: 100, unit: "g", category: "Pantry" },
      { item_name: "Salt", quantity: 1, unit: "tsp", category: "Pantry" },
      { item_name: "Butter", quantity: 50, unit: "g", category: "Dairy" }
    ],
    rating: 5
  },
  {
    id: 2,
    title: "Oven Baked Salmon",
    description: "Simple salmon fillet with lemon and dill sauce.",
    cuisine: "Nordic",
    images: ["https://picsum.photos/400/300?random=2"],
    servings_default: 4,
    version: 1,
    history: [],
    lang: 'en',
    translations: {},
    instructions: [
      "Preheat oven to 200°C.",
      "Place salmon in dish, season with lemon and dill.",
      "Bake for 20 minutes.",
      "Mix yogurt with dill for sauce."
    ],
    ingredients: [
      { item_name: "Salmon Fillet", quantity: 600, unit: "g", category: "Meat" },
      { item_name: "Lemon", quantity: 1, unit: "pc", category: "Produce" },
      { item_name: "Dill", quantity: 1, unit: "bunch", category: "Produce" },
      { item_name: "Greek Yogurt", quantity: 2, unit: "dl", category: "Dairy" },
      { item_name: "Salt for seasoning", quantity: 1, unit: "pinch", category: "Pantry" } 
    ],
    rating: 4
  },
  {
    id: 3,
    title: "Vegetarian Tacos",
    description: "Lentil based tacos with fresh salsa.",
    cuisine: "Tex-Mex",
    images: ["https://picsum.photos/400/300?random=3"],
    servings_default: 4,
    version: 1,
    history: [],
    lang: 'en',
    translations: {},
    instructions: [
      "Cook lentils with taco spice.",
      "Chop vegetables.",
      "Heat tortillas.",
      "Assemble and enjoy."
    ],
    ingredients: [
      { item_name: "Red Lentils", quantity: 3, unit: "dl", category: "Pantry" },
      { item_name: "Taco Spice Mix", quantity: 1, unit: "pkt", category: "Pantry" },
      { item_name: "Tortillas", quantity: 8, unit: "pc", category: "Bakery" },
      { item_name: "Cucumber", quantity: 1, unit: "pc", category: "Produce" },
      { item_name: "Tomatoes", quantity: 2, unit: "pc", category: "Produce" }
    ]
  }
];

export const generateInitialPlan = (recipes: Recipe[]): MealPlanItem[] => {
    const today = new Date();
    const plan: MealPlanItem[] = [];
    
    // Generate plan for next 7 days
    for (let i = 0; i < 7; i++) {
        const date = new Date(today);
        date.setDate(today.getDate() + i);
        const dateStr = date.toISOString().split('T')[0];
        
        // Simple round-robin assignment
        const recipe = recipes[i % recipes.length];
        
        plan.push({
            id: Date.now() + i,
            date: dateStr,
            type: MealType.DINNER,
            recipe_id: recipe.id,
            recipe_version: recipe.version || 1,
            is_leftover: false,
            is_cooked: false,
            servings: recipe.servings_default // Initialize with recipe default
        });
    }
    return plan;
};

// Merges existing manual items with newly calculated plan items
export const mergeShoppingList = (
    currentList: ShoppingItem[], 
    plan: MealPlanItem[], 
    recipes: Recipe[], 
    pantryStaples: string[]
): ShoppingItem[] => {
    
    // 1. Keep manual items
    const manualItems = currentList.filter(item => item.is_manually_added);
    
    // 2. Map existing checked status AND IDs for persistence
    const statusMap = new Map<string, boolean>();
    const idMap = new Map<string, number>();

    currentList.forEach(item => {
        const key = `${item.item_name.toLowerCase()}-${item.unit.toLowerCase()}`;
        statusMap.set(key, item.checked);
        if (!item.is_manually_added) {
            idMap.set(key, item.id);
        }
    });

    // 3. Generate new recipe items
    const generatedMap = new Map<string, ShoppingItem>();

    plan.forEach(meal => {
        const recipe = recipes.find(r => r.id === meal.recipe_id);
        if (!recipe) return;
        
        // Use the version from history if available, otherwise current
        // Note: For shopping list, we technically should check meal.recipe_version vs recipe.version.
        // If meal uses an old version, we should try to find it in history.
        let targetRecipe = recipe;
        if (meal.recipe_version && meal.recipe_version !== recipe.version) {
             const historical = recipe.history?.find(h => h.version === meal.recipe_version);
             if (historical) targetRecipe = historical;
        }

        const servings = meal.servings || targetRecipe.servings_default;
        const scale = servings / targetRecipe.servings_default;
        
        targetRecipe.ingredients.forEach(ing => {
            // Check staple
            const isStaple = pantryStaples.some(staple => {
                try {
                    const escaped = staple.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    return new RegExp(`\\b${escaped}\\b`, 'i').test(ing.item_name);
                } catch { return false; }
            });

            if (isStaple) return;

            const key = `${ing.item_name.toLowerCase()}-${ing.unit.toLowerCase()}`;
            const quantity = ing.quantity * scale;

            if (generatedMap.has(key)) {
                const existing = generatedMap.get(key)!;
                existing.quantity += quantity;
            } else {
                // Restore checked status if it existed before
                const isChecked = statusMap.get(key) || false;
                const existingId = idMap.get(key);
                
                generatedMap.set(key, {
                    ...ing,
                    quantity: quantity,
                    id: existingId || (Date.now() + Math.random()), // Preserve ID if exists
                    checked: isChecked,
                    is_manually_added: false,
                    lang: targetRecipe.lang, // Inherit language
                    translations: targetRecipe.translations ? {} : undefined // Init empty translations for item
                });
            }
        });
    });

    // 4. Combine
    // Note: Manual items are simple appended. If a manual item duplicates a recipe item, 
    // they stay separate in this logic to avoid overwriting user intent (e.g. "Extra Milk").
    return [...manualItems, ...Array.from(generatedMap.values())];
};

// Legacy support (alias)
export const generateShoppingListFromPlan = (plan: MealPlanItem[], recipes: Recipe[], pantryStaples: string[]) => 
    mergeShoppingList([], plan, recipes, pantryStaples);
