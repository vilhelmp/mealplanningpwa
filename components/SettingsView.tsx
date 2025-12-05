import React, { useState, useRef, useEffect, useMemo } from 'react';
import { AppSettings, Language, Store, SHOPPING_CATEGORIES, Recipe, Ingredient, MealPlanItem } from '../types';
import { Card, Button, Input, Icons, Modal } from './Shared';
import { translateRecipe, translateShoppingItems, translateStrings, generateInterfaceTranslations } from '../services/geminiService';
import { storage } from '../services/storage';
import { BASE_TRANSLATIONS } from '../services/translations';

interface SettingsViewProps {
  settings: AppSettings;
  onUpdate: (newSettings: AppSettings) => void;
  recipes: Recipe[];
  plan: MealPlanItem[];
  onUpdateRecipes: (recipes: Recipe[]) => Promise<void>;
  onClearStats: () => Promise<void>;
  onClearReviews: () => Promise<void>;
  t: any;
}

const LANGUAGES = [
    { code: 'en', name: 'English' },
    { code: 'sv', name: 'Svenska' },
    { code: 'de', name: 'Deutsch' },
    { code: 'fr', name: 'Français' },
    { code: 'es', name: 'Español' },
    { code: 'it', name: 'Italiano' },
    { code: 'pt', name: 'Português' },
    { code: 'nl', name: 'Nederlands' },
    { code: 'pl', name: 'Polski' },
    { code: 'da', name: 'Dansk' },
    { code: 'no', name: 'Norsk' },
    { code: 'fi', name: 'Suomi' },
];

interface AggregatedIngredient {
    name: string; // Lowercase key
    displayName: string; // Display Name (first encountered)
    category: string;
    unit: string;
    count: number;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ settings, onUpdate, recipes, plan, onUpdateRecipes, onClearStats, onClearReviews, t }) => {
  const [newStaple, setNewStaple] = useState('');
  const [newStoreName, setNewStoreName] = useState('');
  
  // Store Editing State
  const [editingStore, setEditingStore] = useState<Store | null>(null);
  const [tempCategoryOrder, setTempCategoryOrder] = useState<string[]>([]);
  
  // Ingredients Modal State
  const [isIngModalOpen, setIngModalOpen] = useState(false);
  const [ingSearch, setIngSearch] = useState('');
  const [editingIng, setEditingIng] = useState<AggregatedIngredient | null>(null);
  const [editIngName, setEditIngName] = useState('');
  const [editIngCategory, setEditIngCategory] = useState('');
  const [editIngUnit, setEditIngUnit] = useState('');

  // Clear Data Confirmations
  const [showClearStatsConfirm, setShowClearStatsConfirm] = useState(false);
  const [showClearReviewsConfirm, setShowClearReviewsConfirm] = useState(false);

  // Translation State
  const [isTranslating, setIsTranslating] = useState(false);
  const [translationProgress, setTranslationProgress] = useState(0);

  // Language Modal State
  const [isLangModalOpen, setIsLangModalOpen] = useState(false);
  const [langSearch, setLangSearch] = useState('');
  const [isGeneratingLang, setIsGeneratingLang] = useState(false);

  // Drag State for Category Sorting
  const [draggedItemIndex, setDraggedItemIndex] = useState<number | null>(null);
  const [dragOverItemIndex, setDragOverItemIndex] = useState<number | null>(null);
  const longPressTimer = useRef<any>(null);

  // Derive unique ingredients list
  const uniqueIngredients = useMemo(() => {
    const map = new Map<string, AggregatedIngredient>();
    recipes.forEach(r => {
        r.ingredients.forEach(i => {
            const key = i.item_name.toLowerCase().trim();
            if (!map.has(key)) {
                map.set(key, { 
                    name: key, 
                    displayName: i.item_name,
                    category: i.category,
                    unit: i.unit,
                    count: 1
                });
            } else {
                const existing = map.get(key)!;
                existing.count++;
            }
        });
    });
    return Array.from(map.values()).sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [recipes, isIngModalOpen]); 

  const filteredIngredients = uniqueIngredients.filter(i => 
    i.displayName.toLowerCase().includes(ingSearch.toLowerCase())
  );

  const filteredLanguages = LANGUAGES.filter(l => 
    l.name.toLowerCase().includes(langSearch.toLowerCase()) || 
    l.code.toLowerCase().includes(langSearch.toLowerCase())
  );

  const isLangSaved = (code: string) => {
      // Built-in or existing in custom_languages
      return (code === 'en' || code === 'sv' || (settings.custom_languages && !!settings.custom_languages[code]));
  }

  const handleSelectLanguage = async (code: string) => {
      // 1. Switch Pantry Staples if cached
      let newStaples = settings.pantry_staples;
      if (settings.custom_staples && settings.custom_staples[code]) {
          newStaples = settings.custom_staples[code];
      }

      // 2. If built-in (en/sv), just switch
      if (code === 'en' || code === 'sv') {
          onUpdate({ ...settings, language: code, pantry_staples: newStaples });
          setIsLangModalOpen(false);
          return;
      }
      
      // 3. If custom existing, switch
      if (settings.custom_languages && settings.custom_languages[code]) {
          onUpdate({ ...settings, language: code, pantry_staples: newStaples });
          setIsLangModalOpen(false);
          return;
      }

      // 4. If new, generate UI
      setIsGeneratingLang(true);
      try {
          const newPack = await generateInterfaceTranslations(code, BASE_TRANSLATIONS[Language.EN]);
          // Merge into settings
          const newCustomLangs = { ...(settings.custom_languages || {}), [code]: newPack };
          onUpdate({ ...settings, custom_languages: newCustomLangs, language: code, pantry_staples: newStaples });
          setIsLangModalOpen(false);
      } catch (e) {
          alert('Failed to generate language pack.');
      } finally {
          setIsGeneratingLang(false);
      }
  };

  const handleEditIngStart = (ing: AggregatedIngredient) => {
      setEditingIng(ing);
      setEditIngName(ing.displayName);
      setEditIngCategory(ing.category);
      setEditIngUnit(ing.unit);
  };

  const handleEditIngSave = async () => {
      if (!editingIng) return;

      const oldKey = editingIng.name;
      const newName = editIngName.trim();
      const newCategory = editIngCategory;

      if (!newName) return;

      const updatedRecipes: Recipe[] = [];

      recipes.forEach(r => {
          let modified = false;
          const newIngredients = r.ingredients.map(i => {
              if (i.item_name.toLowerCase().trim() === oldKey) {
                  modified = true;
                  return {
                      ...i,
                      item_name: newName,
                      category: newCategory,
                      // unit: i.unit // Keep original unit
                  };
              }
              return i;
          });

          if (modified) {
              updatedRecipes.push({ ...r, ingredients: newIngredients });
          }
      });

      if (updatedRecipes.length > 0) {
          await onUpdateRecipes(updatedRecipes);
      }
      
      setEditingIng(null);
  };

  const handleAddStaple = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStaple.trim()) return;
    
    if (settings.pantry_staples.some(s => s.toLowerCase() === newStaple.trim().toLowerCase())) {
        setNewStaple('');
        return;
    }

    onUpdate({
        ...settings,
        pantry_staples: [...settings.pantry_staples, newStaple.trim()]
    });
    setNewStaple('');
  };

  const removeStaple = (stapleToRemove: string) => {
      onUpdate({
          ...settings,
          pantry_staples: settings.pantry_staples.filter(s => s !== stapleToRemove)
      });
  };

  const handleAddStore = (e: React.FormEvent) => {
      e.preventDefault();
      if (!newStoreName.trim()) return;
      
      const newStore: Store = {
          id: Date.now(),
          name: newStoreName.trim(),
          category_order: [...SHOPPING_CATEGORIES]
      };
      
      onUpdate({
          ...settings,
          stores: [...settings.stores, newStore]
      });
      setNewStoreName('');
  };
  
  const handleDeleteStore = (id: number) => {
      onUpdate({
          ...settings,
          stores: settings.stores.filter(s => s.id !== id)
      });
  };

  const openStoreLayout = (store: Store) => {
      setEditingStore(store);
      const existingOrder = store.category_order || [];
      const missingCategories = SHOPPING_CATEGORIES.filter(c => !existingOrder.includes(c));
      setTempCategoryOrder([...existingOrder, ...missingCategories]);
  };

  const saveStoreLayout = () => {
      if (editingStore) {
          const updatedStore = { ...editingStore, category_order: tempCategoryOrder };
          onUpdate({
              ...settings,
              stores: settings.stores.map(s => s.id === editingStore.id ? updatedStore : s)
          });
          setEditingStore(null);
      }
  };

  const confirmClearStats = async () => {
      await onClearStats();
      setShowClearStatsConfirm(false);
  };

  const confirmClearReviews = async () => {
      await onClearReviews();
      setShowClearReviewsConfirm(false);
  };

  const handleTranslateContent = async () => {
      if (isTranslating) return;
      setIsTranslating(true);
      setTranslationProgress(0);

      try {
          const targetLang = settings.language;
          const totalItems = recipes.length + 2; 
          let completed = 0;

          // 1. Recipes
          const recipesToUpdate: Recipe[] = [];
          
          for (const recipe of recipes) {
              if (recipe.lang === targetLang) {
                  // Already current language
                  completed++;
                  setTranslationProgress((completed / totalItems) * 100);
                  continue;
              }

              // Check cache
              if (recipe.translations && recipe.translations[targetLang]) {
                  const cached = recipe.translations[targetLang];
                  // Save current content to cache for the OLD language before switching
                  const oldLang = recipe.lang || 'en';
                  const currentContent = {
                      title: recipe.title,
                      description: recipe.description,
                      instructions: recipe.instructions,
                      ingredients: recipe.ingredients,
                      cuisine: recipe.cuisine
                  };
                  
                  recipesToUpdate.push({
                      ...recipe,
                      ...cached,
                      lang: targetLang,
                      translations: {
                          ...recipe.translations,
                          [oldLang]: currentContent
                      }
                  });
              } else {
                  // Call AI
                  const tr = await translateRecipe(recipe, targetLang);
                  // Save current content to cache for the OLD language
                  const oldLang = recipe.lang || 'en';
                  const currentContent = {
                      title: recipe.title,
                      description: recipe.description,
                      instructions: recipe.instructions,
                      ingredients: recipe.ingredients,
                      cuisine: recipe.cuisine
                  };
                  // Also save the NEW content to cache for future
                  const newContent = {
                      title: tr.title,
                      description: tr.description,
                      instructions: tr.instructions,
                      ingredients: tr.ingredients,
                      cuisine: tr.cuisine
                  };

                  recipesToUpdate.push({
                      ...tr,
                      translations: {
                          ...(recipe.translations || {}),
                          [oldLang]: currentContent,
                          [targetLang]: newContent
                      }
                  });
              }
              completed++;
              setTranslationProgress((completed / totalItems) * 100);
          }
          
          if (recipesToUpdate.length > 0) {
              await onUpdateRecipes(recipesToUpdate);
          }

          // 2. Shopping List
          const currentList = await storage.getShoppingList();
          const listUpdates: any[] = [];
          
          for (const item of currentList) {
              if (item.lang === targetLang) continue;
              
              // Check cache
              if (item.translations && item.translations[targetLang]) {
                  const cached = item.translations[targetLang];
                  // Save current content to translations map before swapping
                  const oldLang = item.lang || 'en';
                  
                  listUpdates.push({ 
                      ...item, 
                      item_name: cached.item_name, 
                      unit: cached.unit, 
                      lang: targetLang,
                      translations: {
                          ...item.translations,
                          [oldLang]: { item_name: item.item_name, unit: item.unit }
                      }
                  });
                  continue;
              }
              
              // We'll batch call AI for remaining items later if needed, but for simplicity here we skip batching logic inside this loop
              // A real implementation would filter uncached items and batch translate them.
              // For now, let's assume we just want to leverage the bulk translate function if list is small.
          }
          
          // Identify items needing AI (not in listUpdates yet)
          const itemsNeedingAI = currentList.filter(i => {
              // Not current language AND not already queued for update via cache
              return i.lang !== targetLang && !listUpdates.some(u => u.id === i.id);
          });
          
          if (itemsNeedingAI.length > 0) {
              const translatedItems = await translateShoppingItems(itemsNeedingAI, targetLang);
              
              // Merge results
              for (const tr of translatedItems) {
                  const original = currentList.find(i => i.id === tr.id);
                  if (original) {
                      const oldLang = original.lang || 'en';
                      listUpdates.push({
                          ...tr,
                          translations: {
                              ...(original.translations || {}),
                              [oldLang]: { item_name: original.item_name, unit: original.unit },
                              [targetLang]: { item_name: tr.item_name, unit: tr.unit }
                          }
                      });
                  }
              }
          }
          
          // Merge updates into final list
          const finalShoppingList = currentList.map(item => {
              const update = listUpdates.find(u => u.id === item.id);
              return update || item;
          });
          
          if (listUpdates.length > 0) {
              await storage.saveShoppingList(finalShoppingList);
          }
          
          completed++;
          setTranslationProgress((completed / totalItems) * 100);

          // 3. Staples
          // Check if we have cached staples
          if (settings.custom_staples && settings.custom_staples[targetLang]) {
              onUpdate({ ...settings, pantry_staples: settings.custom_staples[targetLang] });
          } else {
              const translatedStaples = await translateStrings(settings.pantry_staples, targetLang);
              const newCustomStaples = {
                  ...(settings.custom_staples || {}),
                  [targetLang]: translatedStaples,
                  // Also cache the source just in case
                  [settings.language || 'en']: settings.pantry_staples
              };
              onUpdate({ ...settings, pantry_staples: translatedStaples, custom_staples: newCustomStaples });
          }
          completed++;
          setTranslationProgress(100);

      } catch (e) {
          console.error("Translation failed", e);
      } finally {
          setIsTranslating(false);
      }
  };

  // --- Export Logic ---
  const downloadFile = (content: string, fileName: string) => {
      const blob = new Blob([content], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  const handleExportRecipes = () => {
      const dataStr = JSON.stringify(recipes, null, 2);
      downloadFile(dataStr, `homechef_recipes_${new Date().toISOString().split('T')[0]}.json`);
  };

  const handleExportHistory = () => {
      const dataStr = JSON.stringify(plan, null, 2);
      downloadFile(dataStr, `homechef_history_${new Date().toISOString().split('T')[0]}.json`);
  };

  // Drag and Drop Handlers
  const handleDragStart = (index: number) => {
      setDraggedItemIndex(index);
      if (navigator.vibrate) navigator.vibrate(50);
  };
  
  const handleDragEnter = (index: number) => {
      if (draggedItemIndex === null) return;
      if (draggedItemIndex !== index) {
          setDragOverItemIndex(index);
          const newOrder = [...tempCategoryOrder];
          const draggedItem = newOrder[draggedItemIndex];
          newOrder.splice(draggedItemIndex, 1);
          newOrder.splice(index, 0, draggedItem);
          setTempCategoryOrder(newOrder);
          setDraggedItemIndex(index); 
      }
  };

  const handleDragEnd = () => {
      setDraggedItemIndex(null);
      setDragOverItemIndex(null);
  };
  
  const handleTouchStart = (index: number) => {
      longPressTimer.current = setTimeout(() => {
          handleDragStart(index);
      }, 300);
  };

  const handleTouchEnd = () => {
      if (longPressTimer.current) clearTimeout(longPressTimer.current);
      handleDragEnd();
  };

  const handleTouchMove = (e: React.TouchEvent) => {
      if (draggedItemIndex === null) return;
      e.preventDefault(); 
      const touch = e.touches[0];
      const target = document.elementFromPoint(touch.clientX, touch.clientY);
      const row = target?.closest('[data-index]');
      if (row) {
          const index = parseInt(row.getAttribute('data-index') || '-1');
          if (index !== -1) {
              handleDragEnter(index);
          }
      }
  };

  return (
    <div className="pb-24 space-y-3">
      <div className="px-1">
        <h1 className="text-xl font-bold text-nordic-text">{t.settings_title}</h1>
      </div>

      <Card className="divide-y divide-gray-100 rounded-xl">
        {/* Language Section */}
        <div className="p-3 flex items-center justify-between">
          <div>
            <h3 className="font-medium text-sm">{t.language}</h3>
            <p className="text-[10px] text-gray-500">{t.interfaceLanguage}</p>
          </div>
          <Button variant="secondary" onClick={() => setIsLangModalOpen(true)} className="!py-1.5 !px-3 h-8 text-xs font-medium">
             <span className="uppercase">{settings.language}</span>
             <Icons.ChevronDown className="w-3 h-3 ml-1" />
          </Button>
        </div>

        {/* Week Start Day */}
        <div className="p-3 flex items-center justify-between">
           <div>
              <h3 className="font-medium text-sm">{t.weekStart}</h3>
           </div>
           <div className="flex bg-gray-100 p-1 rounded-lg">
               {[1, 6, 0].map(day => (
                   <button 
                       key={day}
                       onClick={() => onUpdate({...settings, week_start_day: day})}
                       className={`px-3 py-1 text-xs rounded-md transition-all ${settings.week_start_day === day ? 'bg-white shadow-sm font-medium text-nordic-primary' : 'text-gray-500'}`}
                   >
                       {day === 1 ? t.monday : day === 6 ? t.saturday : t.sunday}
                   </button>
               ))}
           </div>
        </div>

        {/* Translation Section */}
        <div className="p-3">
            <h3 className="font-medium text-sm">{t.translateTitle}</h3>
            <p className="text-[10px] text-gray-500 mb-3">{t.translateDesc}</p>
            <Button 
                variant="secondary" 
                onClick={handleTranslateContent} 
                disabled={isTranslating} 
                className="w-full text-xs h-9 relative overflow-hidden"
            >
                <div className={`absolute inset-0 bg-nordic-primary/10 transition-all duration-300`} style={{ width: `${translationProgress}%` }} />
                <span className="relative z-10 flex items-center gap-2">
                    {isTranslating ? (
                        <>
                           <div className="w-3 h-3 border-2 border-gray-300 border-t-nordic-primary rounded-full animate-spin" />
                           {t.translating} ({Math.round(translationProgress)}%)
                        </>
                    ) : (
                        <><Icons.Sparkles className="w-3.5 h-3.5 text-nordic-accent" /> {t.translateBtn}</>
                    )}
                </span>
            </Button>
        </div>

        {/* AI Provider Section */}
        <div className="p-3">
            <h3 className="font-medium text-sm mb-2">{t.aiSettings}</h3>
            <div className="space-y-3">
                <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">{t.provider}</span>
                    <div className="flex bg-gray-100 p-1 rounded-lg">
                        <button 
                            onClick={() => onUpdate({...settings, ai_provider: 'gemini'})}
                            className={`px-3 py-1 text-xs rounded-md transition-all ${settings.ai_provider === 'gemini' ? 'bg-white shadow-sm font-medium text-nordic-primary' : 'text-gray-500'}`}
                        >
                            Gemini
                        </button>
                        <button 
                            onClick={() => onUpdate({...settings, ai_provider: 'openai'})}
                            className={`px-3 py-1 text-xs rounded-md transition-all ${settings.ai_provider === 'openai' ? 'bg-white shadow-sm font-medium text-nordic-primary' : 'text-gray-500'}`}
                        >
                            OpenAI
                        </button>
                    </div>
                </div>
                {settings.ai_provider === 'openai' && (
                    <div className="animate-in slide-in-from-top-1">
                        <label className="text-[10px] text-gray-500 mb-1 block">{t.openaiKey}</label>
                        <Input 
                            type="password"
                            value={settings.openai_api_key || ''}
                            onChange={(e: any) => onUpdate({...settings, openai_api_key: e.target.value})}
                            placeholder={t.keyPlaceholder}
                            className="!py-1.5 !px-2 text-sm"
                        />
                    </div>
                )}
            </div>
        </div>

        {/* Ingredients Database Section */}
        <div className="p-3">
            <h3 className="font-medium text-sm">{t.ingredientsDb}</h3>
            <p className="text-[10px] text-gray-500 mb-3">{t.ingredientsDesc}</p>
            <Button variant="secondary" onClick={() => setIngModalOpen(true)} className="w-full text-xs h-8">
                <Icons.Tool className="w-3.5 h-3.5" /> {t.manageIngredients}
            </Button>
        </div>
        
        {/* Household Section */}
        <div className="p-3">
           <h3 className="font-medium text-sm mb-3">{t.household}</h3>
           <div className="flex gap-4">
              <div className="flex-1">
                  <label className="text-[10px] text-gray-500 mb-1 block">{t.adults}</label>
                  <Input 
                    type="number" 
                    min={1} 
                    value={settings.default_adults}
                    onChange={(e: any) => onUpdate({...settings, default_adults: parseInt(e.target.value) || 0})}
                    className="!py-1.5 !px-2 text-sm"
                  />
              </div>
              <div className="flex-1">
                  <label className="text-[10px] text-gray-500 mb-1 block">{t.kids}</label>
                  <Input 
                    type="number" 
                    min={0} 
                    value={settings.default_kids}
                    onChange={(e: any) => onUpdate({...settings, default_kids: parseInt(e.target.value) || 0})}
                    className="!py-1.5 !px-2 text-sm"
                  />
              </div>
           </div>
        </div>

        {/* Stores Section */}
        <div className="p-3">
            <h3 className="font-medium text-sm">{t.stores}</h3>
            <p className="text-[10px] text-gray-500 mb-3">{t.storesDesc}</p>

            <div className="space-y-2 mb-3">
                {settings.stores.map(store => (
                    <div key={store.id} className="flex items-center justify-between bg-gray-50 p-2 rounded-lg border border-gray-100">
                        <div className="flex items-center gap-2">
                            <Icons.Store className="w-4 h-4 text-nordic-primary" />
                            <span className="text-sm font-medium">{store.name}</span>
                        </div>
                        <div className="flex items-center gap-1">
                            <Button variant="secondary" onClick={() => openStoreLayout(store)} className="!py-1.5 !px-2 text-[10px] h-7">
                                {t.editLayout}
                            </Button>
                            <Button variant="danger" onClick={() => handleDeleteStore(store.id)} className="!py-1.5 !px-2 text-[10px] h-7 bg-white border border-red-100">
                                <Icons.Trash className="w-3.5 h-3.5" />
                            </Button>
                        </div>
                    </div>
                ))}
            </div>

            <form onSubmit={handleAddStore} className="flex gap-2">
                <Input 
                    value={newStoreName}
                    onChange={(e: any) => setNewStoreName(e.target.value)}
                    placeholder={t.storePlaceholder}
                    className="flex-1 !py-1.5 !px-2 text-sm"
                />
                <Button type="submit" variant="secondary" disabled={!newStoreName.trim()} className="text-xs !py-1.5 !px-3">
                    {t.addStore}
                </Button>
            </form>
        </div>

        {/* Pantry Staples Section */}
        <div className="p-3">
            <h3 className="font-medium text-sm">{t.pantryStaples}</h3>
            <p className="text-[10px] text-gray-500 mb-3">{t.pantryDesc}</p>

            <form onSubmit={handleAddStaple} className="flex gap-2 mb-3">
                <Input 
                    value={newStaple}
                    onChange={(e: any) => setNewStaple(e.target.value)}
                    placeholder={t.staplePlaceholder}
                    className="flex-1 !py-1.5 !px-2 text-sm"
                />
                <Button type="submit" variant="secondary" disabled={!newStaple.trim()} className="text-xs !py-1.5 !px-3">
                    {t.addStaple}
                </Button>
            </form>

            <div className="flex flex-wrap gap-1.5">
                {settings.pantry_staples.map((staple, idx) => (
                    <div key={idx} className="bg-gray-100 text-slate-700 px-2 py-1 rounded-md text-xs flex items-center gap-1.5 group hover:bg-red-50 hover:text-red-600 transition-colors cursor-pointer" onClick={() => removeStaple(staple)}>
                        {staple}
                        <Icons.X className="w-3 h-3 opacity-50 group-hover:opacity-100" />
                    </div>
                ))}
            </div>
        </div>
      </Card>
      
      {/* Export & Data Management sections */}
      <Card className="rounded-xl p-3 bg-indigo-50/50 border-indigo-100">
          <h3 className="font-bold text-sm text-indigo-900 mb-2">{t.exportData}</h3>
          <p className="text-[10px] text-indigo-700/70 mb-3">{t.exportDesc}</p>
          <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={handleExportRecipes} className="text-xs h-9 bg-white border-indigo-200 text-indigo-800 hover:bg-indigo-50">
                  <Icons.Recipes className="w-4 h-4" /> {t.exportRecipes}
              </Button>
              <Button variant="secondary" onClick={handleExportHistory} className="text-xs h-9 bg-white border-indigo-200 text-indigo-800 hover:bg-indigo-50">
                  <Icons.Chart className="w-4 h-4" /> {t.exportHistory}
              </Button>
          </div>
      </Card>

      <Card className="rounded-xl p-3 border-red-100 bg-red-50/30">
          <h3 className="font-bold text-sm text-red-900 mb-2">{t.dataManagement}</h3>
          
          <div className="mb-3">
              <p className="text-[10px] text-red-700/70 mb-2">{t.clearStatsDesc}</p>
              <Button variant="danger" onClick={() => setShowClearStatsConfirm(true)} className="w-full text-xs h-9 bg-red-100 hover:bg-red-200 border-red-200 text-red-700">
                 <Icons.Trash className="w-4 h-4" /> {t.clearStats}
              </Button>
          </div>

          <div className="border-t border-red-200/50 pt-3">
              <p className="text-[10px] text-red-700/70 mb-2">{t.clearReviewsDesc}</p>
              <Button variant="danger" onClick={() => setShowClearReviewsConfirm(true)} className="w-full text-xs h-9 bg-red-100 hover:bg-red-200 border-red-200 text-red-700">
                 <Icons.Star className="w-4 h-4" /> {t.clearReviews}
              </Button>
          </div>
      </Card>

      <div className="text-center">
         <p className="text-[10px] text-gray-400">{t.version}</p>
      </div>

      {/* Language Modal */}
      <Modal isOpen={isLangModalOpen} onClose={() => setIsLangModalOpen(false)} title={t.selectLanguage}>
           <div className="h-[60vh] flex flex-col">
               <div className="mb-4">
                   <Input 
                      placeholder={t.searchLanguage}
                      value={langSearch}
                      onChange={(e: any) => setLangSearch(e.target.value)}
                      className="text-sm"
                   />
               </div>
               {isGeneratingLang ? (
                   <div className="flex-1 flex flex-col items-center justify-center text-nordic-muted">
                        <Icons.Sparkles className="w-8 h-8 animate-spin mb-2" />
                        <p>{t.generatingPack}</p>
                   </div>
               ) : (
                   <div className="flex-1 overflow-y-auto space-y-1">
                       {filteredLanguages.map(lang => {
                           const saved = isLangSaved(lang.code);
                           return (
                               <button 
                                   key={lang.code} 
                                   onClick={() => handleSelectLanguage(lang.code)}
                                   className={`w-full text-left p-3 rounded-xl flex items-center justify-between transition-colors ${settings.language === lang.code ? 'bg-nordic-primary text-white' : 'hover:bg-gray-50'}`}
                               >
                                   <div className="flex items-center gap-2">
                                       <span className="font-medium">{lang.name}</span>
                                       {saved && (
                                           <span className={`text-[9px] px-1.5 py-0.5 rounded-md font-bold uppercase ${settings.language === lang.code ? 'bg-white/20 text-white' : 'bg-green-100 text-green-700'}`}>
                                               Saved
                                           </span>
                                       )}
                                   </div>
                                   <span className={`text-xs uppercase ${settings.language === lang.code ? 'text-white/80' : 'text-gray-400'}`}>{lang.code}</span>
                               </button>
                           );
                       })}
                   </div>
               )}
           </div>
      </Modal>

      {/* Confirmation Modal for Clear Stats */}
      <Modal isOpen={showClearStatsConfirm} onClose={() => setShowClearStatsConfirm(false)} title={t.areYouSure}>
          <div className="space-y-4">
              <p className="text-sm text-gray-600">{t.clearStatsConfirm}</p>
              <div className="flex gap-2">
                  <Button variant="danger" onClick={confirmClearStats} className="flex-1">
                      {t.deleteGeneric}
                  </Button>
                  <Button variant="secondary" onClick={() => setShowClearStatsConfirm(false)} className="flex-1">
                      {t.cancel}
                  </Button>
              </div>
          </div>
      </Modal>

      {/* Confirmation Modal for Clear Reviews */}
      <Modal isOpen={showClearReviewsConfirm} onClose={() => setShowClearReviewsConfirm(false)} title={t.areYouSure}>
          <div className="space-y-4">
              <p className="text-sm text-gray-600">{t.clearReviewsConfirm}</p>
              <div className="flex gap-2">
                  <Button variant="danger" onClick={confirmClearReviews} className="flex-1">
                      {t.deleteGeneric}
                  </Button>
                  <Button variant="secondary" onClick={() => setShowClearReviewsConfirm(false)} className="flex-1">
                      {t.cancel}
                  </Button>
              </div>
          </div>
      </Modal>

      {/* Store Layout Modal */}
      <Modal isOpen={!!editingStore} onClose={() => setEditingStore(null)} title={t.layoutTitle}>
           <div className="space-y-4">
               <p className="text-xs text-gray-500">{t.layoutDesc}</p>
               
               <div 
                  className="space-y-1.5 max-h-[60vh] overflow-y-auto" 
                  onTouchMove={handleTouchMove}
               >
                   {tempCategoryOrder.map((cat, index) => {
                       const isDragging = draggedItemIndex === index;
                       return (
                           <div 
                               key={cat}
                               data-index={index}
                               draggable
                               onDragStart={() => handleDragStart(index)}
                               onDragEnter={() => handleDragEnter(index)}
                               onDragEnd={handleDragEnd}
                               onTouchStart={() => handleTouchStart(index)}
                               onTouchEnd={handleTouchEnd}
                               className={`
                                  flex items-center justify-between p-3 rounded-xl border border-gray-100 cursor-grab active:cursor-grabbing select-none transition-all
                                  ${isDragging ? 'bg-nordic-primary text-white shadow-lg scale-105 z-10' : 'bg-white text-gray-700 hover:bg-gray-50'}
                               `}
                           >
                               <span className="font-medium text-sm">{cat}</span>
                               <Icons.GripVertical className={`w-4 h-4 ${isDragging ? 'text-white' : 'text-gray-300'}`} />
                           </div>
                       );
                   })}
               </div>

               <div className="flex gap-2 pt-2">
                   <Button onClick={saveStoreLayout} className="flex-1">{t.saveLayout}</Button>
               </div>
           </div>
      </Modal>

      {/* Ingredients Management Modal */}
      <Modal isOpen={isIngModalOpen} onClose={() => setIngModalOpen(false)} padding="p-0">
          <div className="flex flex-col h-[80vh]">
              <div className="flex flex-col border-b border-gray-100">
                  <div className="flex items-center justify-between p-4 sm:p-6 pb-2">
                    <h2 className="text-xl font-bold text-nordic-text">{t.ingModalTitle}</h2>
                    <button onClick={() => setIngModalOpen(false)} className="p-2 bg-gray-100 rounded-full hover:bg-gray-200 transition-colors">
                        <Icons.X className="w-5 h-5 text-gray-500" />
                    </button>
                  </div>
                  <div className="px-4 pb-4 sm:px-6 sm:pb-6">
                    <Input 
                        placeholder={t.searchIngredients}
                        value={ingSearch}
                        onChange={(e: any) => setIngSearch(e.target.value)}
                        className="text-sm"
                    />
                  </div>
              </div>
              <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-2">
                  {filteredIngredients.map(ing => {
                      const isEditing = editingIng?.name === ing.name;
                      return (
                          <div key={ing.name} className="bg-white border border-gray-100 rounded-xl p-3 shadow-sm">
                              {isEditing ? (
                                  <div className="space-y-3">
                                      <div>
                                          <label className="text-[10px] text-gray-500 uppercase font-bold">Name</label>
                                          <Input value={editIngName} onChange={(e: any) => setEditIngName(e.target.value)} className="!py-1.5 !px-2 text-sm" />
                                      </div>
                                      <div className="flex gap-2">
                                          <div className="flex-1">
                                             <label className="text-[10px] text-gray-500 uppercase font-bold">{t.typicalUnit}</label>
                                             <Input 
                                                value={editIngUnit} 
                                                disabled={true} 
                                                className="!py-1.5 !px-2 text-sm bg-gray-100 text-gray-500 border-transparent" 
                                             />
                                          </div>
                                          <div className="flex-1">
                                             <label className="text-[10px] text-gray-500 uppercase font-bold">Category</label>
                                             <select 
                                                 value={editIngCategory} 
                                                 onChange={(e) => setEditIngCategory(e.target.value)}
                                                 className="w-full py-1.5 px-2 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none"
                                             >
                                                 {SHOPPING_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                                             </select>
                                          </div>
                                      </div>
                                      <div className="flex gap-2 pt-1">
                                          <Button onClick={handleEditIngSave} className="flex-1 h-8 text-xs">{t.saveIng}</Button>
                                          <Button variant="secondary" onClick={() => setEditingIng(null)} className="flex-1 h-8 text-xs">{t.cancelIng}</Button>
                                      </div>
                                  </div>
                              ) : (
                                  <div className="flex items-center justify-between">
                                      <div>
                                          <p className="font-bold text-sm text-nordic-text">{ing.displayName}</p>
                                          <div className="flex items-center gap-2 mt-0.5">
                                              <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 rounded text-gray-500">{ing.category}</span>
                                              <span className="text-[10px] text-gray-400">•</span>
                                              <span className="text-[10px] text-gray-500">{ing.unit}</span>
                                              <span className="text-[10px] text-gray-400">•</span>
                                              <span className="text-[10px] text-gray-400">{ing.count} {t.ingCount}</span>
                                          </div>
                                      </div>
                                      <Button variant="ghost" onClick={() => handleEditIngStart(ing)} className="!p-2 h-8 w-8 rounded-full">
                                          <Icons.Edit className="w-4 h-4" />
                                      </Button>
                                  </div>
                              )}
                          </div>
                      );
                  })}
              </div>
          </div>
      </Modal>
    </div>
  );
};