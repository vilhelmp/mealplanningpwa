import React, { useState, useRef, useEffect, useMemo } from 'react';
import { AppSettings, Language, Store, SHOPPING_CATEGORIES, Recipe, Ingredient, MealPlanItem } from '../types';
import { Card, Button, Input, Icons, Modal } from './Shared';

interface SettingsViewProps {
  settings: AppSettings;
  onUpdate: (newSettings: AppSettings) => void;
  recipes: Recipe[];
  plan: MealPlanItem[];
  onUpdateRecipes: (recipes: Recipe[]) => Promise<void>;
  onClearStats: () => Promise<void>;
  onClearReviews: () => Promise<void>;
}

const translations = {
  [Language.EN]: {
    title: "Settings",
    language: "Language",
    interfaceLanguage: "Interface language",
    household: "Household Defaults",
    adults: "Adults",
    kids: "Kids",
    pantryStaples: "Pantry Staples",
    pantryDesc: "Items to always ignore on shopping lists.",
    addStaple: "Add",
    staplePlaceholder: "e.g. Salt, Oil...",
    stores: "Stores & Layouts",
    storesDesc: "Manage stores and aisle order.",
    addStore: "Add Store",
    storePlaceholder: "e.g. Supermarket A...",
    editLayout: "Edit Layout",
    layoutTitle: "Category Order",
    layoutDesc: "Touch & hold to drag categories into aisle order.",
    deleteStore: "Delete",
    save: "Save",
    version: "HomeChef Hub v0.1.0 (PWA)",
    ingredientsDb: "Ingredients Database",
    ingredientsDesc: "Manage typical units and categories for ingredients across all recipes.",
    manageIngredients: "Manage Ingredients",
    ingModalTitle: "Ingredients",
    searchIngredients: "Search ingredients...",
    typicalUnit: "Typical Unit (Locked)",
    ingCount: "recipes",
    saveIng: "Update",
    cancelIng: "Cancel",
    dataManagement: "Data Management",
    clearStats: "Clear Statistics",
    clearStatsDesc: "Delete all past meal history and statistics.",
    clearReviews: "Clear Reviews",
    clearReviewsDesc: "Remove all ratings and comments from past meals.",
    exportData: "Export Data",
    exportDesc: "Download your recipes and meal history as JSON files.",
    exportRecipes: "Export Recipes",
    exportHistory: "Export Meal History",
    areYouSure: "Are you sure?",
    clearStatsConfirm: "This will permanently delete your meal history. You cannot undo this.",
    clearReviewsConfirm: "This will permanently delete all your meal ratings and comments. You cannot undo this.",
    delete: "Delete",
    cancel: "Cancel"
  },
  [Language.SV]: {
    title: "Inställningar",
    language: "Språk",
    interfaceLanguage: "Gränssnittsspråk",
    household: "Hushållsinställningar",
    adults: "Vuxna",
    kids: "Barn",
    pantryStaples: "Skafferi & Basvaror",
    pantryDesc: "Varor som inte ska läggas på inköpslistan.",
    addStaple: "Lägg till",
    staplePlaceholder: "t.ex. Salt, Olja...",
    stores: "Butiker & Layout",
    storesDesc: "Hantera butiker och gångordning.",
    addStore: "Ny Butik",
    storePlaceholder: "t.ex. ICA Maxi...",
    editLayout: "Redigera Layout",
    layoutTitle: "Kategoriordning",
    layoutDesc: "Håll och dra för att ändra ordning.",
    deleteStore: "Ta bort",
    save: "Spara",
    version: "HomeChef Hub v0.1.0 (PWA)",
    ingredientsDb: "Ingrediensdatabas",
    ingredientsDesc: "Hantera enheter och kategorier för ingredienser i alla recept.",
    manageIngredients: "Hantera Ingredienser",
    ingModalTitle: "Ingredienser",
    searchIngredients: "Sök ingredienser...",
    typicalUnit: "Vanlig enhet (Låst)",
    ingCount: "recept",
    saveIng: "Uppdatera",
    cancelIng: "Avbryt",
    dataManagement: "Datahantering",
    clearStats: "Rensa Statistik",
    clearStatsDesc: "Radera all historik och statistik.",
    clearReviews: "Rensa Omdömen",
    clearReviewsDesc: "Ta bort alla betyg och kommentarer.",
    exportData: "Exportera Data",
    exportDesc: "Ladda ner dina recept och mathistorik som JSON-filer.",
    exportRecipes: "Exportera Recept",
    exportHistory: "Exportera Mathistorik",
    areYouSure: "Är du säker?",
    clearStatsConfirm: "Detta kommer permanent radera din mathistorik. Detta kan inte ångras.",
    clearReviewsConfirm: "Detta kommer permanent radera alla dina betyg och kommentarer. Detta kan inte ångras.",
    delete: "Radera",
    cancel: "Avbryt"
  }
};

interface AggregatedIngredient {
    name: string; // Lowercase key
    displayName: string; // Display Name (first encountered)
    category: string;
    unit: string;
    count: number;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ settings, onUpdate, recipes, plan, onUpdateRecipes, onClearStats, onClearReviews }) => {
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

  // Drag State for Category Sorting
  const [draggedItemIndex, setDraggedItemIndex] = useState<number | null>(null);
  const [dragOverItemIndex, setDragOverItemIndex] = useState<number | null>(null);
  const longPressTimer = useRef<any>(null);

  const t = translations[settings.language] || translations[Language.EN];

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
  }, [recipes, isIngModalOpen]); // Recalculate when modal opens to ensure fresh data

  const filteredIngredients = uniqueIngredients.filter(i => 
    i.displayName.toLowerCase().includes(ingSearch.toLowerCase())
  );

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
    
    // Avoid duplicates
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
      // Ensure all current categories are present in the order, append new ones at the end if missing
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
      // Export entire plan (which includes history and future)
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
          
          // Reorder locally for visual feedback immediately
          const newOrder = [...tempCategoryOrder];
          const draggedItem = newOrder[draggedItemIndex];
          newOrder.splice(draggedItemIndex, 1);
          newOrder.splice(index, 0, draggedItem);
          
          setTempCategoryOrder(newOrder);
          setDraggedItemIndex(index); // Update index to track the item's new position
      }
  };

  const handleDragEnd = () => {
      setDraggedItemIndex(null);
      setDragOverItemIndex(null);
  };
  
  // Touch support for drag
  const handleTouchStart = (index: number) => {
      longPressTimer.current = setTimeout(() => {
          handleDragStart(index);
      }, 300); // 300ms delay for touch-hold
  };

  const handleTouchEnd = () => {
      if (longPressTimer.current) clearTimeout(longPressTimer.current);
      handleDragEnd();
  };

  const handleTouchMove = (e: React.TouchEvent) => {
      if (draggedItemIndex === null) return;
      e.preventDefault(); // Prevent scrolling
      
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
        <h1 className="text-xl font-bold text-nordic-text">{t.title}</h1>
      </div>

      <Card className="divide-y divide-gray-100 rounded-xl">
        {/* Language Section */}
        <div className="p-3 flex items-center justify-between">
          <div>
            <h3 className="font-medium text-sm">{t.language}</h3>
            <p className="text-[10px] text-gray-500">{t.interfaceLanguage}</p>
          </div>
          <div className="flex bg-gray-100 p-1 rounded-lg">
             <button 
                onClick={() => onUpdate({...settings, language: Language.SV})}
                className={`px-3 py-1 text-xs rounded-md transition-all ${settings.language === Language.SV ? 'bg-white shadow-sm font-medium' : 'text-gray-500'}`}
             >
                SV
             </button>
             <button 
                onClick={() => onUpdate({...settings, language: Language.EN})}
                className={`px-3 py-1 text-xs rounded-md transition-all ${settings.language === Language.EN ? 'bg-white shadow-sm font-medium' : 'text-gray-500'}`}
             >
                EN
             </button>
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
      
      {/* Export Section */}
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

      {/* Data Management Section */}
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

      {/* Confirmation Modal for Clear Stats */}
      <Modal isOpen={showClearStatsConfirm} onClose={() => setShowClearStatsConfirm(false)} title={t.areYouSure}>
          <div className="space-y-4">
              <p className="text-sm text-gray-600">{t.clearStatsConfirm}</p>
              <div className="flex gap-2">
                  <Button variant="danger" onClick={confirmClearStats} className="flex-1">
                      {t.delete}
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
                      {t.delete}
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
                   <Button onClick={saveStoreLayout} className="flex-1">{t.save}</Button>
               </div>
           </div>
      </Modal>

      {/* Ingredients Management Modal */}
      <Modal isOpen={isIngModalOpen} onClose={() => setIngModalOpen(false)} title={t.ingModalTitle} padding="p-0">
          <div className="flex flex-col h-[80vh]">
              <div className="p-4 border-b border-gray-100">
                  <Input 
                      placeholder={t.searchIngredients}
                      value={ingSearch}
                      onChange={(e: any) => setIngSearch(e.target.value)}
                      className="text-sm"
                  />
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-2">
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