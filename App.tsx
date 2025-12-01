import React, { useState, useEffect, useCallback } from 'react';
import { ViewState, Recipe, MealPlanItem, ShoppingItem, AppSettings, Language, MealType } from './types';
import { INITIAL_SETTINGS, generateInitialPlan, mergeShoppingList } from './services/mockData';
import { storage } from './services/storage';
import { Icons } from './components/Shared';

// Views
import { PlanView } from './components/PlanView';
import { ShopView } from './components/ShopView';
import { RecipesView } from './components/RecipesView';
import { SettingsView } from './components/SettingsView';
import { StatsView } from './components/StatsView';
import { RecipeDetail } from './components/RecipeDetail';

const NAV_TRANSLATIONS = {
  [Language.EN]: {
    plan: "Plan",
    shop: "Shop",
    recipes: "Recipes",
    settings: "Settings",
    stats: "Stats",
    loading: "Loading Kitchen..."
  },
  [Language.SV]: {
    plan: "Planering",
    shop: "Handla",
    recipes: "Recept",
    settings: "Inställningar",
    stats: "Statistik",
    loading: "Laddar Köket..."
  }
};

const App = () => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [view, setView] = useState<ViewState>('plan');
  
  // Data State
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [plan, setPlan] = useState<MealPlanItem[]>([]);
  const [shoppingList, setShoppingList] = useState<ShoppingItem[]>([]);
  const [settings, setSettings] = useState<AppSettings>(INITIAL_SETTINGS);
  
  // History state for undo (Only tracks Plan for now)
  const [planHistory, setPlanHistory] = useState<MealPlanItem[][]>([]);
  
  // Context for Modal
  const [selectedContext, setSelectedContext] = useState<{ recipe: Recipe, meal?: MealPlanItem } | null>(null);

  // --- Persistence Helper ---
  // We wrap state updates with DB persistence
  
  const refreshData = useCallback(async () => {
      const [r, p, s, cfg] = await Promise.all([
          storage.getRecipes(),
          storage.getPlan(),
          storage.getShoppingList(),
          storage.getSettings()
      ]);
      setRecipes(r);
      setPlan(p);
      setShoppingList(s);
      setSettings(cfg);
  }, []);

  // Initial Load
  useEffect(() => {
    const init = async () => {
        await storage.init(); // Seeds DB if empty
        await refreshData();
        setIsLoaded(true);
    };
    init();
  }, [refreshData]);

  // --- Logic Helpers ---

  const syncShoppingList = async (currentPlan: MealPlanItem[], currentRecipes: Recipe[], currentSettings: AppSettings) => {
      // Get latest list to merge against (to keep manual items)
      const currentList = await storage.getShoppingList();
      
      // Filter Plan: Only include meals from today onwards for the shopping list
      // We keep history in the DB for stats, but we don't want to shop for last week's dinner.
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const futurePlan = currentPlan.filter(p => {
          const d = new Date(p.date);
          // Include today
          return d >= today;
      });

      const newList = mergeShoppingList(currentList, futurePlan, currentRecipes, currentSettings.pantry_staples);
      await storage.saveShoppingList(newList);
      setShoppingList(newList);
  };

  const savePlanHistory = () => {
      const snapshot = JSON.parse(JSON.stringify(plan));
      setPlanHistory(prev => {
          const newHistory = [...prev, snapshot];
          return newHistory.length > 50 ? newHistory.slice(newHistory.length - 50) : newHistory;
      });
  };

  // --- Handlers ---

  const handleUndo = async () => {
    if (planHistory.length === 0) return;
    const previousPlan = planHistory[planHistory.length - 1];
    setPlanHistory(prev => prev.slice(0, -1));
    
    // Restore DB and State
    // We clear current plan items and restore previous
    await storage.clearPlan();
    for (const item of previousPlan) await storage.savePlanItem(item);
    
    setPlan(previousPlan);
    await syncShoppingList(previousPlan, recipes, settings);
  };

  const handleUpdateSettings = async (newSettings: AppSettings) => {
      await storage.saveSettings(newSettings);
      setSettings(newSettings);
      // If pantry staples changed, shopping list might change
      await syncShoppingList(plan, recipes, newSettings);
  };

  // --- Recipe Actions ---

  const handleAddRecipe = async (newRecipeData: Omit<Recipe, 'id' | 'images' | 'version'>) => {
    const newRecipe: Recipe = {
      ...newRecipeData,
      id: Date.now(),
      version: 1,
      history: [],
      images: [`https://picsum.photos/400/300?random=${Date.now()}`] // Mock image fallback
    };
    await storage.saveRecipe(newRecipe);
    setRecipes(prev => [newRecipe, ...prev]);
  };

  const handleUpdateRecipe = async (updatedRecipe: Recipe) => {
    // Check if substantial content changed (instructions or ingredients)
    const existing = recipes.find(r => r.id === updatedRecipe.id);
    let recipeToSave = updatedRecipe;

    if (existing) {
        const contentChanged = 
            JSON.stringify(existing.ingredients) !== JSON.stringify(updatedRecipe.ingredients) ||
            JSON.stringify(existing.instructions) !== JSON.stringify(updatedRecipe.instructions);
        
        if (contentChanged) {
            // Versioning Logic: Snapshot current state to history
            const snapshot = {
                ...existing,
                history: [] // Don't nest history indefinitely
            };
            
            recipeToSave = {
                ...updatedRecipe,
                version: (existing.version || 1) + 1,
                history: [snapshot, ...(existing.history || [])]
            };
        }
    }

    await storage.saveRecipe(recipeToSave);
    const newRecipes = recipes.map(r => r.id === recipeToSave.id ? recipeToSave : r);
    setRecipes(newRecipes);
    
    // Update context if open
    if (selectedContext && selectedContext.recipe.id === recipeToSave.id) {
        // If the update was triggered from within the modal, we want the modal to reflect the NEW version
        setSelectedContext({ ...selectedContext, recipe: recipeToSave });
    }
    
    // Recalculate shopping list
    await syncShoppingList(plan, newRecipes, settings);
  };

  const handleBulkUpdateRecipes = async (updatedRecipes: Recipe[]) => {
      // 1. Save to DB
      for (const r of updatedRecipes) {
          await storage.saveRecipe(r);
      }

      // 2. Update State
      // We calculate the full new recipes array to ensure syncShoppingList works correctly
      const newRecipesFull = recipes.map(r => {
          const updated = updatedRecipes.find(u => u.id === r.id);
          return updated || r;
      });
      
      setRecipes(newRecipesFull);

      // 3. Sync Shopping List
      await syncShoppingList(plan, newRecipesFull, settings);
  };

  const handleDeleteRecipe = async (recipeId: number) => {
    await storage.deleteRecipe(recipeId);
    
    // Update Local State
    const newRecipes = recipes.filter(r => r.id !== recipeId);
    setRecipes(newRecipes);
    
    // Remove meals from plan
    const newPlan = plan.filter(p => p.recipe_id !== recipeId);
    // Sync Plan changes to DB
    // We have to identify removed items to delete them from DB
    const removedItems = plan.filter(p => p.recipe_id === recipeId);
    for (const item of removedItems) await storage.deletePlanItem(item.id);
    
    setPlan(newPlan);
    await syncShoppingList(newPlan, newRecipes, settings);
  };

  // --- Plan Actions ---

  const handleRegeneratePlan = async () => {
      savePlanHistory();
      
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // 1. Separate History (Keep) vs Future (Replace)
      const historyItems = plan.filter(p => {
          const d = new Date(p.date);
          d.setHours(0, 0, 0, 0);
          return d < today;
      });
      
      const futureItemsToRemove = plan.filter(p => {
          const d = new Date(p.date);
          d.setHours(0, 0, 0, 0);
          return d >= today;
      });

      // 2. Remove future items from DB
      for (const item of futureItemsToRemove) {
          await storage.deletePlanItem(item.id);
      }

      // 3. Generate new items for upcoming week
      const newFutureItems = generateInitialPlan([...recipes].reverse()); 
      
      // 4. Save new items
      for (const p of newFutureItems) {
          await storage.savePlanItem(p);
      }
      
      // 5. Update state with Combined List
      const combinedPlan = [...historyItems, ...newFutureItems];
      setPlan(combinedPlan);
      await syncShoppingList(combinedPlan, recipes, settings);
  };

  const handleRateMeal = async (id: number, rating: number, comment?: string) => {
      const item = plan.find(p => p.id === id);
      if (item) {
          const updated = { ...item, rating, rating_comment: comment, is_cooked: true };
          await storage.savePlanItem(updated);
          
          setPlan(prev => prev.map(p => p.id === id ? updated : p));
          if (selectedContext?.meal?.id === id) {
              setSelectedContext({ ...selectedContext, meal: updated });
          }
      }
  };

  const handleAddMeal = async (date: string, recipeId: number) => {
      savePlanHistory();
      const recipe = recipes.find(r => r.id === recipeId);
      
      // Remove existing meal for date to enforce 1 meal/day logic (optional)
      const existing = plan.find(p => p.date === date);
      if (existing) {
          await storage.deletePlanItem(existing.id);
      }

      const newMeal: MealPlanItem = {
          id: Date.now(),
          date: date,
          type: MealType.DINNER,
          recipe_id: recipeId,
          recipe_version: recipe ? (recipe.version || 1) : 1, // Store current version
          is_leftover: false,
          is_cooked: false,
          servings: recipe ? recipe.servings_default : 4
      };

      await storage.savePlanItem(newMeal);
      
      const newPlan = [...plan.filter(p => p.date !== date), newMeal];
      setPlan(newPlan);
      await syncShoppingList(newPlan, recipes, settings);
      
      setView('plan');
  };

  const handleRemoveMeal = async (date: string) => {
      savePlanHistory();
      const item = plan.find(p => p.date === date);
      if (item) {
          await storage.deletePlanItem(item.id);
          const newPlan = plan.filter(p => p.date !== date);
          setPlan(newPlan);
          await syncShoppingList(newPlan, recipes, settings);
      }
  };

  const handleUpdateServings = async (mealId: number, newServings: number) => {
      savePlanHistory();
      const item = plan.find(p => p.id === mealId);
      if (item) {
          const updated = { ...item, servings: newServings };
          await storage.savePlanItem(updated);
          
          const newPlan = plan.map(p => p.id === mealId ? updated : p);
          setPlan(newPlan);
          
          if (selectedContext?.meal?.id === mealId) {
             setSelectedContext({ ...selectedContext, meal: updated });
          }
          await syncShoppingList(newPlan, recipes, settings);
      }
  };

  const handleMoveMeal = async (date: string, direction: 'up' | 'down') => {
      savePlanHistory();
      // Logic: Swap dates or move date.
      // Since 'Move' can get complex with DB calls, we calculate full new state then save changed items.
      const currentPlan = [...plan];
      const idx = currentPlan.findIndex(p => p.date === date);
      if (idx === -1) return;
      
      const targetDateObj = new Date(date);
      targetDateObj.setDate(targetDateObj.getDate() + (direction === 'down' ? 1 : -1));
      const targetDate = targetDateObj.toISOString().split('T')[0];
      const targetIdx = currentPlan.findIndex(p => p.date === targetDate);
      
      const itemsToUpdate: MealPlanItem[] = [];

      if (targetIdx > -1) {
          // Swap
          const itemA = { ...currentPlan[idx], date: targetDate };
          const itemB = { ...currentPlan[targetIdx], date: date };
          currentPlan[idx] = itemA;
          currentPlan[targetIdx] = itemB;
          itemsToUpdate.push(itemA, itemB);
      } else {
          // Move to empty slot
          const itemA = { ...currentPlan[idx], date: targetDate };
          currentPlan[idx] = itemA;
          itemsToUpdate.push(itemA);
      }
      
      for (const item of itemsToUpdate) await storage.savePlanItem(item);
      setPlan(currentPlan);
      // Shopping list usually doesn't change on move, but good to ensure sync
      await syncShoppingList(currentPlan, recipes, settings);
  };

  const handleReorderMeal = async (mealId: number, targetDate: string) => {
      savePlanHistory();
      // Identify items involved
      const currentPlan = [...plan];
      const draggingIdx = currentPlan.findIndex(p => p.id === mealId);
      if (draggingIdx === -1) return;
      
      const targetIdx = currentPlan.findIndex(p => p.date === targetDate);
      
      const itemsToUpdate: MealPlanItem[] = [];
      const draggingItem = { ...currentPlan[draggingIdx] };
      const originalDate = draggingItem.date;
      
      if (targetIdx > -1) {
          // Swap
          const targetItem = { ...currentPlan[targetIdx] };
          draggingItem.date = targetDate;
          targetItem.date = originalDate;
          
          currentPlan[draggingIdx] = draggingItem;
          currentPlan[targetIdx] = targetItem;
          itemsToUpdate.push(draggingItem, targetItem);
      } else {
          // Move
          draggingItem.date = targetDate;
          currentPlan[draggingIdx] = draggingItem;
          itemsToUpdate.push(draggingItem);
      }

      for (const item of itemsToUpdate) await storage.savePlanItem(item);
      setPlan(currentPlan);
      await syncShoppingList(currentPlan, recipes, settings);
  };
  
  // --- Stats & Data Actions ---
  
  const handleClearStats = async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      // Identify items to remove (strictly before today)
      const itemsToRemove = plan.filter(p => {
          const d = new Date(p.date);
          d.setHours(0,0,0,0);
          return d < today;
      });
      
      // Delete from DB
      for (const item of itemsToRemove) {
          await storage.deletePlanItem(item.id);
      }
      
      // Update Local State (Keep only today and future)
      setPlan(prev => prev.filter(p => {
          const d = new Date(p.date);
          d.setHours(0,0,0,0);
          return d >= today;
      }));
  };

  const handleClearReviews = async () => {
      // Find items with ratings
      const updates = plan
          .filter(p => p.rating !== undefined || p.rating_comment !== undefined)
          .map(p => ({ ...p, rating: undefined, rating_comment: undefined }));
      
      for (const item of updates) {
          await storage.savePlanItem(item);
      }
      
      setPlan(prev => prev.map(p => {
          const updated = updates.find(u => u.id === p.id);
          return updated || p;
      }));
  };

  // --- Shopping Actions ---

  const toggleShoppingItem = async (id: number) => {
      const item = shoppingList.find(i => i.id === id);
      if (item) {
          const updated = { ...item, checked: !item.checked };
          await storage.saveShoppingItem(updated);
          setShoppingList(prev => prev.map(i => i.id === id ? updated : i));
      }
  };

  const updateShoppingItemCategory = async (id: number, newCategory: string) => {
      const item = shoppingList.find(i => i.id === id);
      if (item) {
          const updated = { ...item, category: newCategory };
          await storage.saveShoppingItem(updated);
          setShoppingList(prev => prev.map(i => i.id === id ? updated : i));
      }
  };

  const handleUpdateShoppingItem = async (id: number, updates: Partial<ShoppingItem>) => {
      const item = shoppingList.find(i => i.id === id);
      if (!item) return;
      
      const updated = { ...item, ...updates };
      
      if ('quantity' in updates && (updates.quantity || 0) <= 0) {
          // Delete
          await storage.deleteShoppingItem(id);
          setShoppingList(prev => prev.filter(i => i.id !== id));
      } else {
          // Update
          await storage.saveShoppingItem(updated);
          setShoppingList(prev => prev.map(i => i.id === id ? updated : i));
      }
  };

  const addShoppingItem = async (name: string) => {
      const normalizedName = name.trim();
      const existing = shoppingList.find(i => i.item_name.toLowerCase() === normalizedName.toLowerCase());
      
      if (existing) {
          const updated = { ...existing, quantity: existing.quantity + 1, checked: false };
          await storage.saveShoppingItem(updated);
          setShoppingList(prev => prev.map(i => i.id === existing.id ? updated : i));
      } else {
          const newItem: ShoppingItem = {
              id: Date.now(),
              item_name: normalizedName,
              quantity: 1,
              unit: 'pc',
              category: 'Other',
              checked: false,
              is_manually_added: true
          };
          await storage.saveShoppingItem(newItem);
          setShoppingList(prev => [newItem, ...prev]);
      }
  };

  const clearCheckedItems = async () => {
      const toRemove = shoppingList.filter(i => i.checked);
      for (const item of toRemove) await storage.deleteShoppingItem(item.id);
      setShoppingList(prev => prev.filter(i => !i.checked));
  };

  const t = NAV_TRANSLATIONS[settings.language];

  // Nav Item Component
  const NavItem = ({ viewName, icon: Icon, label }: { viewName: ViewState, icon: React.ElementType, label: string }) => (
    <button 
      onClick={() => setView(viewName)}
      className={`flex flex-col items-center justify-center w-full py-3 transition-colors ${view === viewName ? 'text-nordic-primary' : 'text-gray-400 hover:text-gray-600'}`}
    >
      <Icon className={`w-6 h-6 mb-1 ${view === viewName ? 'stroke-[2.5px]' : 'stroke-2'}`} />
      <span className="text-[10px] font-medium">{label}</span>
    </button>
  );

  if (!isLoaded) {
      return (
          <div className="min-h-screen flex items-center justify-center bg-nordic-bg text-nordic-primary">
              <div className="flex flex-col items-center gap-3 animate-pulse">
                  <Icons.Sparkles className="w-10 h-10" />
                  <p className="font-bold">{t.loading}</p>
              </div>
          </div>
      );
  }

  return (
    <div className="min-h-screen bg-nordic-bg font-sans max-w-md mx-auto shadow-2xl overflow-hidden relative border-x border-gray-100">
      
      <main className="h-screen overflow-y-auto no-scrollbar p-3">
        {view === 'plan' && (
            <PlanView 
                plan={plan} 
                recipes={recipes} 
                onGenerate={handleRegeneratePlan} 
                onRateMeal={handleRateMeal}
                onAddMeal={handleAddMeal}
                onRemoveMeal={handleRemoveMeal}
                onMoveMeal={handleMoveMeal}
                onReorderMeal={handleReorderMeal}
                onSelectRecipe={(r, m) => setSelectedContext({ recipe: r, meal: m })}
                onUndo={handleUndo}
                canUndo={planHistory.length > 0}
                language={settings.language}
            />
        )}
        {view === 'shop' && (
            <ShopView 
                items={shoppingList}
                plan={plan}
                recipes={recipes}
                settings={settings}
                onToggleItem={toggleShoppingItem} 
                onAddItem={addShoppingItem}
                onUpdateCategory={updateShoppingItemCategory}
                onUpdateItem={handleUpdateShoppingItem}
                onClearChecked={clearCheckedItems}
                language={settings.language}
            />
        )}
        {view === 'recipes' && (
            <RecipesView 
                recipes={recipes} 
                plan={plan}
                onAddRecipe={handleAddRecipe} 
                onUpdateRecipe={handleUpdateRecipe}
                onDeleteRecipe={handleDeleteRecipe}
                onAddMeal={handleAddMeal}
                onSelectRecipe={(r) => setSelectedContext({ recipe: r })}
                language={settings.language}
            />
        )}
        {view === 'stats' && (
            <StatsView 
                plan={plan} 
                recipes={recipes} 
                language={settings.language}
            />
        )}
        {view === 'settings' && (
            <SettingsView 
                settings={settings} 
                onUpdate={handleUpdateSettings} 
                recipes={recipes}
                plan={plan}
                onUpdateRecipes={handleBulkUpdateRecipes}
                onClearStats={handleClearStats}
                onClearReviews={handleClearReviews}
            />
        )}
      </main>

      {/* Shared Recipe Detail Modal/Cooking View */}
      {selectedContext && (
        <RecipeDetail 
            recipe={selectedContext.recipe}
            meal={selectedContext.meal}
            recipes={recipes}
            plan={plan}
            settings={settings}
            onClose={() => setSelectedContext(null)}
            onUpdateRecipe={handleUpdateRecipe}
            onUpdateServings={handleUpdateServings}
            onAddMeal={handleAddMeal}
            onRateMeal={handleRateMeal}
            language={settings.language}
        />
      )}

      {/* Bottom Navigation */}
      <nav className="absolute bottom-0 left-0 right-0 bg-white/80 backdrop-blur-lg border-t border-gray-200 flex justify-around pb-safe pt-1 z-10">
        <NavItem viewName="plan" icon={Icons.Plan} label={t.plan} />
        <NavItem viewName="shop" icon={Icons.Shop} label={t.shop} />
        <NavItem viewName="recipes" icon={Icons.Recipes} label={t.recipes} />
        <NavItem viewName="stats" icon={Icons.Chart} label={t.stats} />
        <NavItem viewName="settings" icon={Icons.Settings} label={t.settings} />
      </nav>
      
    </div>
  );
};

export default App;