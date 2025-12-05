import { Recipe, MealPlanItem, ShoppingItem, AppSettings, Language, MealType, Ingredient, SHOPPING_CATEGORIES } from '../types';

export const INITIAL_SETTINGS: AppSettings = {
  language: 'en',
  default_adults: 2,
  default_kids: 1,
  week_start_day: 1, // Monday
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
    ],
    rating: 4.5
  },
  {
    id: 4,
    title: "Spaghetti Carbonara",
    description: "Roman pasta dish with eggs, cheese, bacon, and black pepper.",
    cuisine: "Italian",
    images: ["https://picsum.photos/400/300?random=4"],
    servings_default: 4,
    version: 1,
    history: [],
    lang: 'en',
    translations: {},
    instructions: [
      "Boil pasta in salted water.",
      "Fry bacon until crisp.",
      "Whisk eggs and parmesan together.",
      "Toss pasta with bacon, remove from heat, and mix in egg mixture quickly."
    ],
    ingredients: [
      { item_name: "Spaghetti", quantity: 400, unit: "g", category: "Pantry" },
      { item_name: "Bacon", quantity: 150, unit: "g", category: "Meat" },
      { item_name: "Eggs", quantity: 4, unit: "pc", category: "Dairy" },
      { item_name: "Parmesan Cheese", quantity: 100, unit: "g", category: "Dairy" },
      { item_name: "Black Pepper", quantity: 1, unit: "tbsp", category: "Spices" }
    ],
    rating: 5
  },
  {
    id: 5,
    title: "Chicken Tikka Masala",
    description: "Roasted marinated chicken chunks in spiced curry sauce.",
    cuisine: "Indian",
    images: ["https://picsum.photos/400/300?random=5"],
    servings_default: 4,
    version: 1,
    history: [],
    lang: 'en',
    translations: {},
    instructions: [
      "Marinate chicken in yogurt and spices.",
      "Grill chicken pieces.",
      "Simmer tomato sauce with cream and spices.",
      "Combine chicken with sauce and serve with rice."
    ],
    ingredients: [
      { item_name: "Chicken Breast", quantity: 600, unit: "g", category: "Meat" },
      { item_name: "Yogurt", quantity: 2, unit: "dl", category: "Dairy" },
      { item_name: "Tomato Puree", quantity: 400, unit: "g", category: "Canned" },
      { item_name: "Heavy Cream", quantity: 2, unit: "dl", category: "Dairy" },
      { item_name: "Basmati Rice", quantity: 4, unit: "port", category: "Pantry" }
    ],
    rating: 4
  },
  {
    id: 6,
    title: "Classic Pancakes",
    description: "Fluffy pancakes served with syrup and berries.",
    cuisine: "American",
    images: ["https://picsum.photos/400/300?random=6"],
    servings_default: 4,
    version: 1,
    history: [],
    lang: 'en',
    translations: {},
    instructions: [
      "Mix flour, baking powder, salt and sugar.",
      "Whisk in milk, egg and melted butter.",
      "Fry ladles of batter in a pan.",
      "Serve hot."
    ],
    ingredients: [
      { item_name: "Flour", quantity: 3, unit: "dl", category: "Pantry" },
      { item_name: "Milk", quantity: 3, unit: "dl", category: "Dairy" },
      { item_name: "Egg", quantity: 1, unit: "pc", category: "Dairy" },
      { item_name: "Butter", quantity: 50, unit: "g", category: "Dairy" },
      { item_name: "Maple Syrup", quantity: 1, unit: "btl", category: "Pantry" }
    ],
    rating: 4
  },
  {
    id: 7,
    title: "Caesar Salad",
    description: "Green salad with croutons and parmesan cheese.",
    cuisine: "American",
    images: ["https://picsum.photos/400/300?random=7"],
    servings_default: 2,
    version: 1,
    history: [],
    lang: 'en',
    translations: {},
    instructions: [
      "Chop romaine lettuce.",
      "Fry bread cubes for croutons.",
      "Grill chicken breast slices.",
      "Toss with dressing and cheese."
    ],
    ingredients: [
      { item_name: "Romaine Lettuce", quantity: 1, unit: "head", category: "Produce" },
      { item_name: "Chicken Breast", quantity: 300, unit: "g", category: "Meat" },
      { item_name: "Parmesan", quantity: 50, unit: "g", category: "Dairy" },
      { item_name: "Bread", quantity: 2, unit: "slices", category: "Bakery" },
      { item_name: "Caesar Dressing", quantity: 1, unit: "btl", category: "Pantry" }
    ],
    rating: 3
  },
  {
    id: 8,
    title: "Beef Stir-Fry",
    description: "Quick beef strips with vegetables and soy sauce.",
    cuisine: "Asian",
    images: ["https://picsum.photos/400/300?random=8"],
    servings_default: 4,
    version: 1,
    history: [],
    lang: 'en',
    translations: {},
    instructions: [
      "Slice beef thinly.",
      "Stir-fry beef in hot oil.",
      "Add vegetables and cook until tender-crisp.",
      "Add soy sauce and serve with noodles."
    ],
    ingredients: [
      { item_name: "Beef Steak", quantity: 500, unit: "g", category: "Meat" },
      { item_name: "Broccoli", quantity: 1, unit: "head", category: "Produce" },
      { item_name: "Bell Pepper", quantity: 2, unit: "pc", category: "Produce" },
      { item_name: "Soy Sauce", quantity: 3, unit: "tbsp", category: "Pantry" },
      { item_name: "Egg Noodles", quantity: 300, unit: "g", category: "Pantry" }
    ],
    rating: 4.5
  },
  {
    id: 9,
    title: "Mushroom Risotto",
    description: "Creamy Italian rice dish with mushrooms.",
    cuisine: "Italian",
    images: ["https://picsum.photos/400/300?random=9"],
    servings_default: 4,
    version: 1,
    history: [],
    lang: 'en',
    translations: {},
    instructions: [
      "Sauté onions and mushrooms.",
      "Add arborio rice and toast slightly.",
      "Add stock ladle by ladle, stirring constantly.",
      "Finish with butter and parmesan."
    ],
    ingredients: [
      { item_name: "Arborio Rice", quantity: 400, unit: "g", category: "Pantry" },
      { item_name: "Mushrooms", quantity: 300, unit: "g", category: "Produce" },
      { item_name: "Vegetable Stock", quantity: 1, unit: "l", category: "Pantry" },
      { item_name: "White Wine", quantity: 1, unit: "dl", category: "Beverages" },
      { item_name: "Parmesan", quantity: 100, unit: "g", category: "Dairy" }
    ],
    rating: 5
  },
  {
    id: 10,
    title: "Fish and Chips",
    description: "Battered fish with deep fried chips.",
    cuisine: "British",
    images: ["https://picsum.photos/400/300?random=10"],
    servings_default: 4,
    version: 1,
    history: [],
    lang: 'en',
    translations: {},
    instructions: [
      "Cut potatoes into chips and fry.",
      "Make batter with flour and beer.",
      "Dip fish in batter and fry until golden.",
      "Serve with tartar sauce."
    ],
    ingredients: [
      { item_name: "White Fish Fillets", quantity: 600, unit: "g", category: "Meat" },
      { item_name: "Potatoes", quantity: 1, unit: "kg", category: "Produce" },
      { item_name: "Flour", quantity: 2, unit: "dl", category: "Pantry" },
      { item_name: "Beer", quantity: 1, unit: "can", category: "Beverages" },
      { item_name: "Oil for frying", quantity: 1, unit: "l", category: "Pantry" }
    ],
    rating: 4
  },
  {
    id: 11,
    title: "Chili Con Carne",
    description: "Spicy stew with chili peppers, meat, and kidney beans.",
    cuisine: "Tex-Mex",
    images: ["https://picsum.photos/400/300?random=11"],
    servings_default: 6,
    version: 1,
    history: [],
    lang: 'en',
    translations: {},
    instructions: [
      "Brown the ground beef with onions.",
      "Add tomatoes, beans, and spices.",
      "Simmer for at least 30 minutes.",
      "Serve with rice or bread."
    ],
    ingredients: [
      { item_name: "Ground Beef", quantity: 500, unit: "g", category: "Meat" },
      { item_name: "Kidney Beans", quantity: 1, unit: "can", category: "Canned" },
      { item_name: "Crushed Tomatoes", quantity: 2, unit: "can", category: "Canned" },
      { item_name: "Chili Powder", quantity: 2, unit: "tbsp", category: "Spices" },
      { item_name: "Onion", quantity: 2, unit: "pc", category: "Produce" }
    ],
    rating: 4.5
  },
  {
    id: 12,
    title: "Tomato Soup & Grilled Cheese",
    description: "Comfort food classic.",
    cuisine: "American",
    images: ["https://picsum.photos/400/300?random=12"],
    servings_default: 2,
    version: 1,
    history: [],
    lang: 'en',
    translations: {},
    instructions: [
      "Simmer tomatoes with broth and cream.",
      "Blend until smooth.",
      "Butter bread and fill with cheese.",
      "Grill sandwiches until melted."
    ],
    ingredients: [
      { item_name: "Canned Tomatoes", quantity: 2, unit: "can", category: "Canned" },
      { item_name: "Vegetable Broth", quantity: 5, unit: "dl", category: "Pantry" },
      { item_name: "Bread", quantity: 4, unit: "slices", category: "Bakery" },
      { item_name: "Cheddar Cheese", quantity: 100, unit: "g", category: "Dairy" },
      { item_name: "Butter", quantity: 2, unit: "tbsp", category: "Dairy" }
    ],
    rating: 4
  },
  {
    id: 13,
    title: "Greek Salad",
    description: "Fresh salad with feta, olives, and oregano.",
    cuisine: "Greek",
    images: ["https://picsum.photos/400/300?random=13"],
    servings_default: 2,
    version: 1,
    history: [],
    lang: 'en',
    translations: {},
    instructions: [
      "Chop cucumber, tomatoes, and onion.",
      "Add olives and block of feta.",
      "Drizzle with olive oil and oregano.",
      "Serve with bread."
    ],
    ingredients: [
      { item_name: "Cucumber", quantity: 1, unit: "pc", category: "Produce" },
      { item_name: "Tomatoes", quantity: 3, unit: "pc", category: "Produce" },
      { item_name: "Red Onion", quantity: 1, unit: "pc", category: "Produce" },
      { item_name: "Feta Cheese", quantity: 150, unit: "g", category: "Dairy" },
      { item_name: "Kalamata Olives", quantity: 1, unit: "jar", category: "Pantry" }
    ],
    rating: 5
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

        // Add translation keys too to ensure we can match even if language differs
        if (item.translations) {
            Object.values(item.translations).forEach((tr: any) => {
                 const trKey = `${tr.item_name.toLowerCase()}-${tr.unit.toLowerCase()}`;
                 // Point to the ORIGINAL item's status/ID
                 if (!statusMap.has(trKey)) statusMap.set(trKey, item.checked);
                 if (!idMap.has(trKey)) idMap.set(trKey, item.id);
            });
        }
    });

    // 3. Generate new recipe items
    const generatedMap = new Map<string, ShoppingItem>();

    plan.forEach(meal => {
        const recipe = recipes.find(r => r.id === meal.recipe_id);
        if (!recipe) return;
        
        // Use the version from history if available, otherwise current
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
                // Note: If we found an ID via translation mapping, we use that ID.
                // This means 'Tomato' will reuse the ID of 'Tomat' if they are linked via translations.
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
    return [...manualItems, ...Array.from(generatedMap.values())];
};

// Legacy support (alias)
export const generateShoppingListFromPlan = (plan: MealPlanItem[], recipes: Recipe[], pantryStaples: string[]) => 
    mergeShoppingList([], plan, recipes, pantryStaples);