import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { ViewState, Recipe, MealPlanItem, ShoppingItem, AppSettings, Language, MealType, SHOPPING_CATEGORIES } from './types';
import { storage } from './services/storage';
import { INITIAL_SETTINGS, mergeShoppingList } from './services/mockData';
import { BASE_TRANSLATIONS } from './services/translations';
import { PlanView } from './components/PlanView';
import { ShopView } from './components/ShopView';
import { RecipesView } from './components/RecipesView';
import { StatsView } from './components/StatsView';
import { SettingsView } from './components/SettingsView';
import { RecipeDetail } from './components/RecipeDetail';
import { Icons } from './components/Shared';

// Order of tabs for swipe navigation
const TABS: ViewState[] = ['plan', 'shop', 'recipes', 'stats', 'settings'];

const App = () => {
  const [activeView, setActiveView] = useState<ViewState>('plan');
  const [slideDir, setSlideDir] = useState<'right' | 'left'>('right');
  const [loading, setLoading] = useState(true);
  
  // Data State
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [plan, setPlan] = useState<MealPlanItem[]>([]);
  const [shoppingItems, setShoppingItems] = useState<ShoppingItem[]>([]);
  const [settings, setSettings] = useState<AppSettings>(INITIAL_SETTINGS);

  // UI State
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [selectedMealForDetail, setSelectedMealForDetail] = useState<MealPlanItem | undefined>(undefined);

  // Undo History for Plan
  const [planHistory, setPlanHistory] = useState<MealPlanItem[][]>([]);

  // Swipe State
  const touchStartX = useRef<number | null>(null);
  const touchEndX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const touchEndY = useRef<number | null>(null);
  const minSwipeDistance = 50;

  // Load Data
  useEffect(() => {
    const load = async () => {
      await storage.init();
      const [r, p, s, cfg] = await Promise.all([
        storage.getRecipes(),
        storage.getPlan(),
        storage.getShoppingList(),
        storage.getSettings()
      ]);
      setRecipes(r);
      setPlan(p);
      setShoppingItems(s);
      setSettings(cfg);
      setLoading(false);
    };
    load();
  }, []);

  // --- Translation Helper ---
  const t = useMemo(() => {
    // 1. Check custom languages
    if (settings.custom_languages && settings.custom_languages[settings.language]) {
        return settings.custom_languages[settings.language];
    }
    // 2. Check built-in
    if (BASE_TRANSLATIONS[settings.language as Language]) {
        return BASE_TRANSLATIONS[settings.language as Language];
    }
    // 3. Fallback
    return BASE_TRANSLATIONS[Language.EN];
  }, [settings.language, settings.custom_languages]);

  // --- Navigation Helper ---
  const changeView = (newView: ViewState) => {
      if (newView === activeView) return;
      const currentIndex = TABS.indexOf(activeView);
      const newIndex = TABS.indexOf(newView);
      setSlideDir(newIndex > currentIndex ? 'right' : 'left');
      setActiveView(newView);
  };

  // --- Plan Actions ---

  const savePlanToHistory = () => {
      setPlanHistory(prev => [...prev.slice(-9), [...plan]]); // Keep last 10
  };

  const handleUndoPlan = () => {
      if (planHistory.length === 0) return;
      const previous = planHistory[planHistory.length - 1];
      const newHistory = planHistory.slice(0, -1);
      setPlanHistory(newHistory);
      setPlan(previous);
      storage.clearPlan().then(() => {
          previous.forEach(p => storage.savePlanItem(p));
      });
  };

  const handleAddMeal = async (date: string, recipeId: number) => {
      savePlanToHistory();
      const recipe = recipes.find(r => r.id === recipeId);
      if (!recipe) return;

      const newItem: MealPlanItem = {
          id: Date.now(),
          date,
          recipe_id: recipeId,
          recipe_version: recipe.version,
          type: MealType.DINNER,
          is_cooked: false,
          is_leftover: false,
          servings: recipe.servings_default
      };

      const newPlan = [...plan, newItem];
      setPlan(newPlan);
      await storage.savePlanItem(newItem);
  };

  const handleGeneratePlan = async (startDateStr: string) => {
      savePlanToHistory();
      
      const newPlan = [...plan];
      const start = new Date(startDateStr);

      // Determine today's date string (local) to avoid generating for past days
      const now = new Date();
      const todayYear = now.getFullYear();
      const todayMonth = String(now.getMonth() + 1).padStart(2, '0');
      const todayDay = String(now.getDate()).padStart(2, '0');
      const todayStr = `${todayYear}-${todayMonth}-${todayDay}`;
      
      // Try to fill 7 days from start date
      for (let i = 0; i < 7; i++) {
          const d = new Date(start);
          d.setDate(d.getDate() + i);
          const dateStr = d.toISOString().split('T')[0];
          
          // Skip if date is in the past
          if (dateStr < todayStr) continue;

          // Skip if already has meal
          if (newPlan.some(p => p.date === dateStr)) continue;
          
          // Smart Recommendation Logic
          if (recipes.length > 0) {
              const scoredRecipes = recipes.map(recipe => {
                  // 1. Rating Score
                  const history = newPlan.filter(p => p.recipe_id === recipe.id && p.rating);
                  const avgRating = history.length > 0 
                      ? history.reduce((acc, curr) => acc + (curr.rating || 0), 0) / history.length
                      : (recipe.rating || 3.5); // Default neutral/good

                  // 2. Recency Score
                  const eatenDates = newPlan
                      .filter(p => p.recipe_id === recipe.id && p.date < dateStr)
                      .map(p => p.date)
                      .sort()
                      .reverse();
                  
                  const lastEatenDate = eatenDates[0];
                  let daysSince = 100; // Default high if never eaten
                  
                  if (lastEatenDate) {
                      const targetTime = new Date(dateStr).getTime();
                      const lastTime = new Date(lastEatenDate).getTime();
                      // Diff in days
                      daysSince = Math.round((targetTime - lastTime) / (1000 * 60 * 60 * 24));
                  }

                  // --- Scoring Algorithm ---
                  // Base: Rating (0-50 points) + DaysSince (capped at 30, x2 = 60 points)
                  let score = (avgRating * 10) + (Math.min(daysSince, 30) * 2);

                  // Penalties for recent meals (Graduated)
                  if (daysSince <= 1) {
                      score -= 10000; // Impossible to pick unless it's the only option
                  } else if (daysSince <= 2) {
                      score -= 5000; // Very strongly avoid
                  } else if (daysSince <= 5) {
                      score -= 2000; // Avoid if possible
                  } else if (daysSince <= 7) {
                      score -= 500;  // Slight preference for variety > 1 week
                  }

                  // Random Jitter (0-10) to mix up similar candidates
                  score += Math.random() * 10;

                  return { id: recipe.id, score, daysSince };
              });

              // Sort by highest score
              scoredRecipes.sort((a, b) => b.score - a.score);
              
              const bestMatch = scoredRecipes[0];
              
              // Select the best match. 
              // We do NOT use a random fallback here because the scoring logic above
              // already handles "bad" options by penalizing them but keeping them in relative order.
              // E.g. A meal eaten 5 days ago will have a higher score than one eaten 1 day ago.
              const selectedRecipe = recipes.find(r => r.id === bestMatch.id);

              if (selectedRecipe) {
                  const newItem: MealPlanItem = {
                      id: Date.now() + i,
                      date: dateStr,
                      recipe_id: selectedRecipe.id,
                      recipe_version: selectedRecipe.version,
                      type: MealType.DINNER,
                      is_cooked: false,
                      is_leftover: false,
                      servings: selectedRecipe.servings_default
                  };
                  newPlan.push(newItem);
                  await storage.savePlanItem(newItem);
              }
          }
      }
      setPlan(newPlan);
  };

  const handleMoveMeal = async (date: string, direction: 'up' | 'down') => {
      // "Move" in a calendar usually implies changing date. 
      // But for 'up/down' in a list, it might mean swapping with prev/next day?
      // Let's implement swapping with adjacent day.
      const current = plan.find(p => p.date === date);
      if (!current) return;

      savePlanToHistory();

      const d = new Date(date);
      d.setDate(d.getDate() + (direction === 'down' ? 1 : -1));
      const targetDate = d.toISOString().split('T')[0];

      const target = plan.find(p => p.date === targetDate);

      // Perform swap or move
      const updatedPlan = plan.map(p => {
          if (p.id === current.id) return { ...p, date: targetDate };
          if (target && p.id === target.id) return { ...p, date };
          return p;
      });

      setPlan(updatedPlan);
      await storage.savePlanItem({ ...current, date: targetDate });
      if (target) await storage.savePlanItem({ ...target, date });
  };

  const handleReorderMeal = async (mealId: number, targetDate: string) => {
       const meal = plan.find(p => p.id === mealId);
       if (!meal || meal.date === targetDate) return;
       
       savePlanToHistory();
       
       // Check collision
       const targetMeal = plan.find(p => p.date === targetDate);
       
       let updatedPlan = [...plan];
       
       if (targetMeal) {
           // Swap dates
           updatedPlan = updatedPlan.map(p => {
               if (p.id === mealId) return { ...p, date: targetDate };
               if (p.id === targetMeal.id) return { ...p, date: meal.date };
               return p;
           });
           await storage.savePlanItem({ ...meal, date: targetDate });
           await storage.savePlanItem({ ...targetMeal, date: meal.date });
       } else {
           // Just move
           updatedPlan = updatedPlan.map(p => {
               if (p.id === mealId) return { ...p, date: targetDate };
               return p;
           });
           await storage.savePlanItem({ ...meal, date: targetDate });
       }
       setPlan(updatedPlan);
  };

  const handleRemoveMeal = async (date: string) => {
      const meal = plan.find(p => p.date === date);
      if (!meal) return;
      savePlanToHistory();
      
      const newPlan = plan.filter(p => p.date !== date);
      setPlan(newPlan);
      await storage.deletePlanItem(meal.id);
  };

  const handleRateMeal = async (id: number, rating: number, comment?: string) => {
      const updatedPlan = plan.map(p => 
          p.id === id ? { ...p, is_cooked: true, rating, rating_comment: comment } : p
      );
      setPlan(updatedPlan);
      const item = updatedPlan.find(p => p.id === id);
      if (item) await storage.savePlanItem(item);
  };
  
  const handleUpdateServings = async (mealId: number, servings: number) => {
      const updatedPlan = plan.map(p => 
          p.id === mealId ? { ...p, servings } : p
      );
      setPlan(updatedPlan);
      const item = updatedPlan.find(p => p.id === mealId);
      if (item) await storage.savePlanItem(item);
  }

  // --- Recipe Actions ---

  const handleAddRecipe = async (recipeData: Omit<Recipe, 'id' | 'images' | 'version'>) => {
      const newRecipe: Recipe = {
          ...recipeData,
          id: Date.now(),
          images: [`https://picsum.photos/seed/${Date.now()}/400/300`], // Placeholder if none
          version: 1,
          history: []
      };
      const newRecipes = [newRecipe, ...recipes];
      setRecipes(newRecipes);
      await storage.saveRecipe(newRecipe);
  };

  const handleUpdateRecipe = async (updated: Recipe) => {
      // Handle Versioning
      const original = recipes.find(r => r.id === updated.id);
      let finalRecipe = updated;
      
      if (original) {
          // Check if ingredients or instructions changed to bump version
          const changed = JSON.stringify(original.ingredients) !== JSON.stringify(updated.ingredients) ||
                          JSON.stringify(original.instructions) !== JSON.stringify(updated.instructions);
          
          if (changed) {
              finalRecipe = {
                  ...updated,
                  version: (original.version || 1) + 1,
                  history: [...(original.history || []), original]
              };
          }
      }

      const newRecipes = recipes.map(r => r.id === updated.id ? finalRecipe : r);
      setRecipes(newRecipes);
      await storage.saveRecipe(finalRecipe);
      
      // Update selected if open
      if (selectedRecipe?.id === updated.id) {
          setSelectedRecipe(finalRecipe);
      }
  };

  const handleDeleteRecipe = async (id: number) => {
      const newRecipes = recipes.filter(r => r.id !== id);
      setRecipes(newRecipes);
      await storage.deleteRecipe(id);
      // Remove from plan? Optional, keeping history might be better
  };

  const handleUpdateAllRecipes = async (newRecipes: Recipe[]) => {
      setRecipes(newRecipes);
      // Batch save
      for (const r of newRecipes) await storage.saveRecipe(r);
  };

  // --- Shopping List Actions ---

  const handleToggleItem = async (item: ShoppingItem) => {
      const existingIndex = shoppingItems.findIndex(i => i.id === item.id);
      let newItems;
      let itemToSave;

      if (existingIndex >= 0) {
          // Item exists in persistence, toggle it
          const existing = shoppingItems[existingIndex];
          const updated = { ...existing, checked: !existing.checked };
          newItems = [...shoppingItems];
          newItems[existingIndex] = updated;
          itemToSave = updated;
      } else {
          // Item generated from plan but not yet persisted (because it's new/view-only)
          // Since user clicked it, we assume they want to toggle it (likely check it)
          const newItem = { ...item, checked: !item.checked };
          newItems = [...shoppingItems, newItem];
          itemToSave = newItem;
      }

      setShoppingItems(newItems);
      await storage.saveShoppingItem(itemToSave);
  };

  const handleAddShoppingItem = async (name: string) => {
      const newItem: ShoppingItem = {
          id: Date.now(),
          item_name: name,
          quantity: 1,
          unit: 'pc',
          category: 'Other',
          checked: false,
          is_manually_added: true,
          lang: settings.language // Store the current language for this item
      };
      const newItems = [...shoppingItems, newItem];
      setShoppingItems(newItems);
      await storage.saveShoppingItem(newItem);
  };

  const handleUpdateShoppingItem = async (id: number, updates: Partial<ShoppingItem>) => {
      let newItem: ShoppingItem | undefined;
      const newItems = shoppingItems.map(i => {
          if (i.id === id) {
              newItem = { ...i, ...updates };
              return newItem;
          }
          return i;
      });
      setShoppingItems(newItems);
      if (newItem) await storage.saveShoppingItem(newItem);
  };

  const handleUpdateCategory = async (id: number, category: string) => {
      handleUpdateShoppingItem(id, { category });
  };
  
  const handleClearChecked = async () => {
      const toKeep = shoppingItems.filter(i => !i.checked);
      const toDelete = shoppingItems.filter(i => i.checked);
      
      setShoppingItems(toKeep);
      for (const item of toDelete) {
          await storage.deleteShoppingItem(item.id);
      }
  };

  // --- Settings Actions ---
  const handleUpdateSettings = async (newSettings: AppSettings) => {
      setSettings(newSettings);
      await storage.saveSettings(newSettings);
  };

  const handleClearStats = async () => {
      // Clear past meals
      const today = new Date().toISOString().split('T')[0];
      const futurePlan = plan.filter(p => p.date >= today);
      setPlan(futurePlan);
      await storage.clearPlan();
      for (const p of futurePlan) await storage.savePlanItem(p);
  };
  
  const handleClearReviews = async () => {
      const cleanPlan = plan.map(p => ({ ...p, rating: undefined, rating_comment: undefined, is_cooked: false }));
      setPlan(cleanPlan);
      // Batch update
      await storage.clearPlan();
      for (const p of cleanPlan) await storage.savePlanItem(p);
  };

  // --- Swipe Navigation Logic ---

  const onTouchStart = (e: React.TouchEvent) => {
      touchEndX.current = null;
      touchEndY.current = null;
      touchStartX.current = e.targetTouches[0].clientX;
      touchStartY.current = e.targetTouches[0].clientY;
  };

  const onTouchMove = (e: React.TouchEvent) => {
      touchEndX.current = e.targetTouches[0].clientX;
      touchEndY.current = e.targetTouches[0].clientY;
  };

  const onTouchEnd = () => {
      if (!touchStartX.current || !touchEndX.current || !touchStartY.current || !touchEndY.current) return;
      
      const distanceX = touchStartX.current - touchEndX.current;
      const distanceY = touchStartY.current - touchEndY.current;
      
      // If vertical movement is greater than horizontal, assume scrolling and do nothing
      if (Math.abs(distanceY) > Math.abs(distanceX)) return;

      const isLeftSwipe = distanceX > minSwipeDistance;
      const isRightSwipe = distanceX < -minSwipeDistance;

      const currentIndex = TABS.indexOf(activeView);

      if (isLeftSwipe && currentIndex < TABS.length - 1) {
          changeView(TABS[currentIndex + 1]);
      }

      if (isRightSwipe && currentIndex > 0) {
          changeView(TABS[currentIndex - 1]);
      }
  };

  if (loading) {
      return (
          <div className="min-h-screen bg-nordic-bg flex items-center justify-center text-nordic-muted animate-pulse">
              <Icons.Sparkles className="w-8 h-8 mr-2" />
              {t?.loading || "Loading..."}
          </div>
      );
  }

  // Animation classes based on direction
  const animClass = slideDir === 'right' ? 'animate-slide-in-right' : 'animate-slide-in-left';

  return (
    <div className="h-[100dvh] bg-nordic-bg text-slate-800 font-sans selection:bg-teal-100 overflow-hidden flex flex-row">
      {/* Desktop Sidebar */}
      <nav className="hidden md:flex flex-col w-64 bg-white border-r border-gray-100 p-4 shrink-0 z-20 shadow-sm">
          <div className="flex items-center gap-3 px-2 mb-8 mt-2">
              <div className="w-8 h-8 bg-nordic-primary rounded-lg flex items-center justify-center text-white">
                  <Icons.Shop className="w-5 h-5" />
              </div>
              <h1 className="font-bold text-lg text-nordic-secondary tracking-tight">HomeChef Hub</h1>
          </div>
          
          <div className="space-y-1 flex-1">
              {TABS.map(tab => {
                  const isActive = activeView === tab;
                  let Icon = Icons.Plan;
                  let label = t.nav_plan;
                  if (tab === 'shop') { Icon = Icons.Shop; label = t.nav_shop; }
                  if (tab === 'recipes') { Icon = Icons.Recipes; label = t.nav_recipes; }
                  if (tab === 'stats') { Icon = Icons.Chart; label = t.nav_stats; }
                  if (tab === 'settings') { Icon = Icons.Settings; label = t.nav_settings; }

                  return (
                      <button
                          key={tab}
                          onClick={() => changeView(tab)}
                          className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition-all ${
                              isActive 
                              ? 'bg-nordic-primary text-white shadow-md shadow-teal-900/10' 
                              : 'text-gray-500 hover:bg-gray-50 hover:text-nordic-text'
                          }`}
                      >
                          <Icon className={`w-5 h-5 ${isActive ? 'text-white' : 'text-gray-400'}`} />
                          {label}
                      </button>
                  );
              })}
          </div>
          <div className="text-xs text-gray-300 px-2 mt-4 text-center">
              v0.2.5
          </div>
      </nav>

      {/* Main Content Area */}
      <main 
        className="flex-1 flex flex-col h-[100dvh] overflow-hidden relative"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <div className="flex-1 overflow-y-auto no-scrollbar pt-6 px-4 md:px-8 md:pt-8 overflow-x-hidden">
            <div key={activeView} className={`min-h-full max-w-7xl mx-auto w-full ${animClass}`}>
                {activeView === 'plan' && (
                    <PlanView 
                        plan={plan}
                        recipes={recipes}
                        onGenerate={handleGeneratePlan}
                        onRateMeal={handleRateMeal}
                        onAddMeal={handleAddMeal}
                        onMoveMeal={handleMoveMeal}
                        onReorderMeal={handleReorderMeal}
                        onRemoveMeal={handleRemoveMeal}
                        onSelectRecipe={(r, m) => { setSelectedRecipe(r); setSelectedMealForDetail(m); }}
                        onUndo={handleUndoPlan}
                        canUndo={planHistory.length > 0}
                        t={t}
                        language={settings.language}
                        settings={settings}
                    />
                )}

                {activeView === 'shop' && (
                    <ShopView 
                        items={shoppingItems}
                        plan={plan}
                        recipes={recipes}
                        settings={settings}
                        onToggleItem={handleToggleItem}
                        onAddItem={handleAddShoppingItem}
                        onUpdateCategory={handleUpdateCategory}
                        onUpdateItem={handleUpdateShoppingItem}
                        onClearChecked={handleClearChecked}
                        language={settings.language}
                        t={t}
                    />
                )}

                {activeView === 'recipes' && (
                    <RecipesView 
                        recipes={recipes}
                        plan={plan}
                        onAddRecipe={handleAddRecipe}
                        onUpdateRecipe={handleUpdateRecipe}
                        onDeleteRecipe={handleDeleteRecipe}
                        onAddMeal={handleAddMeal}
                        onSelectRecipe={(r) => { setSelectedRecipe(r); setSelectedMealForDetail(undefined); }}
                        t={t}
                        language={settings.language}
                    />
                )}

                {activeView === 'stats' && (
                    <StatsView 
                        plan={plan}
                        recipes={recipes}
                        t={t}
                        language={settings.language}
                    />
                )}

                {activeView === 'settings' && (
                    <SettingsView 
                        settings={settings}
                        onUpdate={handleUpdateSettings}
                        recipes={recipes}
                        plan={plan}
                        onUpdateRecipes={handleUpdateAllRecipes}
                        onClearStats={handleClearStats}
                        onClearReviews={handleClearReviews}
                        t={t}
                    />
                )}
            </div>
        </div>

        {/* Bottom Nav (Mobile Only) */}
        <nav className="md:hidden shrink-0 bg-white border-t border-gray-100 px-6 py-3 flex justify-between items-center z-50 pb-safe">
            <button onClick={() => changeView('plan')} className={`flex flex-col items-center gap-1 transition-colors ${activeView === 'plan' ? 'text-nordic-primary' : 'text-gray-400'}`}>
                <Icons.Plan className="w-6 h-6" />
                <span className="text-[10px] font-medium">{t.nav_plan}</span>
            </button>
            <button onClick={() => changeView('shop')} className={`flex flex-col items-center gap-1 transition-colors ${activeView === 'shop' ? 'text-nordic-primary' : 'text-gray-400'}`}>
                <Icons.Shop className="w-6 h-6" />
                <span className="text-[10px] font-medium">{t.nav_shop}</span>
            </button>
            <button onClick={() => changeView('recipes')} className={`flex flex-col items-center gap-1 transition-colors ${activeView === 'recipes' ? 'text-nordic-primary' : 'text-gray-400'}`}>
                <Icons.Recipes className="w-6 h-6" />
                <span className="text-[10px] font-medium">{t.nav_recipes}</span>
            </button>
            <button onClick={() => changeView('stats')} className={`flex flex-col items-center gap-1 transition-colors ${activeView === 'stats' ? 'text-nordic-primary' : 'text-gray-400'}`}>
                <Icons.Chart className="w-6 h-6" />
                <span className="text-[10px] font-medium">{t.nav_stats}</span>
            </button>
            <button onClick={() => changeView('settings')} className={`flex flex-col items-center gap-1 transition-colors ${activeView === 'settings' ? 'text-nordic-primary' : 'text-gray-400'}`}>
                <Icons.Settings className="w-6 h-6" />
                <span className="text-[10px] font-medium">{t.nav_settings}</span>
            </button>
        </nav>

        {/* Detail Modal */}
        {selectedRecipe && (
            <div className="absolute inset-0 z-50 animate-in slide-in-from-bottom-10 duration-300">
                <RecipeDetail 
                    recipe={selectedRecipe}
                    recipes={recipes}
                    meal={selectedMealForDetail}
                    plan={plan}
                    settings={settings}
                    onClose={() => setSelectedRecipe(null)}
                    onUpdateRecipe={handleUpdateRecipe}
                    onUpdateServings={handleUpdateServings}
                    onAddMeal={handleAddMeal}
                    onRateMeal={handleRateMeal}
                    t={t}
                    language={settings.language}
                />
            </div>
        )}
      </main>
    </div>
  );
};

export default App;